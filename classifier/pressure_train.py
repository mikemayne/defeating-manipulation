"""Train three offline pressure detectors and compare them in Edge against Qwen."""
import argparse
import json
import shutil
from collections import Counter

import train
from distill import calibrate, split
from distill_bench import score_in_browser
from prepare import ARTIFACTS
from pressure_collect import KEYS, LABELS, OUT, PATTERNS, SEED
from qwen_bench import metrics
from serve import WEB

OUTPUT = OUT / "web"
MODELS = {"Small-L3": "MiniLM-L3", "Medium-L6": "MiniLM-L6", "Large-L12": "MiniLM-L12"}

def load_rows():
    rows = [json.loads(line) for line in (OUT / "labels.jsonl").read_text(encoding="utf8").splitlines()]
    if len({row["id"] for row in rows}) != len(rows):
        raise ValueError("Training labels contain duplicate excerpts.")
    return rows

def train_models():
    gpu = train.verify_gpu()
    rows = load_rows()
    partitions = dict(zip(("train", "calibration", "test"), split(rows, seed=SEED)))
    training, calibration = partitions["train"], partitions["calibration"]
    support = {name: dict(zip(KEYS, train.targets(part, KEYS).sum(0).astype(int).tolist()))
        for name, part in partitions.items()}
    print(f"Split sizes: { {name:len(part) for name,part in partitions.items()} }; "
          f"label support: {support}", flush=True)
    if any(support[part][key] < 3 for part in ("train", "calibration") for key in KEYS[:-1]):
        raise ValueError("Insufficient support for a pressure label in training or calibration.")
    OUTPUT.mkdir(parents=True, exist_ok=True)
    shutil.copytree(WEB / "vendor", OUTPUT / "vendor", dirs_exist_ok=True)
    truth = train.targets(calibration, KEYS)
    variants = []
    for name, encoder in MODELS.items():
        print(f"Training {name} on the GPU", flush=True)
        source = ARTIFACTS / "encoders" / encoder
        model, tokenizer = train.fit(source, training, KEYS)
        destination = OUTPUT / name
        _, int8 = train.export(model, tokenizer, destination)
        shutil.copyfile(source / "README.md", destination / "MODEL-CARD.md")
        runtime = train.session(int8)
        settings = calibrate(train.logits(runtime, tokenizer, calibration), truth)
        variants.append({"name": name, "calibration": settings, "int8_bytes": int8.stat().st_size,
                         "encoder_revision": (source / "revision.txt").read_text(encoding="utf8")})
    train.save(OUTPUT / "manifest.json", {
        "maxLength": train.LENGTH, "topicLimit": train.TOPIC_LIMIT, "defaultModel": "Medium-L6",
        "models": variants, "labels": [{"id": key, "title": title, "summary": summary}
                                       for key, (title, summary) in LABELS.items()],
    })
    train.save(OUT / "split.json", {
        "gpu": gpu, "teacher": train.read(OUT / "teacher.json"), "seed": SEED,
        "support": support, "splits": {name: [row["id"] for row in part]
                                     for name, part in partitions.items()},
        "threads": {name: len({row["thread"] for row in part}) for name, part in partitions.items()},
        "candidate_cues": dict(Counter(row["track"] for row in rows)),
    })
    print("All three quantised browser packages are ready.", flush=True)

def benchmark():
    partition = train.read(OUT / "split.json")
    by_hash = {row["id"]: row for row in load_rows()}
    test = [by_hash[key] for key in partition["splits"]["test"]]
    for row in test:
        row["qwen"] = [KEYS.index(key) for key in row["labels"]]
    baseline = train.read(ARTIFACTS / "browser.json")["models"]["MiniLM-L6"]["warm_p95_ms"]
    results, traces = score_in_browser(test, OUTPUT, MODELS, KEYS, 2 * baseline)
    results["cue_baseline"] = metrics([
        {"qwen": row["qwen"], "browser": [
            i for i, pattern in enumerate(PATTERNS) if pattern.search(row["text"])
        ]} for row in test
    ], KEYS)
    results.update({key: partition[key] for key in ("gpu", "teacher", "support", "threads", "candidate_cues")})
    results["split_sizes"] = {name: len(ids) for name, ids in partition["splits"].items()}
    train.save(OUT / "browser.json", results)
    train.save(OUT / "predictions.json", traces)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("train", "benchmark"))
    args = parser.parse_args()
    if args.action == "train":
        train_models()
    else:
        benchmark()
