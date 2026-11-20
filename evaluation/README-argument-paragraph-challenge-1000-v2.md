# Synthetic paragraph challenge, v2 — 1,000 cases

**Purpose:** a new development challenge for the browser-local argument analyser, separate from the original 200-row v1 corpus. The current observed v1 score is 90.0% exact at 99.7% precision. No v2 accuracy is known until a first run on the unchanged baseline.

## Dataset

Download `evaluation/argument-paragraph-challenge-1000-v2.json` and upload it to the Matcher Test Lab using **Arguments — single paragraph** / **Upload labelled JSON or JSONL**.

| Gold category | Rows | Expected argument | Reference label |
| --- | ---: | --- | --- |
| Supported inference | 250 | true | supported_conclusion |
| Unsupported inference | 250 | true | unsupported_conclusion |
| Contradictory inference | 250 | true | contradictory_claims |
| Qualified / undetermined | 125 | true | none (empty array) |
| Descriptive / no argument | 125 | false | none (empty array) |

All cases have stable IDs, original prose, expected argument presence, a reference reasoning label, a short rationale, and a **scenario_family** identifier. No model-generated expected paraphrase is provided.

The 1,000 unique paragraphs arise from **40 semantic scenario families, each with 25 controlled subject/number/wording variations**. There are zero verbatim overlaps with the previous 200-case benchmark. **This is not 1,000 independent argument forms**, and family-level correlation must be reported. The dataset is fictional and synthetic; it contains no sourced real-world quotations.

**Reference labels were assigned by the example author while constructing each scenario; they have not been independently human-adjudicated.** Review disputed examples before treating category scores as evidence of correctness. A mistaken gold label should be logged and fixed in a separately versioned corpus, not silently rewritten after a test.

## Integrity / freeze

- Version: v2, date: 20 November 2026.
- Git blob SHA-1 of the exact UTF-8 JSON file: `d76b2f1438e5122bc9d0bebb0e7d3c34856d0deb`.
- `scripts/validate-frozen-argument-corpus-v2.mjs` checks exact file integrity, counts, IDs, uniqueness, case types and family balance.
- CI deliberately **does not run the analyser or NLI model** on this corpus. It does not infer or change the labels.

## First-run protocol

1. Merge the corpus-only pull request **without modifying argument extraction, proof logic, NLI configuration or lab metrics**.
2. Record the exact analyser commit and local model/runtime versions.
3. Run `cd extension && npm run benchmark:dev`, then open `http://127.0.0.1:4173/extension/benchmark.html` in Firefox.
4. Choose **Arguments — single paragraph (structure + optional NLI)** and **Upload labelled JSON / JSONL**, then select `evaluation/argument-paragraph-challenge-1000-v2.json`.
5. Run the complete **1,000 / 1,000** before applying any improvements. Export and retain the first-run summary **and every failure**, with exact/structure/reasoning scores, precision, recall, negative false positives and elapsed time.
6. Analyze **which scenario families failed**, not merely which textual variants failed. Preserve the first-run report and corpus hash. Fix general rules on separate development tests; measure external validity on a new real-world, human-adjudicated holdout.

## Interpretation

The first-run v2 result measures performance on unfamiliar **synthetic texts**, not real-world reliability. Because these paragraphs and their labels are in a public repository, this is a reproducible benchmark but not a secrecy-protected blind set. Avoid claiming unbiased generalization from later rounds tuned against the same 1,000 cases. Real-world source-linked evaluation is a separate next phase.
