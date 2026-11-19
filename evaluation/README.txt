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

## Local graphical benchmark

The optional Matcher Test Lab webpage uses the **exact matching-core JavaScript
module** imported by the Firefox extension. It runs the matcher in a separate
Web Worker and does not send test text or results to an online service.

On a machine with Node.js installed:

    cd extension
    npm install
    npm run benchmark:dev

Open http://127.0.0.1:4173/extension/benchmark.html in Firefox. Leave the
terminal running while you use the lab. Ctrl+C stops the local server.
The single command builds both the extension worker and the benchmark worker,
then serves only the necessary files on loopback. There is no need to reload
the Firefox extension for each test.

Choose *Rules only* for quick bulk regression testing, or *Rules + local AI*
to exercise the same quantised MiniLM model used by the extension. The latter
downloads model weights on its first run and caches them in the browser. The
browser needs sufficient local memory and processing time for the test size.

By default the page lazily generates cases from 51 manually labelled fictional
seed statements; it allows up to 1,000,000 generated cases, without holding
them all in memory. The user interface displays a progress counter, then only
aggregate accuracy statistics, a table of common classification mistakes, and
a **Copy failure details** button. For large runs the clipboard report includes
every confusion count and the first 500 complete failures (not every failure).
You can stop a run and inspect partial results.

You can also import a local .json or .jsonl file containing manually labelled
cases of the shape:

    {"id":"example-1","text":"Everyone believes it, so it must be true.","expected":["bandwagon"]}
    {"id":"example-2","text":"The document was published on Tuesday.","expected":[]}

For .json files use either an array of these objects or {"cases":[...]}.
The uploaded file is analysed as-is, without synthetic expansion. The input
file stays in the browser; it is never uploaded by the test lab.

**Accuracy caveat:** Repeating a few hand-labelled sentences in many contexts
is excellent for catching regressions, missing matches and interference between
lines, but it does not establish accuracy on novel writing. As the library
grows, add more independently written, reviewed examples and keep some aside
as a held-out test set for genuine generalisation measurements. The local lab
is intentionally *not* copied into the public GitHub Pages deployment.
