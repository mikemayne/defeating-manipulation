"""Compare sparse and frozen local encoders on the same SIR benchmark."""
import json
import argparse
import os
import subprocess
import sys
from pathlib import Path

import numpy as np
import torch
from scipy.sparse import csr_matrix, hstack
from sklearn.feature_extraction import DictVectorizer
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, confusion_matrix
from sklearn.model_selection import StratifiedGroupKFold
from sklearn.preprocessing import normalize
from transformers import AutoModel, AutoTokenizer

from prepare import ARTIFACTS, ROOT

CACHE = ARTIFACTS / "pressure"
TARGETS = {"fear_consequences", "judgement_doubt"}
ARMS = ["words", "words+sir", "encoder", "encoder+sir", "encoder+sir+links"]


def read(path):
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]


def dataset():
    rows = read(CACHE / "targeted/labels.jsonl")
    partitions, seen, threads = {}, set(), {}
    for part in ["train", "calibration", "test", "transfer"]:
        selected = []
        pool = read(CACHE / "labels.jsonl") if part == "transfer" else rows
        for row in pool:
            if part == "transfer":
                if row["thread"] in threads or "insufficient_context" in row["labels"]:
                    continue
            elif row["part"] != part:
                continue
            else:
                assert threads.setdefault(row["thread"], part) == part
            key = " ".join(row["text"].lower().split())
            if key not in seen:
                selected.append(row)
                seen.add(key)
        partitions[part] = selected
    return partitions


def structures(rows):
    result = subprocess.run([os.getenv("NODE", "node"), str(ROOT.parent / "scripts/sir-pressure-inputs.mjs")],
                            input="".join(json.dumps(r["text"])+"\n" for r in rows), capture_output=True,
                            encoding="utf-8", check=True)
    return [json.loads(line) for line in result.stdout.splitlines()]


def encode(texts):
    path = ARTIFACTS / "encoders/MiniLM-L6"
    device = "cuda" if torch.cuda.is_available() else "cpu"
    tokenizer = AutoTokenizer.from_pretrained(path, local_files_only=True)
    model = AutoModel.from_pretrained(path, local_files_only=True).to(device).eval()
    unique = list(dict.fromkeys(texts))
    vectors = {}
    with torch.inference_mode():
        for start in range(0, len(unique), 64):
            batch = unique[start:start+64]
            inputs = tokenizer(batch, padding=True, truncation=True, max_length=256,
                               return_tensors="pt").to(device)
            hidden = model(**inputs).last_hidden_state
            mask = inputs.attention_mask.unsqueeze(-1)
            pooled = (hidden * mask).sum(1) / mask.sum(1)
            vectors.update(zip(batch, normalize(pooled.cpu().numpy())))
    return vectors


def metrics(y, flags):
    tn, fp, fn, tp = confusion_matrix(y, flags, labels=[0, 1]).ravel().tolist()
    return dict(tp=tp, fp=fp, fn=fn, tn=tn, f1=round(2*tp/(2*tp+fp+fn), 4))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--refine", action="store_true",
                        help="Compare a second round using training folds only")
    parser.add_argument("--stdin", action="store_true", help="Score one passage with the selected local model")
    args = parser.parse_args()
    if args.stdin and args.refine:
        parser.error("--stdin and --refine are separate modes")
    data = dataset()
    if args.refine:
        data = {"train": data["train"]}
    if args.stdin:
        text = sys.stdin.read().strip()
        if not 1 <= len(text) <= 4800:
            parser.error("Expected a passage of 1 to 4800 characters")
        data = {p: data[p] for p in ("train", "calibration")}
        data["input"] = [dict(text=text, labels=[])]
    rows = sum(data.values(), [])
    texts = np.array([r["text"] for r in rows])
    y = np.array([bool(TARGETS.intersection(r["labels"])) for r in rows])
    sir = structures(rows)
    features = [{"cue/"+cue: 1 for cue in s["cues"]} for s in sir]
    pairs = [s["links"] for s in sir]
    vectors = encode([*texts, *(t for group in pairs for pair in group for t in pair)])
    passage = csr_matrix(np.stack([vectors[t] for t in texts]))
    zero = np.zeros(passage.shape[1])
    links = csr_matrix(np.stack([np.concatenate([
        np.mean([vectors[p[i]] for p in group], axis=0) if group else zero for i in (0, 1)
    ]) for group in pairs]))
    train = np.arange(len(data["train"]))
    folds = list(StratifiedGroupKFold(5, shuffle=True, random_state=191).split(
        train, y[train], [r["thread"] for r in data["train"]]))

    def matrices(fit):
        words = TfidfVectorizer(ngram_range=(1, 2), min_df=2, sublinear_tf=True).fit(texts[fit]).transform(texts)
        cue = normalize(DictVectorizer().fit([features[i] for i in fit]).transform(features))
        base = [words, hstack([words, cue]).tocsr(), passage, hstack([passage, cue]).tocsr(),
                hstack([passage, cue, links]).tocsr()]

        if args.refine:
            base.extend([hstack([words, base[-1]]).tocsr(), base[4], base[4]])
        return base

    names = ARMS + (["linked+words", "linked_C0.25", "linked_C4"] if args.refine else [])
    def scores(x, fit, evaluate, strength=1):
        model = LogisticRegression(C=strength, class_weight="balanced", max_iter=1000)
        return model.fit(x[fit], y[fit]).decision_function(x[evaluate])

    oof = np.zeros((len(names), len(train)))
    for fit, val in folds:
        for a, x in enumerate(matrices(fit)):
            oof[a, val] = scores(x, fit, val, {"linked_C0.25": 0.25, "linked_C4": 4}.get(names[a], 1))
    aps = [average_precision_score(y[train], p) for p in oof]
    # Prefer the simpler arm within one AP percentage point of the best.
    if args.refine:
        print(json.dumps(dict(zip(names, aps)), indent=2))
        return
    winner = next(i for i, ap in enumerate(aps) if ap >= max(aps)-0.01)
    output = {"cv_average_precision": dict(zip(ARMS, aps)), "selected": ARMS[winner]}
    x = matrices(train)[winner]
    predicted = scores(x, train, np.arange(len(rows)))
    baseline = np.array([s["baseline"] for s in sir])
    start = len(train)
    for part in list(data)[1:]:
        ix = np.arange(start, start+len(data[part]))
        gold, raw = y[ix], predicted[ix]
        if part == "input":
            print(json.dumps(dict(flagged=bool(raw[0] >= cutoff), score=float(raw[0]),
                                  calibration_cutoff=float(cutoff), linked_pairs=len(pairs[start]))))
            return
        reference = metrics(gold, baseline[ix])
        if part == "calibration":
            cutoff = np.sort(raw[gold])[::-1][reference["tp"]-1]
        # Diagnostic threshold for a matched-sensitivity comparison on this split.
        matched = np.sort(raw[gold])[::-1][reference["tp"]-1]
        output[part] = dict(original=reference, candidate=metrics(gold, raw>=cutoff),
                            matched=metrics(gold, raw>=matched))
        start += len(ix)
    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
