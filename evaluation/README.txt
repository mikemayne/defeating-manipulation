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


## Broader technique recognition (local AI)

The extension catalogue now contains representative *usage statements* for all
54 negative technique categories. In earlier versions, 15 categories had neither
semantic prototypes nor deterministic rules, so the algorithm could not possibly
identify them. The shared matcher still uses the same conservative semantic
similarity threshold and margin; neither was lowered.

Structural rule coverage has also expanded for distinguishable argument forms.
Run `node scripts/test-build.mjs` to check the 57 independent fictional
positive and neutral contrasts in `evaluation/recognition-contrasts.json`.
These tests validate rules and offsets, but do *not* certify MiniLM performance.

Keep the independently collected news-paraphrase JSON held out of this repository
and run it through the local test lab after each update. Compare false positives
and recall to the previous 185-case AI benchmark (10% recall, zero false
positives). Do not claim an AI improvement until the actual offline model has
run on the new source. A model may lose precision when more prototype examples
are introduced; this is why we keep separate held-out cases.


## Experimental second-pass inconsistency benchmark

The local page's new **Inconsistencies — local NLI** mode uses the same
`extension/src/consistency.mjs` claim pairing and bidirectional thresholds
as the Firefox extension. The same `extension/src/nli-inference.mjs` module
loads and runs the quantised local DistilBERT MNLI model, properly tokenising
the two statements as an input pair.

The initial `evaluation/inconsistency-examples.json` contains 200 fictional
cases (100 labelled with `argument_inconsistency` and 100 labelled as ordinary
or context-dependent noncontradictions). These share topics and templates.
They exercise the plumbing and common error cases; they are not 200 independent
real-world observations. The default run is 200 cases; a larger count repeats
the seed set with deterministic variants.

For a more meaningful benchmark, upload a new labelled JSON or JSONL file:
    
    {"id":"contradiction-1","text":"The service never charges fees. The service always charges fees.","expected":["argument_inconsistency"]}
    {"id":"different-dates-1","text":"In 2024, the service charged fees. In 2025, the service was free.","expected":[]}

Do not mix manipulation technique labels with `argument_inconsistency` labels
in one run; each mode has a separate scoring interpretation. Use unrelated
topics and genuine counterexamples in a private held-out file for testing.
The lab does not upload selected text or datasets, and it does not include
these tests in the public website deployment.

The GitHub checks use synthetic NLI scores, plus module and fixture validation.
They do **not** run the full neural model in a Firefox browser; a real local
NLI-mode smoke test is required to validate model download and inference.


## Reported disagreement false-positive regression

The first live 200-case local NLI run had 100% recall, 83.3% precision,
and 20 false positives. All twenty falsely flagged an accurately attributed
disagreement between a manager and a spokesperson. The shared candidate-pair
filter now skips different, clearly attributed sources, before running NLI.
This preserves contradictory claims from the same source.

Run `node scripts/test-build.mjs` to check the original 200 synthetic NLI
cases with deliberately high mock contradiction scores, plus the 25 independently
worded contrasts in `evaluation/inconsistency-attribution-contrasts.json`.
These deterministic tests validate attribution filtering, not neural model
accuracy. Re-run the **real** local 200-case lab after rebuilding.

The public catalogue now contains **Inconsistent or unsupported reasoning**.
It explicitly distinguishes contradictory claims from conclusions insufficiently
supported by the evidence **provided** in the passage. The latter is a planned
whole-argument analysis feature, not a capability established by these tests.


## Public red argument-consistency library

The standalone inconsistency pattern pages are generated from
`inconsistency-patterns.json`. They are separate from the blue
manipulation catalogue and green positive catalogue. The builder renders
all entries and includes them in the sitemap automatically; validation
checks each entry's page and red background. A new pattern only needs
another JSON entry, not a new hardcoded HTML component.

Current local NLI tests cover claim contradictions. Unsupported or
supported *conclusions* are library descriptions for a future
whole-argument analyser and should not be scored as capabilities of the
current contradiction model.


## Positive-pattern matching baseline

The public `positive-patterns.json` catalogue is now recognised locally by
the Firefox selection worker as well as the website. Green pattern detection
runs separately from the existing blue manipulation and red inconsistency
passes; blue wins when highlighting would otherwise overlap green.

The test lab offers `Positive patterns — rules only` and
`Positive patterns — rules + local AI` modes. The default
`evaluation/positive-matcher-examples.json` contains 72 fictional labelled
cases covering all 12 current green patterns (12 public examples, 24 fresh
paraphrases, and 36 neutral/negative contrasts).

The GitHub build validates the rule-only baseline. Actual semantic model
precision and recall must be measured in the local Firefox browser with
`Positive patterns — rules + local AI`; the CI suite does not download
MiniLM weights. This synthetic baseline is not an independent generalisation
benchmark. To measure precision, introduce new real-world held-out examples
and cases where pleasant wording disguises pressure or a demand.

Do not treat co-occurrence of green and blue matches as proof of concealment.
That relationship has not yet been trained or tested. The local matcher shows
both patterns where they occupy separate spans, and preserves blue if they
overlap.


## Turquoise relation-level benchmark (not just co-occurrence)

The Firefox analyser now checks for a positive rhetorical opening being
undermined by nearby coercion. Definitions are maintained as data in
`extension/src/concealed-patterns.json`, and detection runs through the
shared `extension/src/concealed-matching.mjs` module.

The test lab provides **Concealed manipulation — relationships (rules)**
and **Concealed manipulation — local AI + relationships**. For the second
mode, MiniLM first detects positive and negative patterns separately;
their matches become additional evidence for a structural relationship
test. A quoted disagreement, unrelated negative phrase or normal
information such as an application deadline is not automatically concealment.

The 96-case sample file `evaluation/concealed-pattern-examples.json`
has 48 positive examples for four structural variants and 48 intentionally
challenging non-examples. Expected labels are pattern IDs from the
concealed-patterns JSON, e.g. `choice_with_coercion`,
`respect_with_penalty`, `empathy_with_guilt`, and
`independence_with_control`. Upload a new JSON or JSONL file with
`expected: []` for a non-example.

GitHub Actions tests the explicit relationship rules over 480
deterministically generated variants and verifies the browser integration.
It does **not** run MiniLM inference in Firefox: the new **local AI +
relationships** mode is needed to measure behaviour under real local
embedding outputs. These fixtures are constructed for regression testing,
so do not equate a perfect score with real-world accuracy. Use a newly
written held-out set containing harder mixed and contextual statements.


## Whole-argument support benchmark

`evaluation/argument-support-examples.json` contains 96 fictional
labelled examples: 24 each of supported, unsupported, contradicted,
and non-assessable text. The argument analyser is in
`extension/src/argument-analysis.mjs`, using the **same NLI model and
scorer** as the existing contradiction pass.

The parser only targets a stated inference ("Therefore", "Thus", "This
proves", etc.) and gathers up to five premise sentences, at most 780
characters, across adjacent paragraphs. It caps the total number of
conclusions in a selection, so its work is bounded. Supported verdicts
appear in the benchmark but are not red-underlined in Firefox. Contradicted
and insufficiently supported conclusions are underlined red; ambiguous NLI
results abstain. Neutrality is not proof of falsehood or malicious intent.

The test lab exposes a new **Arguments — premise and conclusion (local
NLI)** mode. In uploaded JSON/JSONL tests, expected is one of
`["supported_conclusion"]`, `["unsupported_conclusion"]`,
`["contradictory_claims"]`, or `[]`.

GitHub validation covers hundreds of deterministic parsing/scoring cases
and preserves the old 200-case contradiction test. It does **not**
download the local NLI weights. The actual model must be evaluated
separately in Firefox. Meaningful validation requires new examples with
unstated premises, uncertain conclusions, partial evidence, long-range
dependencies and shifts in population, time or causal claims.


### Follow-up to 96-case real-model baseline

Initial `argument_support` real-model results: exact 84.4% (81/96);
precision 96.6%, recall 79.2%, zero false positives in 24 no-argument
controls. Of the 15 errors, 8 were missed contradicted conclusions,
5 missed unsupported conclusions, and 2 supported conclusions were
called unsupported. All 72 labelled inferences were extracted correctly.

The support scorer now uses both the full combined premises and each
premise separately. This should avoid masking a direct contradiction
or an entailed fact behind irrelevant additional statements; it also
preserves combined-premise reasoning. Exact textual repetitions are
recognised as supported even when a neural model scores a concatenated
passage as neutral. The failure-copy export includes full local NLI
forward/reverse class scores for every premise and the combination.

CI tests controlled scores to validate the fusion policy and abstention,
not actual model performance. Rerun the 96 cases unchanged in the
Firefox **Arguments — premise and conclusion (local NLI)** mode and
inspect the expanded failure report to decide whether further model
or confidence-policy changes are justified.


### Distinguishing missing support from a contradiction (96-case retest)

The second real-model run on the *unchanged* 96 argument cases achieved
93/96 exact (96.9%), 98.6% precision and 95.8% recall, with zero false
positives among the 24 no-argument controls. All 24 supported and all
24 genuinely contradicted conclusions were detected; the remaining
three errors were all cases of insufficient support.

The local NLI sometimes produced a near-certain **forward contradiction**
when a premise merely failed to justify an unrelated conclusion, with
a near-zero contradiction score in the opposite direction. Strongly
asymmetric results are now treated as evidence that the conclusion
**isn't established by the supplied premises** rather than proof of
a contradiction. Broad universal conclusions (`every`, `all`,
`each`) are also treated as unsupported when the cited evidence
describes only a narrower positive instance and gives no opposing
evidence. Explicit negation, exclusions and contrary predicates remain
eligible for the contradiction category.

`evaluation/argument-evidence-contrasts.json` contains all three
recorded NLI diagnostic traces plus independently worded controls.
CI replays the exact recorded scores and verifies that genuine counter-
examples, clear negation, supported conclusions and ambiguous outputs
are not silently reclassified. This validates the **decision rules**;
it does not rerun the real local neural model.

Rerun **Arguments — premise and conclusion (local NLI)** using the
same default 96 cases to measure the real-model improvement. The
failure-copy report now also includes the decision reason
(`scope_expansion` or `asymmetric_nli`) where applicable. The
quantifier check is deliberately limited, not a general proof engine.


## Authentic held-out real-world corpus protocol

Run `cd extension && npm run benchmark:dev`, then open
`http://127.0.0.1:4173/extension/real-data.html`. The local collector
links to real statistical, parliamentary, technical and public-report
sources, but deliberately **does not invent or pre-label authentic
excerpts**. Select continuous original paragraphs; don't add an inference
marker or modify conclusions. Record the original source title/URL, a
short rationale, and a **human label before model testing**.

Use two separate strategies:
- `natural`: consecutive, unscreened passages (to measure real prevalence,
  false alarms and missed implicit conclusions).
- `challenge`: naturally occurring cases selected for an argument,
  regardless of whether the inference is supported.

If a passage's correct label is disputed, use `uncertain`, which is
saved locally but excluded from the exported JSON. For scored text with
no meaningful assessable argument, use `none`, exported as `expected:[]`.
A conclusion unsupported by *provided* premises is not necessarily false.
Use authentic contradiction only when statements cannot both hold under
the same circumstances; disagreement between quoted people is not itself
a contradiction by the article's author.

Export `real-argument-benchmark.json`, then select **Arguments —
premise and conclusion (local NLI)** and **Upload labelled JSON / JSONL**
in `extension/benchmark.html`. The test lab accepts the same existing
`{id,text,expected}` shape with additional `source_url`,
`source_title`, `track` and `rationale` fields. It reports natural
and challenge metrics separately; copied failures include source
provenance and the manual annotation rationale. The code neither
fetches outside articles nor uploads excerpts: all labels and full
text remain on the local machine.

A perfect generated-test score is not a population accuracy estimate.
Blind sampling and independent human labels are essential. Only publish
real-world accuracy with the size, selection procedure, class mix,
inter-rater disagreement, exclusions and failure examples. Verify
rights before sharing excerpts; OGL and Open Parliament material has
its own attribution conditions.


## Retired local browser instruction-model experiment

The optional Qwen2.5-0.5B browser experiment was discontinued after
measurement, not merely because of code-level tests. The 23-case
real-source run took 507.4 seconds and all five supported arguments
returned malformed model outputs. A single-case rerun after simplifying
the output format took 94.4 seconds and still produced meaningless
tokens rather than a usable verdict; the browser experience was
unacceptable. No evidence of real reasoning improvement was obtained.

The experimental model import, execution code and test-lab mode were
removed. CI prevents accidental reintroduction of the heavy
text-generation path. The fast local NLI argument analyser, original
contradiction detector, positive patterns and concealed-pattern
checks remain unchanged.

The key research issue remains: the MNLI model's neutral category
means a hypothesis is not entailed, **not** necessarily that the
premise provides no reasonable inductive or probabilistic support.
Future evaluation should use genuine, blindly labelled examples from
multiple domains, with appropriate abstention, without reusing this
failed browser generator or gaming scores on the same five passages.


## Conservative no-underline abstention for neutral NLI results

After a 94.4-second unusable single-case local instruction-model test,
we returned to the existing fast local MNLI classifier. Its neutral
output must not mean "the premises provide insufficient evidence":
that is a different, more demanding judgement than NLI entailment.

When a neutral or highly asymmetric score is the only basis for
calling a factual conclusion unsupported, the analyser now performs
a cheap second **scope and certainty** check. Clearly overstated
universals, guarantees and superlatives may be marked unsupported.
Otherwise it **abstains and does not underline**. Qualified scientific
inferences in particular are not treated as errors merely because the
NLI model could not deduce their conclusion. A successfully verified
contradiction or supported fact retains its original outcome.

Benchmark diagnostics explicitly distinguish "insufficient evidence
to judge — no underline" from the positive finding "insufficient
evidence provided to support this conclusion". In deterministic CI,
the five authentic score traces from the 23-case pilot all abstain
without red marking; 96 generated argument cases retain their expected
verdicts with controlled scores, and independent contrast cases check
true overclaims, genuine contradictions, entailments and abstentions.

Accuracy on a new, balanced real-world corpus is **not measured** by
those controlled-score tests. Abstention may reduce both false alarms
and recall; report coverage and the proportion of uncertain cases
alongside exact accuracy on future live benchmarks.

## Frozen 200-case synthetic argument holdout (v1)

New reproducible, **fully synthetic** benchmark:

- Cases: `evaluation/argument-paragraph-holdout-200-v1.json`
- Method and frozen SHA-256: `evaluation/README-argument-paragraph-holdout-200-v1.md`
- Integrity-only CI: `node scripts/validate-frozen-argument-corpus.mjs`

There are 200 original fictional paragraphs: 50 supported, 50 unsupported,
50 contradictory, 25 inconclusive/hedged arguments (expected abstention)
and 25 nonarguments. Each case has an author-provided label rationale.
The corpus was authored and labelled before any model predictions.
These reference labels are **not independently human-adjudicated**.

Upload the JSON in the Matcher Test Lab under **Arguments — single paragraph
(structure + optional NLI)**, record the first run against an unchanged
analyser, and do not subsequently tune the engine on this version of
the holdout. The integrity check never executes parser or model inference
against these paragraphs. For a credible generalisation claim, also test
a separate, independently annotated real-world set.
