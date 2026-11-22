# GPU question sweep

This pilot measures three-way question answering for five detector features. The 45 synthetic passages are split into 15 training, 15 development and 15 held-out passages, with a positive, a hard negative and an uncertain case per question and split. Related contrast passages stay together. The development examples, model prompt demonstrations and held-out scenarios are separate. Labels are authored, without independent adjudication. This is a feasibility test, with five positives in the held-out set.

## Run

Use the project Python environment with CUDA PyTorch and Transformers 4.53.3. The LoRA comparison also uses PEFT 0.15.2 and Accelerate 1.8.1. Run from the repository root. On Windows, use the Python and HF executables from the project environment.

~~~sh
hf download Qwen/Qwen2.5-0.5B-Instruct --revision 7ae557604adf67be50417f59c2c2f167def9a775 --include "*.json" "*.safetensors" "vocab.json" "merges.txt" --cache-dir classifier/artifacts/hybrid-cache
hf download Qwen/Qwen2.5-1.5B-Instruct --revision 989aa7980e4cf806f80c7fef2b1adb7bc71aa306 --include "*.json" "*.safetensors" "vocab.json" "merges.txt" --cache-dir classifier/artifacts/hybrid-cache
python classifier/hybrid_gpu_sweep.py --model 0.5 --tune --output docs/hybrid-sweep-05.json
python classifier/hybrid_gpu_sweep.py --model 0.5 --center-scores --output docs/hybrid-sweep-centered.json
python classifier/hybrid_gpu_sweep.py --model browser-weights --centered-source docs/hybrid-sweep-centered.json --output docs/hybrid-sweep-q4.json
python classifier/hybrid_gpu_sweep.py --model 1.5 --output docs/hybrid-sweep-15.json
python classifier/hybrid_gpu_sweep.py --model reference --output docs/hybrid-sweep-reference.json
~~~

The reference requires local Ollama with qwen3.6:27b installed. Its schema-constrained response contains only the answer. The compact checkpoints run directly on CUDA in BF16 and score three allowed next tokens, with no free-form generation. The sweep crosses three question wordings, natural labels or letter codes, and zero or two demonstrations. It chooses the best development accuracy, breaking ties by fewer false positives and fewer missed positives. LoRA uses the selected stock prompt, rank eight on the Q and V projections, eight full-batch steps at 0.0001, and seed 42. Each benchmark arm has fixed settings before scoring its held-out passages.

The corpus has three states. A positive prediction against either a hard negative or an uncertain passage counts as a false positive. An abstention is an unknown prediction, including cases where unknown is correct. These rates measure this dataset and do not imply calibrated confidence.

## Held-out results

| Model or baseline | Correct / 15 | Positives found / 5 | False positives / 10 | Unknown predictions |
| --- | ---: | ---: | ---: | ---: |
| Always unknown | 5 | 0 | 0 | 15 |
| Qwen 2.5 0.5B stock | 7 | 0 | 0 | 9 |
| Qwen 2.5 0.5B LoRA | 6 | 3 | 4 | 0 |
| Qwen 2.5 0.5B stock with score centering | 9 | 4 | 4 | 6 |
| Browser Q4 weights with transferred BF16 offsets | 5 | 5 | 10 | 0 |
| Browser Q4 weights with native offsets | 8 | 1 | 3 | 5 |
| Qwen 2.5 1.5B direct CUDA scoring from GGUF | 6 | 1 | 0 | 0 |
| Qwen 2.5 1.5B direct CUDA scoring from GGUF with score centering | 9 | 4 | 3 | 6 |
| Qwen 2.5 1.5B Ollama | 7 | 1 | 0 | 13 |
| MiniLM-L6 frozen encoder and linear probe | 4 | 0 | 1 | 13 |
| Qwen 3.6 27B Ollama reference | 10 | 5 | 4 | 3 |

The stock 0.5B winner was the original wording with natural labels and zero demonstrations. It scored 7/15 on development and 7/15 on held-out examples, with no true positives in the latter. The LoRA run reduced training loss from 2.19 to 1.19 and traded abstentions for three true positives and four false positives on held-out examples. It reduced overall held-out accuracy. The 27B model found every positive. Three of its four false positives were uncertain passages. This reference can help propose labels for review.

The frozen MiniLM probe trains a logistic head on the same 15 training passages using the existing local MiniLM-L6 encoder. Run with `python classifier/hybrid_gpu_sweep.py --model encoder --output docs/hybrid-sweep-encoder.json`. It is a small supervised baseline. Its poor result leaves open what a trained pair classifier could do on a substantially larger dataset.

A follow-up subtracted each question's mean per-label logit on its three balanced training examples before ranking answers. On the original test passages, the development-selected centered variant found four positives without changing weights and added four false positives. The centered variant was introduced after inspecting the initial experiment, so the 9/15 result is exploratory and needs confirmation on fresh passages. Score centering outperformed this LoRA pilot on the same passages. Neither configuration is suitable for deployment at the observed false-positive rate.

The exact Q4 model file installed by the browser lab was also tested through native ONNX Runtime on the CPU. The same prompt variant and BF16 offsets produced a yes on every passage. Recomputing offsets using Q4 logits on the training examples reduced false positives to three and found one positive. Offsets are specific to the tested runtime and checkpoint. The Q4 run excludes the browser worker and is a parity test on the weights and tokenizer.

The 1.5B Ollama arm used the same prediction schema as the 27B reference. It made one positive call, correctly identifying a popularity argument, and abstained on 13 of the 15 examples. Reproduce with the reference command and add `--reference-tag qwen2.5:1.5b`.

The full-precision 1.5B weight transfer stalled. For direct scoring, the GPU runner loaded the downloaded 1.5B Ollama GGUF and dequantized its weights to BF16 on load. This is a quantized source checkpoint, with CUDA inference in BF16. The 12-variant sweep selected original wording, natural labels and no examples. It found the same single positive as the Ollama run but largely predicted no. The BF16-from-safetensors 1.5B arm remains unmeasured.

To reproduce the GGUF run on PowerShell, install gguf 0.17.1, pull the Ollama tag, and download only the 1.5B JSON and tokenizer files from the pinned snapshot above. Use the model path reported by Ollama.

~~~powershell
$modelPath = ((ollama show qwen2.5:1.5b --modelfile | Select-String '^FROM ' | Select-Object -First 1).Line -replace '^FROM ', '')
python classifier/hybrid_gpu_sweep.py --model 1.5 --gguf "$modelPath" --output docs/hybrid-sweep-15.json
python classifier/hybrid_gpu_sweep.py --model 1.5 --gguf "$modelPath" --center-scores --output docs/hybrid-sweep-15-centered.json
~~~

The centered 1.5B variant selected the second wording with natural answers and zero demonstrations. It recovered four positives and raised three false positives, the best observed compact-model trade-off in this pilot. This candidate still needs a fresh, independently reviewed test and calibration in a browser-compatible runtime. The browser detector itself was not changed by these experiments.

Observed CUDA held-out batch times for 15 items were 37 ms for stock 0.5B, 47 ms for LoRA and 10 ms for MiniLM. The 27B reference took 13.2 s over 15 separate loopback requests. These timings use different runtimes and exclude model initialization. They do not measure browser latency.
