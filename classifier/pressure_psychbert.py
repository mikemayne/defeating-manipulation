"""Fine-tune PsychBERT and matched BERT on the locked two-label pressure experiment."""
import argparse
import hashlib
import shutil
import threading
from contextlib import ExitStack

from playwright.sync_api import sync_playwright

import train
from distill import calibrate
from prepare import ARTIFACTS, download
from pressure_collect import LABELS as TITLES, OUT
from pressure_target_bench import GOAL, evaluate, remove_near_duplicates
from pressure_target_collect import LABELS, RUN, load_jsonl
from pressure_target_train import ALL, train_rows
from serve import create_server

EXPERIMENT = RUN / "psychbert"
WEB = EXPERIMENT / "web"
CHECKPOINTS = {
    "PsychBERT": ("mnaylor/psychbert-cased", "735ebaf4a28a8a5b3205f4eae761a10c17e869e1", "flax_model.msgpack"),
    "BERT-Base-Cased": ("google-bert/bert-base-cased", "cd5ef92a9fb2f889e972770a36d4ed042daf221e",
                        "model.safetensors"),
    "PsychBERT-MentalHealth": ("mnaylor/psychbert-finetuned-mentalhealth",
                              "e4cdd814ff552ccb1d9c628ebe58ab0c81079e0f", "pytorch_model.bin"),
}
TOKENIZER_FILES = ("config.json", "tokenizer.json", "tokenizer_config.json", "vocab.txt", "README.md")
SHA256 = {
    "PsychBERT": "fa9922fcba7adb4a0379371da339d27c88c76650ec8cefe3abd6961822f13b9c",
    "BERT-Base-Cased": "1d8bdcee6021e2c25f0325e84889b61c2eb26b843eef5659c247af138d64f050",
    "PsychBERT-MentalHealth": "7484e1cfe6db5c76c9cfec8145d774389b4ab5338baa61b08bad477c8cbf0a5f",
}

def prepare(names):
    for name in names:
        repo, revision, weights = CHECKPOINTS[name]
        path = ARTIFACTS / "encoders" / name
        for filename in (*TOKENIZER_FILES, weights):
            download(f"https://huggingface.co/{repo}/resolve/{revision}/{filename}", path / filename)
        with (path / weights).open("rb") as source:
            if hashlib.file_digest(source, "sha256").hexdigest() != SHA256[name]:
                raise ValueError(f"{name} weights failed the pinned checksum.")
        if weights.startswith("flax") and not (path / "model.safetensors").is_file():
            convert_psychbert(path, weights)
        if weights == "pytorch_model.bin" and not (path / "model.safetensors").is_file():
            convert_pytorch_encoder(path, weights)
        revision_file = path / "revision.txt"
        if not revision_file.exists():
            revision_file.write_text(revision, encoding="utf8")
        elif revision_file.read_text(encoding="utf8") != revision:
            raise ValueError(f"{name} revision differs from the selected checkpoint.")

def convert_psychbert(path, weights):
    import numpy as np
    from flax.serialization import msgpack_restore
    from transformers import BertConfig, BertModel
    from transformers.modeling_flax_pytorch_utils import load_flax_weights_in_pytorch_model

    state = msgpack_restore((path / weights).read_bytes())
    # Materialise CPU tensors before conversion so checkpoint copies reach real parameters.
    encoder = BertModel(BertConfig.from_pretrained(path, local_files_only=True),
                        add_pooling_layer=False)
    load_flax_weights_in_pytorch_model(encoder, state)
    base = state["bert"]
    expected = base["embeddings"]["word_embeddings"]["embedding"]
    last_query = base["encoder"]["layer"]["11"]["attention"]["self"]["query"]["kernel"]
    if (not np.array_equal(encoder.embeddings.word_embeddings.weight.detach().numpy(), expected)
        or not np.array_equal(encoder.encoder.layer[-1].attention.self.query.weight.detach().numpy(),
                              last_query.T)):
        raise RuntimeError("Flax conversion did not preserve the checked PsychBERT tensors.")
    encoder.save_pretrained(path, safe_serialization=True)
    print("Verified PsychBERT Flax-to-PyTorch tensor conversion.", flush=True)

def convert_pytorch_encoder(path, weights):
    import torch
    from transformers import BertConfig, BertModel

    saved = torch.load(path / weights, map_location="cpu", weights_only=True)
    state = {key.removeprefix("bert."): value for key, value in saved.items() if key.startswith("bert.")}
    encoder = BertModel(BertConfig.from_pretrained(path, local_files_only=True))
    saved_positions = state.pop("embeddings.position_ids", None)
    if saved_positions is not None and not torch.equal(saved_positions, encoder.embeddings.position_ids):
        raise ValueError("Legacy position indices do not match the BERT configuration.")
    encoder.load_state_dict(state, strict=True)
    encoder.save_pretrained(path, safe_serialization=True)

def compare_backbone(name):
    import torch
    from safetensors import safe_open

    directory = ARTIFACTS / "encoders"
    with (safe_open(directory / name / "model.safetensors", framework="pt") as model,
          safe_open(directory / "BERT-Base-Cased" / "model.safetensors", framework="pt") as control):
        reference_keys = set(control.keys())
        keys = [key for key in model.keys() if not key.startswith("pooler.")]
        changed = 0
        for key in keys:
            legacy = key.replace(".LayerNorm.weight", ".LayerNorm.gamma").replace(
                ".LayerNorm.bias", ".LayerNorm.beta")
            ref = next(k for k in (key, "bert." + key, legacy, "bert." + legacy)
                       if k in reference_keys)
            changed += not torch.equal(model.get_tensor(key), control.get_tensor(ref))
    return {"compared_encoder_tensors": len(keys), "different_from_bert_base": changed}

def fit(names):
    gpu = train.verify_gpu()
    data = load_jsonl(RUN / "labels.jsonl")
    fresh = [row for row in data if row["part"] == "train"]
    calibration = [row for row in data if row["part"] == "calibration"]
    rows, _, review = train_rows(fresh)
    original = train.read(RUN / "training.json")
    if len(rows) != original["training_rows"] or review != original["review"]:
        raise ValueError("Training data differ from the previous targeted L6 experiment.")
    WEB.mkdir(parents=True, exist_ok=True)
    shutil.copytree(OUT / "web" / "vendor", WEB / "vendor", dirs_exist_ok=True)
    truth = train.targets(calibration, ALL)
    manifest_path = WEB / "manifest.json"
    models = [m for m in train.read(manifest_path)["models"] if m["name"] not in names
              ] if manifest_path.is_file() else []
    for name in names:
        source = ARTIFACTS / "encoders" / name
        print(f"Fine-tuning {name} on the GPU", flush=True)
        model, tokenizer = train.fit(source, rows, ALL)
        param_count = sum(p.numel() for p in model.parameters())
        path = WEB / name
        _, int8 = train.export(model, tokenizer, path)
        shutil.copyfile(source / "README.md", path / "MODEL-CARD.md")
        raw = train.logits(train.session(int8), tokenizer, calibration)
        models.append({"name": name, "calibration": calibrate(raw, truth),
                       "parameters": param_count, "int8_bytes": int8.stat().st_size,
                       "revision": (source / "revision.txt").read_text(encoding="utf8")})
    train.save(WEB / "manifest.json", {
        "maxLength": train.LENGTH, "topicLimit": train.TOPIC_LIMIT,
        "defaultModel": "PsychBERT" if any(m["name"] == "PsychBERT" for m in models) else models[0]["name"],
        "models": models, "labels": [{"id": k, "title": TITLES[k][0], "summary": TITLES[k][1]} for k in ALL],
    })
    train.save(EXPERIMENT / "training.json", {"gpu": gpu, "examples": len(rows), "review": review})

def benchmark(names):
    data = load_jsonl(RUN / "labels.jsonl")
    calibration = [r for r in data if r["part"] == "calibration"]
    test = remove_near_duplicates(data, [r for r in data if r["part"] == "test"])
    earlier = train.read(RUN / "browser.json")
    earlier_predictions = train.read(RUN / "browser_predictions.json")
    if [r["id"] for r in test] != [r["id"] for r in earlier_predictions["Medium-L6"]]:
        raise ValueError("The held-out test differs from the previous browser benchmark.")
    manifest = train.read(WEB / "manifest.json")
    backbone_audit = {spec["name"]: compare_backbone(spec["name"]) for spec in manifest["models"]
                      if spec["name"] != "BERT-Base-Cased"}
    with create_server(0, WEB) as server, sync_playwright() as playwright, ExitStack() as cleanup:
        threading.Thread(target=server.serve_forever, daemon=True).start()
        cleanup.callback(server.shutdown)
        browser = playwright.chromium.launch(channel="msedge")
        cleanup.callback(browser.close)
        report = {"edge": browser.version, "test_rows": len(test), "calibration_rows": len(calibration),
                  "target_precision_pct": 100 * GOAL, "prior_l6_edge": earlier["edge"],
                  "models": dict(earlier["models"]), "backbones": backbone_audit}
        report_path = EXPERIMENT / "browser.json"
        predictions_path = EXPERIMENT / "browser_predictions.json"
        if report_path.is_file():
            report["models"].update(train.read(report_path)["models"])
        predictions = train.read(predictions_path) if predictions_path.is_file() else {}
        for spec in manifest["models"]:
            name = spec["name"]
            if name not in names:
                continue
            print(f"Scoring {name} on {len(test)} fresh Reddit excerpts in Edge", flush=True)
            result, outputs = evaluate(browser, f"http://127.0.0.1:{server.server_port}",
                                       name, calibration, test)
            report["models"][name] = {**result, "int8_bytes": spec["int8_bytes"],
                                      "parameters": spec["parameters"]}
            predictions[name] = outputs
            print(name, result, flush=True)
    train.save(EXPERIMENT / "browser.json", report)
    train.save(EXPERIMENT / "browser_predictions.json", predictions)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("prepare", "train", "benchmark"))
    parser.add_argument("--mentalhealth", action="store_true",
                        help="Run only the separately released mental-health checkpoint")
    args = parser.parse_args()
    names = ("PsychBERT-MentalHealth",) if args.mentalhealth else ("PsychBERT", "BERT-Base-Cased")
    {"prepare": prepare, "train": fit, "benchmark": benchmark}[args.action](names)
