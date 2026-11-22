# Contrast training results

These results document the configuration before retirement of the red patterns. The current training and benchmark inputs omit the retired questions.

The training pool contains 75 passages. The 60 new passages stay grouped into 20 triples with a yes, no and unknown answer for the same question and scenario. The 15 original training passages make five more triples. Prompt examples and evaluation passages are excluded from training. The 15 development passages select checkpoints by exact labels minus false positives, breaking ties by fewer false positives and then fewer missed positives. Tests are scored after selection. There are 15 historical test passages and 30 new synthetic audit passages, authored separately from the training batch and without independent adjudication.

## Results

| Selected checkpoint | Development correct | Historical test correct | Historical positives found / 5 | Historical false positives / 10 | Audit correct / 30 | Audit positives found / 10 | Audit false positives / 20 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| MiniLM-L6 trained with contrast loss | 12/15 | 10/15 | 1 | 0 | 19 | 3 | 0 |
| Qwen 2.5 1.5B with contrast-loss LoRA | 13/15 | 10/15 | 3 | 0 | 18 | 5 | 3 |
| Qwen 2.5 1.5B LoRA with original training only | 11/15 | 12/15 | 4 | 0 | 14 | 5 | 7 |

The original-data control repeated its 15 distinct training examples to match the 75 examples and five updates per epoch in the expanded run. Both runs used the same model, loss, learning rate, selection objective, and stopping rule. The expanded training cut false positives from seven to three on the fresh audit and found the same five positives. The original-data control scored better on the smaller historical set.

The best MiniLM configuration used full encoder fine-tuning, a learning rate of 0.00008 and a contrast loss weight of 0.3. The best Qwen configuration used rank-eight LoRA on the query and value projections, a learning rate of 0.0002 and the same contrast weight. The Qwen base was loaded from the local Ollama GGUF, dequantized to BF16 for CUDA. Each epoch used five batches with five whole contrast groups per batch.

Three Qwen 0.5B settings failed to beat the stock checkpoint under the development objective. MiniLM without the contrast term peaked at 9/15 with zero false positives, and the larger 0.6 margin weight failed to improve the objective. Extending the winning MiniLM configuration beyond epoch 11 yielded five consecutive epochs without improvement. Extending the Qwen run past its epoch-eight peak also yielded five epochs without improvement. Both models missed the two positive contradiction cases in the new audit. Two of Qwen's three audit false positives were on that question.

The exported 23,029,798-byte MiniLM INT8 ONNX matched the floating-point model's aggregate audit results through native ONNX Runtime on CPU. Individual predictions differed. The Qwen LoRA adapter is 4,372,840 bytes and requires its base checkpoint. The browser default was untouched. Native ONNX testing does not verify browser execution.

## Reproduce

With the same CUDA environment from the [GPU sweep](hybrid-gpu-sweep.md), run from the repository root. The first run writes the MiniLM checkpoint. The reload command exports it and evaluates its INT8 graph.

~~~powershell
$py = '.venv/Scripts/python.exe'
$audit = 'evaluation/hybrid-contrast-audit-v1.json'
$mini = 'classifier/artifacts/hybrid-contrast-winner'
$qwen = 'classifier/artifacts/hybrid-contrast-extended'
$modelPath = ((ollama show qwen2.5:1.5b --modelfile | Select-String '^FROM ' | Select-Object -First 1).Line -replace '^FROM ', '')

& $py classifier/hybrid_contrast_train.py --output docs/hybrid-contrast-results.json --artifacts $mini
& $py classifier/hybrid_contrast_train.py --reuse-report docs/hybrid-contrast-results.json --export-encoder --audit $audit --output docs/hybrid-contrast-results.json --artifacts $mini
& $py classifier/hybrid_contrast_train.py --extended --gguf "$modelPath" --audit $audit --output docs/hybrid-contrast-extended-results.json --artifacts $qwen
& $py classifier/hybrid_contrast_train.py --original-only --gguf "$modelPath" --audit $audit --output docs/hybrid-contrast-control-results.json --artifacts classifier/artifacts/hybrid-contrast-control
'Your passage here' | & $py classifier/hybrid_contrast_train.py --predict --gguf "$modelPath" --reuse-report docs/hybrid-contrast-extended-results.json --artifacts $qwen
~~~

Saved weights and tokenizers are in the ignored artifact directories. The tracked reports contain scores and question IDs.
