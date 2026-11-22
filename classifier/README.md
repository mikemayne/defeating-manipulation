# Offline wording classifier

The classifier takes a short English statement and an optional topic. It scores eight techniques from [the project catalogue](../techniques.json) independently. The labels are bandwagon, ad hominem, false dilemma, straw man, slippery slope, post hoc, appeal to authority and guilt appeal. Several mechanisms can be detected together. When none crosses its threshold, a separate score decides between **Insufficient context** and **No match in the supported catalogue**.

The scores reflect agreement with pilot labels for observable wording. The scope is the text and topic supplied by the reader.

## Train and test on Windows

From the repository root, with Python 3.11 and an NVIDIA driver supporting CUDA 12.8:

```powershell
nvidia-smi
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install torch==2.7.1 --index-url https://download.pytorch.org/whl/cu128
.\.venv\Scripts\python.exe -m pip install -r classifier/requirements.txt
.\.venv\Scripts\python.exe classifier/prepare.py
.\.venv\Scripts\python.exe classifier/train.py --verify-gpu
.\.venv\Scripts\python.exe classifier/train.py
.\.venv\Scripts\python.exe classifier/browser_bench.py
.\.venv\Scripts\python.exe classifier/serve.py
```

Preparation downloads the pinned [three-layer MiniLM](https://huggingface.co/sentence-transformers/paraphrase-MiniLM-L3-v2), [six-layer MiniLM](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2) and browser runtime. Subsequent steps work locally. Training checks CUDA matrix multiplication and backpropagation before tuning the top two encoder layers and fitting the multi-label head on the GPU. ONNX export and quantisation run on CPU. Both exports use INT8 embedding tables and projection weights, a fixed 96-token window, and at most 24 tokens for the optional topic.

Open **http://127.0.0.1:8173** for the harness. Serve the generated `classifier/artifacts/web` directory as a static site or bundle it with a local HTTP host. All runtime files, weights and tokenizers ship in that directory. No external services or user text transfers are needed. The browser test launches installed Microsoft Edge, aborts requests outside loopback, checks logit parity for both models, and exercises the form. It reports session load separately from first inference and warm p50/p95. Use `--channel chrome` on a machine with installed Chrome. The WASM backend uses one CPU thread.

## Evaluation protocol

`examples.json` contains original fictional statements and `counterexamples.json` adds hard negatives. Some synthetic examples combine two mechanisms by joining wording from the same partition. Existing fictional matcher cases and paired contrasts from `augment.py` supplement training. Separate splits supply training, sigmoid calibration and threshold tuning, model selection, and final synthetic testing. The initial pilot's reviewed test examples are part of the revised calibration split. `holdout.json` supplies a fresh final synthetic test. Threshold and model selection use F0.5 to put more weight on precision, with smaller model size breaking model-selection ties. Calibration and metrics run on the quantised export. `classifier/artifacts/evaluation.json` contains split sizes, per-label support and F1, no-match false positives, context detection, Brier scores and quantisation drift. `classifier/artifacts/browser.json` contains timings and parity checks.

For a separate real-world evaluation, pass `--real-holdout` with an untracked JSON array of independently reviewed objects containing `text`, optional `topic`, and `labels`. Each row needs all applicable supported catalogue IDs, an empty array for no match, or `["insufficient_context"]` alone. Exact overlap with pilot data is rejected. Group passages and near-duplicates by source when creating private holdouts. Keep copyrighted articles and public posts out of version control. The runner reports real-holdout metrics in a separate section and uses no real-holdout data in training, calibration or selection.

## Pilot results

Both heads and the top two layers of each encoder were trained on a GeForce RTX 5090 after verifying CUDA 12.8 matrix multiplication and backpropagation. The split sizes were 298 training, 72 calibration, 36 validation and 46 final synthetic cases.

| Encoder | INT8 model | Validation macro F0.5 | Warm Edge p50 / p95 | Load + first statement |
| --- | ---: | ---: | ---: | ---: |
| MiniLM-L3 | 17.4 MB | 0.664 | 33 / 43 ms | 551 ms |
| MiniLM-L6 (selected) | 22.9 MB | 0.679 | 63 / 79 ms | 586 ms |

Edge 158 on an Intel Core i7-8700 desktop used single-threaded CPU WASM. Both models passed tokenizer and logit parity probes. The harness rendered a prediction through the form and made zero requests outside loopback.

MiniLM-L6 reached 90.6% micro precision and 67.4% micro recall on the fictional holdout. The full output label set matched on 30 of 46 rows. The model flagged two of 11 neutral statements, identified three of three insufficient-context cases, and had an F1 of 0.33 for bandwagon. Brier score was 0.036 after calibration and 0.038 before. Real-world accuracy and laptop and mobile performance remain unmeasured.
