# Evaluation fixtures

Use the fictional cases in fixtures.json to test whether a model recognises relevant textual patterns without over-labelling ordinary writing. Include positive, negative and ambiguous examples. Measure precision and false positives, and test that every quotation is exact.

Evaluate whether the model:
- identifies the relevant technique;
- explains the observable feature accurately;
- describes a plausible effect on the reader;
- stays concise and does not speculate about motives;
- avoids labelling ordinary writing without a clear textual basis.

The user-facing sequence is **Recognise. Report. Disengage.** The model's job is recognition. Reporting decisions remain with the reader, and the interface should make disengagement the natural next step.

Update expected candidates only after human review. Do not use private user material or full copyrighted articles in the public evaluation set.

## Independent matcher benchmark

This repository has an independent test runner that loads the **same matching core**
as the Firefox extension. It does not launch Firefox, read a webpage or modify a
site. Run from the repository root:

    node extension/evaluate.mjs --strict

This checks the deterministic rules over 51 human-labelled fictional seed examples
expanded into 260 examples (single line, nearby text, multiline text, and
long selections). A failed expected classification makes the command exit nonzero.
The same command runs in pull-request validation.

To evaluate the **actual MiniLM semantic model**, first run:

    cd extension
    npm install
    npm run evaluate:ai

This downloads and caches the same quantised model used by Firefox, and then
evaluates the shared algorithm with both deterministic and AI matching. The
model run is optional because it requires downloading the model and installing
Node dependencies; it is not part of GitHub CI by default.

Use `node extension/evaluate.mjs --json` to obtain machine-readable metrics.
Use `--output=reports/matcher-results.json` to save the full report (create
the output folder first). Use `--fixtures=/absolute/path/to/examples.json`
for a different set of labelled cases. The format of
`evaluation/matcher-examples.json` is a `cases` array containing `id`,
`text`, `expected` (an array of technique IDs), and optional `gate`,
with a `variants` array controlling deterministic expansions.

The report includes exact-match accuracy, micro precision/recall, per-technique
recall, negatives falsely matched, and a confusion breakdown. Inspect failures
individually before editing rules, examples or similarity thresholds. The
synthetic expansions check robustness but are **not independent real-world
examples**: measured accuracy on these generated cases is not a trustworthy
estimate of performance on arbitrary writing. Keep a separate, human-reviewed
holdout set as new real-world testing examples are collected (without including
private information).

The runner's `--semantic` option uses the real model. By contrast the standard
`--strict` run checks rule behaviour without the model; neither test needs the
Firefox browser UI. Exact selected-text highlighting and DOM extraction still
need a few manual in-browser smoke checks after significant UI changes.
