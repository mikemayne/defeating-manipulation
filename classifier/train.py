"""Train GPU linear probes; select, calibrate and evaluate their INT8 exports."""
import argparse
import json
import shutil
from pathlib import Path

import numpy as np
import onnxruntime as ort
import torch
from onnxruntime.quantization import QuantType, quantize_dynamic
from scipy.special import expit
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import f1_score, fbeta_score, precision_score, recall_score
from torch import nn
from transformers import AutoModel, AutoTokenizer

from augment import training_contrasts
from prepare import ARTIFACTS, CANDIDATES, ROOT

LENGTH = 96
TOPIC_LIMIT = 24
INPUTS = ("input_ids", "attention_mask", "token_type_ids")
CONTEXT = "insufficient_context"
SPLITS = {"train": slice(0, 4), "calibration": slice(4, 6),
          "validation": slice(6, 8), "pilot_review": slice(8, 10)}

def authored_rows(examples, mechanisms, span, pair_offset):
    rows = [
        {"text": text, "topic": "Group discussion" if index % 2 else "",
         "labels": [] if label == "no_match" else [label]}
        for label, texts in examples.items() for index, text in enumerate(texts[span])
    ]
    # Pair mechanisms using wording from this partition alone.
    for index, label in enumerate(mechanisms):
        other = mechanisms[(index + pair_offset) % len(mechanisms)]
        first, second = examples[label][span][0], examples[other][span][1]
        rows.append({"text": first + " " + second, "labels": [label, other]})
    return rows

def read(path):
    return json.loads(path.read_text(encoding="utf8"))

def save(path, value):
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf8")

def verify_gpu():
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA is required for encoder inference and classifier training.")
    matrix = torch.randn(1024, 1024, device="cuda", requires_grad=True)
    (matrix @ matrix).square().mean().backward()
    torch.cuda.synchronize()
    if matrix.grad is None or not torch.isfinite(matrix.grad).all():
        raise RuntimeError("GPU matmul/backward verification failed.")
    info = {"name": torch.cuda.get_device_name(), "torch": torch.__version__,
            "cuda": torch.version.cuda, "capability": torch.cuda.get_device_capability()}
    print(f"Verified GPU matmul and backward: {info}", flush=True)
    return info

def normalize(text):
    return " ".join(text.split()).casefold()

def load_synthetic():
    examples = read(ROOT / "examples.json")
    counterexamples = read(ROOT / "counterexamples.json")
    mechanisms = [key for key in examples if key not in {"no_match", CONTEXT}]
    labels = [*mechanisms, CONTEXT]
    splits = {
        name: authored_rows(examples, mechanisms, span, index + 1) +
        [{"text": text, "labels": []} for text in counterexamples[name]]
        for index, (name, span) in enumerate(SPLITS.items())
    }
    splits["calibration"].extend(splits.pop("pilot_review"))
    splits["train"].extend(training_contrasts())
    splits["test"] = authored_rows(read(ROOT / "holdout.json"), mechanisms, slice(None), 5)

    held_out = {normalize(row["text"]) for name, rows in splits.items()
                if name != "train" for row in rows}
    fixtures = read(ROOT.parent / "evaluation" / "matcher-examples.json")["cases"]
    seen = held_out | {normalize(row["text"]) for row in splits["train"]}
    for case in fixtures:
        text = case["text"]
        key = normalize(text)
        expected = set(case["expected"])
        if key not in seen and case.get("gate") and expected.issubset(mechanisms):
            splits["train"].append({"text": text, "labels": sorted(expected)})
            seen.add(key)
    return labels, splits

def tokens(tokenizer, rows):
    text = [row["text"].strip() for row in rows]
    topics = [row.get("topic", "").strip() for row in rows]
    statements = tokenizer(text, add_special_tokens=False).input_ids
    subjects = tokenizer(topics, add_special_tokens=False).input_ids
    result = {name: [] for name in INPUTS}
    for statement, subject in zip(statements, subjects):
        subject = subject[:TOPIC_LIMIT]
        statement = statement[:LENGTH - len(subject) - 3]
        first = [tokenizer.cls_token_id, *statement, tokenizer.sep_token_id]
        second = [*subject, tokenizer.sep_token_id]
        count = len(first) + len(second)
        pad = LENGTH - count
        result["input_ids"].append(first + second + [tokenizer.pad_token_id] * pad)
        result["attention_mask"].append([1] * count + [0] * pad)
        result["token_type_ids"].append([0] * len(first) + [1] * len(second) + [0] * pad)
    return {name: torch.tensor(data, dtype=torch.int64) for name, data in result.items()}

def targets(rows, labels):
    return np.array([[label in row["labels"] for label in labels] for row in rows],
                    dtype=np.float32)

class Classifier(nn.Module):
    def __init__(self, encoder, count):
        super().__init__()
        self.encoder = encoder
        self.head = nn.Linear(encoder.config.hidden_size, count)

    def features(self, input_ids, attention_mask, token_type_ids):
        hidden = self.encoder(input_ids=input_ids, attention_mask=attention_mask,
                              token_type_ids=token_type_ids, return_dict=False)[0]
        mask = attention_mask.unsqueeze(-1).to(hidden.dtype)
        mean = (hidden * mask).sum(dim=1) / mask.sum(dim=1).clamp(min=1)
        return nn.functional.normalize(mean, dim=1) * 8

    def forward(self, input_ids, attention_mask, token_type_ids):
        return self.head(self.features(input_ids, attention_mask, token_type_ids))

def fit(directory, rows, labels):
    tokenizer = AutoTokenizer.from_pretrained(directory, local_files_only=True)
    encoder = AutoModel.from_pretrained(directory, local_files_only=True,
                                        attn_implementation="eager")
    torch.manual_seed(42)
    model = Classifier(encoder, len(labels)).cuda()
    encoder.requires_grad_(False)
    trainable = encoder.encoder.layer[-2:]
    trainable.requires_grad_(True)
    inputs = {name: tensor.cuda() for name, tensor in tokens(tokenizer, rows).items()}
    truth = torch.from_numpy(targets(rows, labels)).cuda()
    positive_weight = ((len(rows) - truth.sum(0)) / truth.sum(0)).sqrt().clamp(max=6)
    optimizer = torch.optim.AdamW([
        {"params": model.head.parameters(), "lr": 0.003},
        {"params": trainable.parameters(), "lr": 0.0001},
    ])
    for _ in range(8):
        for batch in torch.randperm(len(rows), device="cuda").split(16):
            optimizer.zero_grad()
            predictions = model(**{name: tensor[batch] for name, tensor in inputs.items()})
            loss = nn.functional.binary_cross_entropy_with_logits(
                predictions, truth[batch], pos_weight=positive_weight)
            loss.backward()
            optimizer.step()
    torch.cuda.synchronize()
    print(f"GPU training loss: {loss.item():.4f}", flush=True)
    return model.eval().cpu(), tokenizer

def session(path):
    options = ort.SessionOptions()
    options.intra_op_num_threads = 2
    return ort.InferenceSession(str(path), options, providers=["CPUExecutionProvider"])

def logits(runtime, tokenizer, rows):
    inputs = tokens(tokenizer, rows)
    # Dynamic activation quantization shares scales across a batch. Use the same
    # batch size as the browser for calibration, evaluation and parity probes.
    return np.concatenate([
        runtime.run(["logits"], {name: inputs[name][i:i + 1].numpy()
                                for name in INPUTS})[0]
        for i in range(len(rows))
    ])

def export(model, tokenizer, directory):
    directory.mkdir(parents=True, exist_ok=True)
    fp32 = ARTIFACTS / f"{directory.name}-reference-fp32.onnx"
    int8 = directory / "model-int8.onnx"
    batch = tokens(tokenizer, [{"text": "Example."}])
    torch.onnx.export(model, tuple(batch[name] for name in INPUTS), str(fp32),
                      input_names=list(INPUTS), output_names=["logits"], opset_version=17,
                      dynamo=False)
    quantize_dynamic(fp32, int8, weight_type=QuantType.QUInt8, per_channel=True,
                     op_types_to_quantize=["MatMul", "Gather"],
                     extra_options={"MatMulConstBOnly": True})
    # The browser needs only the tokenizer and its configuration.
    tokenizer.save_pretrained(directory)
    return fp32, int8

def calibrate(raw, truth):
    result = []
    for x, y in zip(raw.T, truth.T):
        # Regularized Platt scaling on the held-out quantized model logits.
        fit = LogisticRegression(C=2.0).fit(x[:, None], y)
        slope, intercept = float(fit.coef_[0, 0]), float(fit.intercept_[0])
        scores = expit(x * slope + intercept)
        unique = np.r_[0., np.unique(scores), 1.]
        thresholds = np.unique(np.maximum((unique[:-1] + unique[1:]) / 2, 0.35))
        threshold = max(thresholds, key=lambda t: (fbeta_score(y, scores >= t, beta=0.5), t))
        result.append({"slope": slope, "intercept": intercept, "threshold": float(threshold)})
    return result

def probabilities(raw, calibration):
    return expit(raw * [c["slope"] for c in calibration] +
                 [c["intercept"] for c in calibration])

def metrics(raw, truth, calibration, labels):
    scores = probabilities(raw, calibration)
    found = scores >= [setting["threshold"] for setting in calibration]
    actual = truth.astype(bool)
    # Context is the fallback status when no in-scope mechanism crosses its threshold.
    found[:, -1] &= ~found[:, :-1].any(axis=1)
    no_match = ~actual.any(axis=1)
    context = actual[:, -1]
    return {
        "rows": len(truth),
        "precision_micro": precision_score(actual, found, average="micro", zero_division=0),
        "recall_micro": recall_score(actual, found, average="micro", zero_division=0),
        "mechanism_f1_macro": f1_score(actual[:, :-1], found[:, :-1],
                                       average="macro", zero_division=0),
        "mechanism_f05_macro": fbeta_score(actual[:, :-1], found[:, :-1], beta=0.5,
                                          average="macro", zero_division=0),
        "exact_match": float((actual == found).all(axis=1).mean()),
        "brier": float(np.mean((scores - truth) ** 2)),
        "uncalibrated_brier": float(np.mean((expit(raw) - truth) ** 2)),
        "no_match_rows": int(no_match.sum()),
        "no_match_false_positives": int(found[no_match].any(axis=1).sum()),
        "insufficient_context_rows": int(context.sum()),
        "insufficient_context_detected": int(found[context, -1].sum()),
        "per_label": {label: {"support": int(actual[:, index].sum()),
                             "f1": f1_score(actual[:, index], found[:, index], zero_division=0)}
                      for index, label in enumerate(labels)},
    }

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verify-gpu", action="store_true")
    parser.add_argument("--real-holdout", type=Path)
    args = parser.parse_args()
    gpu = verify_gpu()
    if args.verify_gpu:
        return
    labels, splits = load_synthetic()
    train = splits["train"]
    catalogue = {item["id"]: item for item in read(ROOT.parent / "techniques.json")["techniques"]}
    report = {"dataset": "fictional synthetic pilot", "gpu": gpu, "candidates": {},
              "splits": {name: len(rows) for name, rows in splits.items()}}
    runs = {}
    config = []
    for name in CANDIDATES:
        source = ARTIFACTS / "encoders" / name
        result_dir = ARTIFACTS / "web" / name
        print(f"Training {name} on {len(train)} examples", flush=True)
        model, tokenizer = fit(source, train, labels)
        fp32, int8 = export(model, tokenizer, result_dir)
        shutil.copyfile(source / "README.md", result_dir / "MODEL-CARD.md")
        runtime = session(int8)
        calibration_rows = splits["calibration"]
        raw = logits(runtime, tokenizer, calibration_rows)
        calibration = calibrate(raw, targets(calibration_rows, labels))
        val = splits["validation"]
        raw_val = logits(runtime, tokenizer, val)
        drift = np.abs(raw_val - logits(session(fp32), tokenizer, val))
        report["candidates"][name] = {
            "revision": (source / "revision.txt").read_text(encoding="utf8"),
            "fp32_bytes": fp32.stat().st_size, "int8_bytes": int8.stat().st_size,
            "validation_logit_drift_mean": float(drift.mean()),
            "validation_logit_drift_max": float(drift.max()),
            "validation": metrics(raw_val, targets(val, labels), calibration, labels),
        }
        probes = [
            {"text": "The whole office uses it, so you should too.", "topic": "Software"},
            {"text": "Dani’s estimate doesn’t include delivery.", "topic": ""},
            {"text": "This is an extended statement. " * 30, "topic": "testing " * 30},
        ]
        config.append({"name": name, "calibration": calibration,
                       "probes": [
                           {**probe, "logits": value.tolist(), "tokenIds": token_ids}
                           for probe, value, token_ids in zip(
                               probes, logits(runtime, tokenizer, probes),
                               tokens(tokenizer, probes)["input_ids"].tolist())
                       ]})
        runs[name] = (runtime, tokenizer, calibration)
    winner = max(runs, key=lambda name: (
        report["candidates"][name]["validation"]["mechanism_f05_macro"],
        -report["candidates"][name]["int8_bytes"],
    ))
    runtime, tokenizer, calibration = runs[winner]
    test = splits["test"]
    report["selected"] = winner
    report["synthetic_test"] = metrics(logits(runtime, tokenizer, test), targets(test, labels),
                                       calibration, labels)
    if args.real_holdout:
        real = read(args.real_holdout)
        seen = {normalize(row["text"]) for rows in splits.values() for row in rows}
        if not isinstance(real, list) or not real:
            raise ValueError("Real holdout must be a non-empty JSON array.")
        for row in real:
            if (not normalize(row["text"]) or normalize(row["text"]) in seen
                    or not set(row["labels"]).issubset(labels)
                    or CONTEXT in row["labels"] and len(row["labels"]) != 1):
                raise ValueError("Invalid labels, empty text, or overlapping real-holdout rows.")
            seen.add(normalize(row["text"]))
        report["real_holdout"] = metrics(logits(runtime, tokenizer, real), targets(real, labels),
                                         calibration, labels)
    save(ARTIFACTS / "evaluation.json", report)
    save(ARTIFACTS / "web" / "manifest.json", {
        "maxLength": LENGTH, "topicLimit": TOPIC_LIMIT, "defaultModel": winner,
        "models": config, "labels": [
            catalogue[label] if label in catalogue else {"id": label, "title": "Insufficient context"}
            for label in labels
        ],
    })
    print(json.dumps(report, indent=2))

if __name__ == "__main__":
    main()
