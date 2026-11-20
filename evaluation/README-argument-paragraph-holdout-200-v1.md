# Frozen synthetic paragraph-argument benchmark, v1

This is a **new synthetic holdout** for the browser-local paragraph argument analyser. It is not a scrape of newspaper articles, other websites, conversations, user reports or any copyrighted source. Every paragraph is newly authored fictional text.

## File and distribution

`evaluation/argument-paragraph-holdout-200-v1.json` is a valid upload for the Matcher Test Lab's **Arguments — single paragraph (structure + optional NLI)** mode. Load it with **Dataset: Upload labelled JSON / JSONL**. The file has exactly 200 uniquely identified cases, including author-provided reference labels and a brief rationale for each label.

| Gold case kind | Count | `expected_argument` | `expected` |
| --- | ---: | --- | --- |
| Supported inference | 50 | `true` | `["supported_conclusion"]` |
| Unsupported inference | 50 | `true` | `["unsupported_conclusion"]` |
| Contradictory inference | 50 | `true` | `["contradictory_claims"]` |
| Explicit but indeterminate / hedged | 25 | `true` | `[]` |
| No explicit inference | 25 | `false` | `[]` |

All rows have `id`, `text`, `expected_argument`, `expected`, `case_kind`, and `label_rationale`. The optional `expected_model_conclusion` is deliberately **not** pre-filled: this is intended to test argument extraction and inferential scoring rather than one particular extractor's expected paraphrase.

## Lock and provenance

**SHA-256, UTF-8 source file (including terminal newline):**

`886fc6e3b6201544c374caf091d1c3b50532e089c9aa355132ff2d1fdc29b8d8`

The original texts and gold labels were drafted **before running the existing analyser against this corpus**. The local checksum/integrity test checks only the JSON schema, the category counts, uniqueness and this hash; it **does not call** `extractArguments`, `analyseArguments`, any NLI model, or the Firefox worker on these paragraphs.

These are *author-generated synthetic labels*, **not independently human-adjudicated** labels. Gold labels describe what follows from the supplied premises, not externally verified truth and not the author's intent. If a reviewer identifies a genuinely disputed or erroneous label, log it transparently and publish a new version rather than silently editing v1. Preserve the first-run results and original SHA for comparison.

Because this JSON is available in the public repository, it is **reproducible but not a secrecy-protected blind set**. For claims about performance on genuinely unseen articles, test an independently collected, carefully annotated real-world corpus separately. Avoid deliberately implementing rules to fix this frozen synthetic set and then citing the same dataset as an unbiased score.

## Protocol

1. Merge the corpus-only PR **without changing any analyser implementation or thresholds**. Record the resulting repository commit SHA.
2. In `extension/`, run `npm run benchmark:dev`; open `http://127.0.0.1:4173/extension/benchmark.html` in Firefox.
3. Choose **Arguments — single paragraph (structure + optional NLI)** and **Upload labelled JSON / JSONL**. Select `evaluation/argument-paragraph-holdout-200-v1.json`.
4. Run **once against the frozen model** and save the exact-match, per-category, precision, recall, false-positive, latency and full failure report. Record the model/version and repository commit.
5. Do **not** tune or rewrite labels based on the result. Use a separate *development* corpus for investigating defects, then measure changes against a fresh independently labelled v2 or real-world holdout.

## Annotation guidance

- **Supported:** the stated premises explicitly establish the conclusion with matching subjects, scopes, dates and quantities.
- **Unsupported:** the argument asserts a definite conclusion whose scope, causality, reliability or precise magnitude demonstrably goes beyond the evidence given. This is **not** a claim that the conclusion is false.
- **Contradictory:** the asserted conclusion cannot coexist with the premises at the same time, object and scope.
- **Indeterminate:** a tentative, contingent or qualified inference is not established or refuted strongly enough to label supported/unsupported/contradicted; the correct reference result is abstention.
- **No explicit inference:** the passage is descriptive, quoted or explanatory without an assessable author-asserted premise-to-conclusion link.

The corpus deliberately includes hard negatives: disagreement across different dates, quotation vs endorsement, tentative forecasts, purposive `so that`, attribution, exact-versus-estimated quantities and one-way conditional rules. The aim is to evaluate the integrity of arguments, **not** infer anyone's motive or political allegiance.
