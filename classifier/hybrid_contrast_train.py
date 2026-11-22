"""Train and select contrast models using development predictions only."""
import argparse
import hashlib
import json
import random
import sys
from pathlib import Path

import torch
from transformers import AutoModel, AutoModelForCausalLM, AutoTokenizer
from peft import LoraConfig, get_peft_model

from hybrid_gpu_sweep import CACHE, FIXTURES, REVISIONS, ROOT, STATES, logits, prompt, rows, summarize

CONTRASTS = ROOT / "evaluation/hybrid-training-contrasts-v1.json"
VARIANT = (0, "natural", False)
CONFIGS = [
    ("qwen", 0.0002, 0.0),
    ("qwen", 0.0002, 0.3),
    ("encoder", 0.00003, 0.0),
    ("encoder", 0.00003, 0.3),
    ("qwen", 0.0005, 0.3),
    ("encoder", 0.00008, 0.3),
]
EXTENDED = [("encoder", 0.00008, 0.3), ("encoder", 0.00008, 0.0),
            ("encoder", 0.00005, 0.6), ("qwen15", 0.0002, 0.3)]


class Encoder(torch.nn.Module):
    def __init__(self, directory):
        super().__init__()
        self.base = AutoModel.from_pretrained(directory, local_files_only=True)
        self.head = torch.nn.Linear(self.base.config.hidden_size, len(STATES))

    def forward(self, **inputs):
        return self.head(self.base(**inputs).last_hidden_state[:, 0])


def load_data():
    fixtures = json.loads(FIXTURES.read_text(encoding="utf-8"))
    new = json.loads(CONTRASTS.read_text(encoding="utf-8"))
    if new["split"] != "training_only" or set(new["questions"]) != set(fixtures):
        raise ValueError("Expected a training-only supplement for the existing questions")
    training = {}
    for question, gold, text in rows(fixtures, "train"):
        training.setdefault(question, []).append((question, gold, text))
    groups = list(training.values())
    for question, sets in new["questions"].items():
        groups.extend([(question, state, group[state]) for state in STATES] for group in sets)
    return fixtures, groups


def make_model(family, gguf=None):
    if family == "encoder":
        path = CACHE.parent / "encoders/MiniLM-L6"
        return Encoder(path).cuda(), AutoTokenizer.from_pretrained(path, local_files_only=True), path
    size = "1.5" if family == "qwen15" else "0.5"
    path = CACHE / f"models--Qwen--Qwen2.5-{size}B-Instruct/snapshots" / REVISIONS[size]
    extra = {"gguf_file": str(gguf.resolve(strict=True))} if family == "qwen15" else {}
    base = AutoModelForCausalLM.from_pretrained(
        path, local_files_only=True, torch_dtype=torch.bfloat16, attn_implementation="sdpa", **extra).cuda()
    model = get_peft_model(base, LoraConfig(
        task_type="CAUSAL_LM", r=8, lora_alpha=16, target_modules=["q_proj", "v_proj"]))
    return model, AutoTokenizer.from_pretrained(path, local_files_only=True, padding_side="left"), path


def forward(family, model, tokenizer, fixtures, items):
    if family != "encoder":
        return logits(model, tokenizer, [prompt(tokenizer, fixtures[q], passage, VARIANT)
                                         for q, _, passage in items], VARIANT)
    query = [fixtures[q]["questions"][0] for q, _, _ in items]
    inputs = tokenizer(query, [text for _, _, text in items], padding=True, return_tensors="pt").to("cuda")
    return model(**inputs)


@torch.inference_mode()
def evaluate(family, model, tokenizer, fixtures, split):
    model.eval()
    items = list(rows(fixtures, split))
    scores = forward(family, model, tokenizer, fixtures, items).cpu()
    return summarize(items, scores, None, VARIANT, None)


def selection_key(result):
    return (result["correct"] - result["false_positives"],
            -result["false_positives"], -result["positive_misses"])


def audit_rows(path, fixtures):
    audit = json.loads(path.read_text(encoding="utf-8"))
    if set(audit) != set(fixtures):
        raise ValueError("Audit questions must match sweep questions")
    return [(q, state, text) for q, sets in audit.items()
            for group in sets for state, text in zip(STATES, group, strict=True)]


def export_encoder(model, tokenizer, fixtures, samples, directory):
    import onnxruntime as ort
    from onnxruntime.quantization import QuantType, quantize_dynamic

    class Export(torch.nn.Module):
        def forward(self, input_ids, attention_mask, token_type_ids):
            return self.encoder(input_ids=input_ids, attention_mask=attention_mask, token_type_ids=token_type_ids)

    # Register the encoder as a submodule so its tensors remain weights.
    wrapper = Export()
    wrapper.encoder = model.cpu().eval()
    example = tokenizer(["What does the passage say?"], ["A sample."], return_tensors="pt")
    names = ["input_ids", "attention_mask", "token_type_ids"]
    fp32, int8 = directory / "model-fp32.onnx", directory / "model-int8.onnx"
    torch.onnx.export(wrapper, tuple(example[name] for name in names), fp32, input_names=names,
                      output_names=["logits"], opset_version=17, dynamo=False,
                      dynamic_axes={**{name: {0: "batch", 1: "length"} for name in names}, "logits": {0: "batch"}})
    quantize_dynamic(fp32, int8, weight_type=QuantType.QUInt8, per_channel=True,
                     op_types_to_quantize=["MatMul", "Gather"],
                     extra_options={"MatMulConstBOnly": True})
    opts = ort.SessionOptions()
    opts.intra_op_num_threads = 4
    session = ort.InferenceSession(str(int8), opts, providers=["CPUExecutionProvider"])
    query = [fixtures[q]["questions"][0] for q, _, _ in samples]
    inputs = tokenizer(query, [text for _, _, text in samples], padding=True, return_tensors="np")
    scores, = session.run(["logits"], {name: inputs[name] for name in names})
    return {"size_bytes": int8.stat().st_size,
            "audit": summarize(samples, torch.from_numpy(scores), None, VARIANT, None)}


def run(config, fixtures, groups, epochs, patience, gguf):
    family, lr, margin_weight = config
    torch.manual_seed(42)
    rng = random.Random(42)
    model, tokenizer, _ = make_model(family, gguf)
    params = {name: p for name, p in model.named_parameters() if p.requires_grad}
    optimizer = torch.optim.AdamW(params.values(), lr=lr)
    best_key, best_state, best_epoch = None, None, 0
    trajectory = []
    for epoch in range(epochs + 1):
        if epoch:
            model.train()
            order = rng.sample(groups, len(groups))
            for start in range(0, len(order), 5):
                items = sum(order[start:start+5], [])
                targets = torch.tensor([STATES.index(gold) for _, gold, _ in items], device="cuda")
                optimizer.zero_grad()
                scores = forward(family, model, tokenizer, fixtures, items)
                loss = torch.nn.functional.cross_entropy(scores, targets)
                if margin_weight:
                    yes_scores = (scores[:, 0] - scores[:, 1:].logsumexp(dim=1)).reshape(-1, 3)
                    loss += margin_weight * torch.relu(0.5 - yes_scores[:, :1] + yes_scores[:, 1:]).mean()
                loss.backward()
                torch.nn.utils.clip_grad_norm_(params.values(), 1.0)
                optimizer.step()
        dev = evaluate(family, model, tokenizer, fixtures, "dev")
        trajectory.append({k: dev[k] for k in ("correct", "false_positives", "positive_misses", "abstentions")})
        key = selection_key(dev)
        if best_key is None or key > best_key:
            best_key, best_epoch = key, epoch
            best_state = {name: p.detach().cpu().clone() for name, p in params.items()}
        if epoch - best_epoch >= patience:
            break
    report = {"config": config, "best_epoch": best_epoch, "development": trajectory}
    del model, optimizer
    return best_key, best_state, report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--artifacts", type=Path, required=True)
    parser.add_argument("--extended", action="store_true")
    parser.add_argument("--original-only", action="store_true",
                        help="Matched-update control with the original training examples")
    parser.add_argument("--gguf", type=Path)
    parser.add_argument("--audit", type=Path)
    parser.add_argument("--export-encoder", action="store_true")
    parser.add_argument("--reuse-report", type=Path)
    parser.add_argument("--predict", action="store_true", help="Score a passage from stdin with the selected model")
    args = parser.parse_args()
    items, groups = load_data()
    if args.predict:
        if not args.reuse_report:
            parser.error("--predict requires --reuse-report")
        text = sys.stdin.read(1801).strip()
        if not text or len(text) > 1800:
            parser.error("Supply a non-empty passage of up to 1,800 characters")
        report = json.loads(args.reuse_report.read_text(encoding="utf-8"))
        if report["data_sha256"] != hashlib.sha256(CONTRASTS.read_bytes()).hexdigest():
            parser.error("This checkpoint covers a retired question set. Train on the current corpus first.")
        family = report["trials"][report["winner"]]["config"][0]
        if family == "qwen15" and not args.gguf:
            parser.error("The selected checkpoint requires --gguf")
        model, tokenizer, _ = make_model(family, args.gguf)
        if family == "encoder":
            model.load_state_dict(torch.load(args.artifacts / "encoder.pt", weights_only=True, map_location="cpu"))
        else:
            from peft import set_peft_model_state_dict
            from safetensors.torch import load_file

            set_peft_model_state_dict(model, load_file(args.artifacts / "adapter_model.safetensors"))
        with torch.inference_mode():
            scores = forward(family, model.eval(), tokenizer, items, [(q, "", text) for q in items])
        print(json.dumps({"answers": {q: STATES[index] for q, index in
                                      zip(items, scores.argmax(dim=1).tolist(), strict=True)}}))
        return
    if not args.output:
        parser.error("--output is required for training and export")
    if args.reuse_report:
        if not args.export_encoder or not args.audit:
            parser.error("--reuse-report requires --export-encoder and --audit")
        report = json.loads(args.reuse_report.read_text(encoding="utf-8"))
        if report["data_sha256"] != hashlib.sha256(CONTRASTS.read_bytes()).hexdigest():
            parser.error("This checkpoint covers a retired question set. Train on the current corpus first.")
        if report["trials"][report["winner"]]["config"][0] != "encoder":
            raise ValueError("The selected checkpoint is not an encoder")
        model, tokenizer, _ = make_model("encoder")
        model.load_state_dict(torch.load(args.artifacts / "encoder.pt", weights_only=True, map_location="cpu"))
        samples = audit_rows(args.audit, items)
        with torch.inference_mode():
            scores = forward("encoder", model.eval(), tokenizer, items, samples).cpu()
        report["audit"] = summarize(samples, scores, None, VARIANT, None)
        report["int8"] = export_encoder(model, tokenizer, items, samples, args.artifacts)
        args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        return
    best = None
    trials = []
    configs = EXTENDED if args.extended else CONFIGS
    distinct_training_rows = sum(map(len, groups))
    if args.original_only:
        if not args.gguf:
            parser.error("--original-only requires --gguf")
        originals = groups[:len(items)]
        distinct_training_rows = sum(map(len, originals))
        groups = (originals * ((len(groups) + len(originals) - 1) // len(originals)))[:len(groups)]
        configs = [EXTENDED[-1]]
    configs = [config for config in configs if config[0] != "qwen15" or args.gguf]
    epochs, patience = (24, 5) if args.extended or args.original_only else (12, 3)
    for index, config in enumerate(configs):
        key, state, record = run(config, items, groups, epochs, patience, args.gguf)
        trials.append(record)
        print(index, config, key, record["best_epoch"], record["development"], flush=True)
        if best is None or key > best[0]:
            best = (key, index, state)
    _, winner, state = best
    family = configs[winner][0]
    model, tokenizer, path = make_model(family, args.gguf)
    with torch.no_grad():
        for name, value in model.named_parameters():
            if name in state:
                value.copy_(state[name])
    args.artifacts.mkdir(parents=True, exist_ok=True)
    if family != "encoder":
        model.save_pretrained(args.artifacts)
    else:
        torch.save(model.state_dict(), args.artifacts / "encoder.pt")
    tokenizer.save_pretrained(args.artifacts)
    report = {
        "training_rows": distinct_training_rows, "rows_per_epoch": sum(map(len, groups)),
        "device": torch.cuda.get_device_name(),
        "data_sha256": hashlib.sha256(CONTRASTS.read_bytes()).hexdigest(),
        "winner": winner, "checkpoint": path.name, "trials": trials,
        "test": evaluate(family, model, tokenizer, items, "test"),
    }
    if args.audit:
        samples = audit_rows(args.audit, items)
        with torch.inference_mode():
            model.eval()
            scores = forward(family, model, tokenizer, items, samples).cpu()
        report["audit"] = summarize(samples, scores, None, VARIANT, None)
        if args.export_encoder and family == "encoder":
            report["int8"] = export_encoder(model, tokenizer, items, samples, args.artifacts)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print("selected", winner, report["test"]["confusion"], flush=True)


if __name__ == "__main__":
    main()
