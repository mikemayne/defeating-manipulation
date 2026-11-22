"""Export the original Valurank checkpoint for offline Transformers.js inference."""

import shutil
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

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
    main_export(MODEL, export, task="text-classification", revision=REVISION, opset=17)
    tokenizer = AutoTokenizer.from_pretrained(MODEL, revision=REVISION, use_fast=True)
    output = Path(temporary) / "ready"
    (output / "onnx").mkdir(parents=True)
    tokenizer.save_pretrained(output)
    shutil.copy2(export / "config.json", output / "config.json")
    quantize_dynamic(
        export / "model.onnx", output / "onnx" / "model_quantized.onnx",
        weight_type=QuantType.QInt8, op_types_to_quantize=["MatMul"],
    )
    shutil.copytree(output, destination, dirs_exist_ok=True)

print(destination)
