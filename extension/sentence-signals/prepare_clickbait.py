"""Export the original Valurank checkpoint for offline Transformers.js inference."""

import shutil
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

import numpy as np
from onnxruntime import InferenceSession
from onnxruntime.quantization import QuantType, quantize_dynamic
from optimum.exporters.onnx import main_export
from transformers import AutoTokenizer

MODEL = "valurank/distilroberta-clickbait"
REVISION = "294a3fc"
default_root = Path(__file__).resolve().parent / ".models"
root = Path(sys.argv[1]).resolve() if len(sys.argv) == 2 else default_root
destination = root / MODEL

with TemporaryDirectory(prefix="clickbait-onnx-") as temporary:
    export = Path(temporary) / "export"
    main_export(MODEL, export, task="text-classification", revision=REVISION, opset=18)
    tokenizer = AutoTokenizer.from_pretrained(MODEL, revision=REVISION, use_fast=True)
    output = Path(temporary) / "ready"
    (output / "onnx").mkdir(parents=True)
    tokenizer.save_pretrained(output)
    shutil.copy2(export / "config.json", output / "config.json")
    quantize_dynamic(
        export / "model.onnx", output / "onnx" / "model_quantized.onnx",
        weight_type=QuantType.QInt8, op_types_to_quantize=["MatMul"],
    )
    headlines = [
        "Council opens new park on Friday",
        "You won’t believe what happened when the council opened the park!",
        "These 11 gardening mistakes will shock you",
        "Why the park closed and when it will reopen",
    ]
    encoded = tokenizer(headlines, padding=True, truncation=True, return_tensors="np")

    def probabilities(path):
        session = InferenceSession(str(path), providers=["CPUExecutionProvider"])
        inputs = {item.name: encoded[item.name] for item in session.get_inputs()}
        logits = session.run(["logits"], inputs)[0]
        weights = np.exp(logits - logits.max(axis=-1, keepdims=True))
        return weights / weights.sum(axis=-1, keepdims=True)

    baseline = probabilities(export / "model.onnx")
    quantized = probabilities(output / "onnx" / "model_quantized.onnx")
    np.testing.assert_allclose(quantized, baseline, atol=0.10, rtol=0)
    print(f"Clickbait quantization max probability change: {np.max(np.abs(quantized - baseline)):.4f}")
    shutil.copytree(output, destination, dirs_exist_ok=True)

print(destination)
