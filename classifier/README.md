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

## Timed comparison with local Qwen

The benchmark reads the [Webis-ConcluGen-21 corpus](https://webis.de/data/webis-conclugen-21.html) base training shard, which combines real r/ChangeMyView and debate arguments. Keep it in the ignored `classifier/private/` directory. Only one excerpt per deduplicated argument is sampled. Each excerpt is 5–40 words and 22–235 characters, drawn from source arguments at least 300 characters long. The seeded sample alternates between ordinary eligible excerpts and an enriched pool selected by wording cues. Cue matches select candidates and supply no evaluation labels.

Both models get the same excerpt without a topic. Ollama runs `qwen3.6:27b` at temperature zero with thinking disabled and a fixed catalogue rubric. Edge runs the default INT8 ONNX model through the harness's WASM inference module. The runner checks Ollama GPU residency and restricts browser requests to loopback. It writes aggregate metrics and a row-level log with hashes and label codes.

Exact agreement requires the same complete label set or the same abstention outcome. Micro precision, recall and F1 pool the eight mechanism labels. These percentages use Qwen as the reference. Evaluation against human-reviewed labels is a separate test.

```powershell
.\.venv\Scripts\python.exe -m pip install pyarrow==26.0.1
New-Item -ItemType Directory -Force classifier/private
$dataset = Invoke-RestMethod 'https://datasets-server.huggingface.co/parquet?dataset=webis%2Fconclugen'
$shard = $dataset.parquet_files | Where-Object { $_.config -eq 'base' -and $_.split -eq 'train' }
Invoke-WebRequest -Uri $shard.url -OutFile classifier/private/conclugen-base-train.parquet
.\.venv\Scripts\python.exe classifier/qwen_bench.py classifier/private/conclugen-base-train.parquet --seconds 600 --out classifier/artifacts/qwen-agreement-strict.json
```

The 601.23-second run on the RTX 5090 completed 3,444 comparisons with full GPU residency and zero invalid batches. The selected MiniLM-L6 browser model matched Qwen's full output on 1,554 excerpts (45.12%). Agreement was 49.19% on randomly sampled eligible excerpts and 41.06% on cue-enriched excerpts. Mechanism-level micro precision was 4.55%, recall 21.03%, and F1 7.48%. A baseline that always returned no match would have matched Qwen on 79.44% of the combined sample. The local run report is saved as `classifier/artifacts/qwen-agreement-strict.json`.

## Distil labels from the timed Qwen comparison

Run the timed comparison first and retain the resulting `qwen-agreement-strict.jsonl` and its corpus shard. The distillation runner reconstructs excerpts by hash and groups near-duplicate wording before a seeded 60/20/20 split. It uses Qwen positives, no-match examples, and insufficient-context labels. It compares the original browser predictions, a calibration-only control, a retrained six-layer MiniLM, and a retrained [twelve-layer MiniLM](https://huggingface.co/sentence-transformers/all-MiniLM-L12-v2). Thresholds are fitted on the calibration partition, with detection disabled for labels with fewer than three calibration positives.

```powershell
.\.venv\Scripts\python.exe classifier/prepare.py --with-l12
.\.venv\Scripts\python.exe classifier/distill.py
.\.venv\Scripts\python.exe classifier/distill_bench.py
.\.venv\Scripts\python.exe classifier/serve.py --web-dir classifier/artifacts/distillation/web
```

The browser benchmark runs the candidate ONNX models on the same reserved excerpts in Edge and writes agreement, model size and latency to `classifier/artifacts/distillation/browser.json`. The latency comparison uses twice the earlier baseline warm p95 on this desktop. Use the model selector in the experimental bundle to try the larger candidate.

The run used 2,066 training excerpts, 689 calibration excerpts and 689 reserved test excerpts. On mechanism labels, the retrained six-layer model reached 29.41% precision, 25.86% recall and 27.52% micro F1 against Qwen at 56.5 ms warm p95. The twelve-layer model reached 37.84% precision, 24.14% recall and 29.47% micro F1 at 112.9 ms warm p95. The original and calibration-only controls scored 7.92% and 14.97% micro F1, respectively. These scores measure agreement with the same Qwen labeler. The calibration split had zero guilt-appeal positives, so that label's detections were disabled for the experimental models.

## Detect five kinds of psychological pressure

The [Surviving a Psyop framework](https://mikemayne.github.io/surviving-a-psyop/nine_influence_mechanisms.txt) motivates five labels for wording that can be assessed in a short excerpt. They are shame or guilt, fear of consequences, doubt about your own judgement, identity or credibility pressure, and loss of agency. The detector scores the presence of cues and can report several kinds at once. It can also report no match or insufficient context.

The collector uses [ConvoKit's Winning Arguments archive](https://convokit.cornell.edu/documentation/winning.html), historical r/ChangeMyView posts and comments, and sends only short excerpts to local Qwen3.6 27B. Candidate cues guide sampling. Qwen supplies labels and a verbatim evidence string per label. The collector rejects labels that omit evidence or give a non-matching quote. Ordinary candidates and cue-matched negatives enter the same pool. Corpus text and annotations stay in ignored local directories.

```powershell
New-Item -ItemType Directory -Force classifier/private
curl.exe --fail --location 'https://zissou.infosci.cornell.edu/convokit/datasets/winning-args-corpus/winning-args-corpus.zip' --output classifier/private/winning-args-corpus.zip
.\.venv\Scripts\python.exe classifier/prepare.py --with-l12
.\.venv\Scripts\python.exe classifier/pressure_collect.py --rows 2400
.\.venv\Scripts\python.exe classifier/pressure_train.py train
.\.venv\Scripts\python.exe classifier/pressure_train.py benchmark
.\.venv\Scripts\python.exe classifier/serve.py --web-dir classifier/artifacts/pressure/web
```

Training, calibration, and testing use disjoint Reddit threads and groups of near-duplicate excerpts. The three browser choices are the small, medium, and large INT8 MiniLM-L3, L6, and L12 models. They share the same data partitions and label rubric. The benchmark measures agreement with Qwen on the reserved excerpts, as well as actual Edge WASM latency. The corpus is cue-enriched, and the report includes a separate ordinary sample; neither labels nor prevalence estimates have human validation. Benchmark latency compares to twice the warm p95 measured by the original browser benchmark at `classifier/artifacts/browser.json`.

The pilot retained 2,400 evidence-checked excerpts. The thread-separated partitions contain 1,412 training, 480 calibration and 508 test excerpts. Qwen ran fully on the RTX 5090. All three classifiers trained on CUDA and were evaluated using Edge's CPU WASM backend.

| INT8 model | Precision vs Qwen | Recall vs Qwen | Micro F1 vs Qwen | Warm p95 |
| --- | ---: | ---: | ---: | ---: |
| Small L3 | 27.27% | 16.07% | 20.22% | 36 ms |
| Medium L6 | 34.04% | 28.57% | 31.07% | 59 ms |
| Large L12 | 41.18% | 18.75% | 25.77% | 124 ms |

The simple cue baseline scored 28.80% micro F1 on this holdout. The medium model scored 18.60% on the 250 ordinary candidates. Qwen returned one insufficient-context example across the collection, so learned context detection was disabled for this pilot. The detailed local report is `classifier/artifacts/pressure/browser.json`.

## Compare context and reader concern in Qwen

The context experiment re-rates the pressure holdout using local Qwen. It presents the same target in three conditions. The first supplies the excerpt alone. The second adds text around the target in the original post and the end of its parent reply, when available. The third adds the reader's stated concern to the same context. The rubric stays fixed, and condition order is shuffled per batch.

The experiment replays the original archive sampler to recover the exact source post for each excerpt. Every retained label must quote the target precisely. When Qwen says surrounding material was essential, it must also quote that material exactly. These checks establish that the words are present. The test reports changes in agreement and flags without independent human adjudication.

```powershell
.\.venv\Scripts\python.exe classifier/pressure_context.py
```

The local report and resumable ratings are under `classifier/artifacts/pressure/context_experiment/`. No training step is needed.

The run recovered all 508 targets and retained 498 matched ratings after quote validation. Qwen flagged pressure on 79 excerpts alone, 74 with context, and 80 with context plus concern. Context changed 58 label sets, turning 21 no-match cases into flags and removing all flags in 26 cases. Qwen cited surrounding wording for five of the 32 newly assigned labels. The reader-concern prompt changed 22 label sets with the surrounding text held fixed. On 59 comparable complete misses from the preceding browser test, the neutral context prompt added flags to eight and cleared flags from seven. No model was retrained.
