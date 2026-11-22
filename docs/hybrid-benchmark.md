# Hybrid detector experiment

These results document the configuration before retirement of the red patterns. The current training and benchmark inputs omit the retired questions.

The experiment inventories 81 catalogue entries and three runtime identifiers. It implements at least one textual construction for 33 entries: 19 techniques, 10 positive patterns, one concealed combination and three inconsistency patterns. The matrix records another 42 entries awaiting feature mapping and six whose relevant claim can require outside evidence or an inference about intent. Some implemented entries also have explicit gaps. See [readable coverage](hybrid-coverage.md) and the [machine-readable matrix](hybrid-coverage.json).

## Run locally

From the repository root with Node 22 or newer:

~~~sh
node scripts/test-hybrid-detector.mjs
node scripts/build-hybrid-coverage.mjs
node extension/evaluate.mjs --strict
node scripts/analyze-hybrid.mjs < passage.txt
node scripts/analyze-hybrid.mjs --ollama --complete < passage.txt
node scripts/evaluate-hybrid-detector.mjs --output=hybrid-pilot-local.json
node scripts/evaluate-hybrid-detector.mjs --arms=A --existing-semantic --output=hybrid-existing-local.json
node scripts/evaluate-hybrid-detector.mjs --full --limit=2 --arms=C,D --output=hybrid-full-local.json
node scripts/evaluate-hybrid-detector.mjs --cases=evaluation/hybrid-frozen-examples.json --arms=A,D,F --output=hybrid-frozen-local.json
~~~

In PowerShell, replace input redirection with `Get-Content -Raw passage.txt | node scripts/analyze-hybrid.mjs` and quote the whole `--arms=A,D,F` argument. The CLI writes trace JSON to standard output. Only pass an explicit output path to the benchmark if you want to save its results. The benchmark writes partial checkpoints after each arm. To run without Ollama, pass `--rules-only`.

For the browser lab, install the extension dependencies and build the workers from `extension/` with `npm install` and `npm run build`. From the repository root:

~~~sh
node scripts/install-hybrid-browser-model.mjs
node scripts/serve-benchmark.mjs
~~~

Open [Hybrid detector experiment](http://127.0.0.1:4173/extension/hybrid-lab.html). The page defaults to deterministic rules. Choose **Local Ollama** for the loopback Qwen service, or **In browser** for Qwen 2.5 0.5B in the browser worker. Installation downloads and checks the model separately. The browser adapter disables remote model loads and reads weights and WASM from the same local server. The installed Q4 ONNX file is 786,156,820 bytes and ignored by Git. [Qwen ONNX model and checksum](https://huggingface.co/onnx-community/Qwen2.5-0.5B-Instruct/blob/516c8d04add8a80c5228f32102b57953b8d421a9/onnx/model_q4.onnx)

## Scope and decisions

- Literal signals preserve original UTF-16 offsets. Curly apostrophes and whitespace change only in the literal working copy. The existing preprocessor supplies tentative orthographic and vocabulary flags with spelling correction disabled. A dictionary can be supplied by the caller; the isolated lab currently uses the built-in vocabulary.
- A paragraph is the semantic scope. Relational predicates ask about the same action, conclusion or person in a single call when the distinction matters. A choice and a penalty in unrelated sentences cannot satisfy the combined-relationship question merely by co-occurring. The implementation has no cross-paragraph relation solver or entity graph.
- The engine shares each scope's answer across patterns. Each model request has a fresh system/user pair. The validator requires three known fields and checks quoted evidence for exact, unambiguous occurrence before deriving offsets. A model's contrary answer is flagged without excluding the candidate. Exact deterministic contradictions can exclude a mapping. An already-supported finding gets at most one extra ranking point when supporting evidence overlaps required evidence. Scores are uncalibrated and have no effect on inclusion. Cross-document answer caching is disabled.
- Selective mode prioritises required questions shared by more mappings and promotes questions with observed cues. It retains fallback questions even without a literal trigger. It skips supporting-only questions and stops at the call budget. This is a heuristic whose reliability and latency still need broader measurement.
- Caps include 4,800 input code units, eight paragraphs, 1,800 code units per scope, 20 matches per literal question, a configured request budget and one malformed-response retry. Truncated scopes, unasked questions, malformed answers, timeouts and runtime errors retain separate states or reasons. Earlier paragraphs use the budget first.
- Text reaches the model as the original passage in a serialized user data field, including Unicode controls. Display uses textContent. Adapters offer no tools. The two scored injection cases produced no threat prediction in any Qwen arm. Unit tests also cover unexpected model properties, fabricated evidence, HTML-shaped output, Unicode controls and 100,000-character input. Two scored attacks cannot establish prompt-injection robustness, particularly for model-specific control tokens.

## Stock Qwen CLI results

Ollama 0.40.15, `qwen3.6:27b`, local digest prefix `a50eda8ed977`, Q4_K_M, llamacpp runner with integrated qwen3.5 renderer/parser. Thinking disabled, temperature 0, seed 42, context 4,096, output cap 220 tokens. The RTX 5090 reported 32,607 MiB total VRAM. During inference, `ollama ps` reported a 16 GB runner at 100% GPU and NVIDIA process monitoring showed the live llama-server process. Timings below measure the warm-run CLI wall time including preprocessing and model calls. Other development inference was active during some runs. No cold-start or peak-memory benchmark was performed.

The first prompt illustrated the answer enum as an array. Qwen copied that array into output, which failed runtime validation. The measured follow-up makes the answer a scalar and passes a JSON Schema to Ollama. The wording experiment holds that schema fixed and changes only whether the prompt includes static examples and matched cues.

### Development pilot

Twelve fictional passages, eight labelled pattern occurrences and 17 checked question answers. The pilot bank covers the questions annotated somewhere in these cases. D can still ask questions for which a particular case has no intermediate annotation. Counts and timings appear in the [pilot results](hybrid-pilot-schema-results.json).

| Arm | TP | FP | FN | Precision | Recall | Micro F1 | Calls | Total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| A. Existing deterministic matcher | 1 | 0 | 7 | 100% | 12.5% | 22.2% | 0 | 60 ms |
| B. Hybrid deterministic only | 0 | 0 | 8 | — | 0% | 0% | 0 | 12 ms |
| C. Complete pilot bank, tailored | 8 | 0 | 0 | 100% | 100% | 100% | 133 | 214.7 s |
| D. Selective pilot bank, tailored | 8 | 0 | 0 | 100% | 100% | 100% | 85 | 132.6 s |
| E. Complete pilot bank, baseline wording | 8 | 2 | 0 | 80% | 100% | 88.9% | 132 | 208.5 s |
| F. Checked feature answers | 8 | 0 | 0 | 100% | 100% | 100% | 0 | 3 ms |

C answered 17/17 checked questions and got 16 right. D answered 12/17 and got all 12 right. E answered 17/17 and got 14 right. D asked 36% fewer questions than C with the same scored pattern predictions. In E, the reason to wash a shirt cold elicited a threat false positive and a scheduling query elicited acknowledged uncertainty. The no-prediction baseline has zero recall and undefined precision.

The existing matcher with MiniLM embeddings also found 1/8 scored occurrences without a scored false positive on this pilot. This arm covers the prototype matcher, positive matcher and concealed matcher. It does not include the extension's separate NLI or argument passes. [Existing semantic pilot results](hybrid-existing-semantic-results.json)

The separate [full-bank smoke test](hybrid-full-smoke-results.json) ran C and D on the first two development passages. C used 72 calls in 95.3 s. D used 62 in 72.9 s. Both found the implied threat and returned zero findings on the benign surprise. D skipped two annotations about supporting features. These two passages demonstrate execution of the whole bank with small-sample performance left open.

### Frozen synthetic check

The [frozen fixtures](../evaluation/hybrid-frozen-examples.json) use 12 new fictional passages covering eight labelled occurrences in seven patterns, including a choice and penalty aimed at different people. Labels were authored for this experiment without independent adjudication. The question/routing configuration was frozen for the run. The results concern the annotated bank and use different scenario families from the pilot where possible. They do not estimate ordinary real-world prevalence or production accuracy.

Selective Qwen found 8/8 labelled occurrences and added three false positives, for 72.7% precision, 100% recall and 84.2% micro F1. Macro F1 was 87.6%. It answered all 15 checked questions and got 14 right. Ninety-six calls took 73.8 s. The existing deterministic arm found zero of the scored occurrences. Checked aggregation returned exactly the expected findings. See [per-pattern scores, question counts and case predictions](hybrid-frozen-results.json).

The three extra findings were anecdotal evidence for a claim about two neighbours, appeal to ignorance in the phone-backup anecdote, and hasty generalisation in the key-fitting example. These errors show that exact matching evidence does not validate the model's interpretation. Keep this fixture set frozen. The next experiment should test stricter semantic predicates and a smaller browser model on a newly annotated development set, then use independently labelled source-disjoint holdout passages before changing defaults.

### Existing suite

The existing Firefox rule matcher scored 290/290 exact matches on expanded cases from 57 curated seeds. The existing MiniLM-plus-rules suite reached 97.6% exact match, 96.4% precision and 100% recall, with seven cases requiring investigation. The hybrid routing, strict output, offset, spelling and preprocessing checks passed. The full extension build including the browser model bundle passed with Transformers.js 3.8.1 and esbuild 0.25.12.

## Browser smoke tests

The desktop in-app browser ran the deterministic worker with zero model calls. The same worker then reached loopback Ollama and returned bandwagon with original evidence for the passage about friends using an app. The run made 31 calls and returned three additional findings. Two of those over-labels informed narrower development predicates before the frozen check.

The original SmolLM2 135M Q4 ONNX checkpoint ran in the browser worker with the single-threaded WASM backend, greedy decoding and up to 112 generated tokens per request. On the pilot's implied threat, all six attempted questions ended in `malformed_output` after 12 calls including retries. The UI showed zero supported findings.

The replacement Qwen 2.5 0.5B adapter constrains each response to one of four allowed single-token choices and serializes the result in code. The first trial returned “yes” on all 12 questions for a CDC advisory. The revised adapter scores two prompts per question in one batch, swapping the “yes” and “no” labels. A disagreement yields “unknown”. The selective browser budget is six questions. Browser positives show the examined passage, with no automatic supporting-substring highlight. Phone and peak browser memory measurements remain open.

### Public-source check

The revised browser worker returned six valid unknown answers on the CDC generator advisory in 58.1 s, including an abstention on whether the safety recommendation had a stated reason. It returned six valid unknown answers on the CMA’s example of hotel scarcity and popularity copy in 63.0 s. The budget did not reach the popularity question in the second passage. Neither run emitted a supported finding or a malformed answer. The two concurrent desktop runs include model loading. They demonstrate controlled output and abstention, with detection quality still unresolved. [CDC advisory](https://www.cdc.gov/carbon-monoxide/about/index.html) · [CMA evidence review](https://www.gov.uk/government/publications/online-choice-architecture-how-digital-design-can-harm-competition-and-consumers/evidence-review-of-online-choice-architecture-and-consumer-competition-harm)

The browser’s Local Ollama option answered all 31 attempted questions on each excerpt. It returned transparent reasoning and supported conclusion for the CDC advisory in 40.1 s, with no threat finding. It returned no supported catalogue match for the booking copy in 40.4 s. The passage still contains scarcity and popularity cues. The result is limited to the configured patterns and does not establish that the copy is harmless.
