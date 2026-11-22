"""Compare real-data distillation at two encoder sizes with a held-out group split."""
import json
import shutil
from pathlib import Path

import numpy as np
from scipy.special import expit
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import GroupShuffleSplit
from sklearn.neighbors import NearestNeighbors

import train
from prepare import ARTIFACTS, ROOT
from qwen_bench import KEYS, excerpts, metrics
from serve import WEB

EXPERIMENT = ARTIFACTS / "distillation"
OUTPUT = EXPERIMENT / "web"
MODELS = {"Recalibrated-L6": None, "Distilled-L6": "MiniLM-L6", "Distilled-L12": "MiniLM-L12"}
SEED = 6291

def load_rows():
    log = ARTIFACTS / "qwen-agreement-strict.jsonl"
    references = [json.loads(line) for line in log.read_text(encoding="utf8").splitlines()]
    _, pools = excerpts(ROOT / "private" / "conclugen-base-train.parquet")
    by_hash = {identifier: (track, text) for pool in pools.values() for track, identifier, text in pool}
    rows = []
    for ref in references:
        track, text = by_hash[ref["id"]]
        if track != ref["track"]:
            raise ValueError("Corpus and benchmark log disagree.")
        rows.append({**ref, "text": text, "labels": [KEYS[i] for i in ref["qwen"]]})
    return rows

def split(rows, seed=SEED):
    features = TfidfVectorizer(analyzer="char", ngram_range=(3, 5), min_df=2).fit_transform(
        [row["text"] for row in rows])
    # Union wording near-duplicates transitively so they cannot cross partitions.
    neighbors = NearestNeighbors(radius=0.15, metric="cosine", algorithm="brute")
    adjacent = neighbors.fit(features).radius_neighbors(return_distance=False)
    parent = list(range(len(rows)))

    def root(index):
        while parent[index] != index:
            index = parent[index]
        return index

    def join(i, j):
        left, right = root(i), root(j)
        if left != right:
            parent[max(left, right)] = min(left, right)

    threads = {}
    for i, (row, matches) in enumerate(zip(rows, adjacent)):
        if "thread" in row:
            join(i, threads.setdefault(row["thread"], i))
        for j in matches:
            join(i, int(j))

    groups = np.array([root(i) for i in range(len(rows))])
    indices = np.arange(len(rows))
    reserve = GroupShuffleSplit(n_splits=1, test_size=0.20, random_state=seed)
    work, test = next(reserve.split(indices, groups=groups))
    prepare = GroupShuffleSplit(n_splits=1, test_size=0.25, random_state=seed + 1)
    tr, ca = next(prepare.split(work, groups=groups[work]))
    return [[rows[i] for i in part] for part in (work[tr], work[ca], test)]

def calibrate(raw, truth):
    result = []
    for logits, actual in zip(raw.T, truth.T):
        positives = int(actual.sum())
        if positives < 3 or positives == len(actual):
            # With less than three positives we lack threshold-setting support.
            result.append({"slope": 0., "intercept": -15., "threshold": 1.})
            continue
        fit = LogisticRegression(C=2.).fit(logits[:, None], actual)
        slope = max(float(fit.coef_[0, 0]), 0.)
        intercept = float(fit.intercept_[0])
        scores = expit(slope * logits + intercept)
        values, inverse = np.unique(scores, return_inverse=True)
        emitted = np.bincount(inverse)[::-1].cumsum()[::-1]
        correct = np.bincount(inverse, weights=actual)[::-1].cumsum()[::-1]
        objective = 1.25 * correct / (0.25 * positives + emitted)
        optimal = np.flatnonzero(objective == objective.max())[-1]
        threshold = float((values[optimal] + values[optimal - 1]) / 2) if optimal else 0.
        if slope == 0.:
            threshold = 1.
        result.append({"slope": slope, "intercept": intercept, "threshold": threshold})
    return result

def main():
    gpu = train.verify_gpu()
    rows = load_rows()
    training, calibration, test = split(rows)
    print(f"Split: training {len(training)}, calibration {len(calibration)}, test {len(test)}",
          flush=True)
    truth = train.targets(calibration, KEYS)
    if not train.targets(training, KEYS).sum(axis=0).all():
        raise ValueError("Training split lacks a supported label.")
    OUTPUT.mkdir(parents=True, exist_ok=True)
    shutil.copytree(WEB / "vendor", OUTPUT / "vendor", dirs_exist_ok=True)
    original = train.read(WEB / "manifest.json")
    shutil.copytree(WEB / original["defaultModel"], OUTPUT / "Recalibrated-L6", dirs_exist_ok=True)
    models = []
    for name, encoder in MODELS.items():
        print(f"Preparing {name}", flush=True)
        path = OUTPUT / name
        if encoder:
            source = ARTIFACTS / "encoders" / encoder
            model, tokenizer = train.fit(source, training, KEYS)
            _, int8 = train.export(model, tokenizer, path)
            shutil.copyfile(source / "README.md", path / "MODEL-CARD.md")
        else:
            tokenizer = train.AutoTokenizer.from_pretrained(path, local_files_only=True)
            int8 = path / "model-int8.onnx"
        runtime = train.session(int8)
        fitted = calibrate(train.logits(runtime, tokenizer, calibration), truth)
        models.append({"name": name, "calibration": fitted, "int8_bytes": int8.stat().st_size})
    manifest = {**original, "defaultModel": "Distilled-L6", "models": models}
    train.save(OUTPUT / "manifest.json", manifest)
    train.save(EXPERIMENT / "split.json", {
        "gpu": gpu, "seed": SEED, "splits": {name: [r["id"] for r in part] for name, part in (
            ("train", training), ("calibration", calibration), ("test", test))},
        "support": {name: dict(zip(KEYS, train.targets(part, KEYS).sum(0).astype(int).tolist()))
                    for name, part in (("train", training), ("calibration", calibration), ("test", test))},
        "baseline": metrics(test),
    })
    print("Quantised exports and locked split ready for browser evaluation.", flush=True)

if __name__ == "__main__":
    main()
