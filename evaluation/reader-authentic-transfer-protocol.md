# Authentic GUM training transfer: source-separated experimental protocol

## Objective

Test whether authentic, human-annotated discourse examples improve the reader's
KEEP / AND / BUT classifier beyond the existing 402 synthetic training examples.
**Do not infer a real-world three-class accuracy score** from this pilot. GUM
GDTB relation annotations provide provisional AND/BUT gold, but no verified KEEP.

The separate synonym/nonstandard-vocabulary checker from PR #98 is already
merged into the extension's preprocessing path. This transfer experiment retains
its own **original, frozen GUM text** for comparability and does not change the
synonym logic. The purpose here is training-distribution evaluation, not
preprocessing accuracy.

## Frozen new document split

The revision-pinned manifest is
`evaluation/reader-authentic-transfer-documents-v1.json`. It specifies **72
entirely new source documents**, none in the original 250-case GUM pilot's
source registry, in twelve genres:

- **36** source documents reserved for real training (up to 12 eligible
  implicit relations per document)
- **24** different documents reserved for an unseen test (same maximum)
- **12** documents reserved for blind human label review only

Some documents may produce zero eligible full-sentence implicit annotations;
the actual number of *contributing* documents is reported separately. No
observations from the test or review documents enter model fitting.

The sampling policy chooses up to four BUT relations first within each document
then fills from AND examples, with a fixed SHA-256 order. Therefore class
proportions in both sets are **intentionally stratified**, not the natural
frequency of these relations in prose. All labels still originate from GDTB's
human annotations using the previously documented conservative mapping.

## Run the new authentic-data experiment

In your current repository, with the existing model caches:

```powershell
git pull
node scripts/build-reader-gum-transfer.mjs
node scripts/evaluate-reader-gum-transfer.mjs --preview
node scripts/evaluate-reader-gum-transfer.mjs --max-errors 5
```

First, the builder downloads pinned `.rels` sources (or reuses the local cache),
validates document partitions, then generates:

- `evaluation/reader-gum-transfer-v1.json`: authentic AND/BUT training
  and held-out source text, with provenance and integrity hash
- `evaluation/reader-gum-keep-review-queue-v1.json`: deliberately
  **unlabelled** naturally adjacent sentence pairs for subsequent human review

The evaluation scores **new** GUM training and test rows with local GPT2,
masked BERT, embedding and NLI models. It keeps their scores in separate
resumable `reader-gum-transfer-*-` cache files and does not edit the previous
GUM or synthetic scores. An `--offline` rerun requires all new caches to exist.

The script fits both classifiers with **identical settings** and evaluates
each on the identical newly held-out document set:

1. Existing 402 synthetic cases **only**
2. Those exact 402 synthetic cases **plus** the new GUM training documents

It compares three predeclared feature sets: full linear + lexical fusion,
without BERT period/hyphen features, and without BERT punctuation features
while keeping BERT contrast.

Output: `evaluation/reader-gum-transfer-results-v1.json`, with accuracy on
mapped AND/BUT labels, class recall, balanced recall, KEEP predictions,
confusion matrices, changed predictions, correct recoveries and regressions.
An always-AND prediction can score artificially highly because AND dominates
GUM. **Class recall and balanced recall are essential.**

The first evaluation on this split should be retained as the unmodified
baseline. Do not iteratively adjust thresholds or model choice to optimize
this held-out set and then call it independent.

## Next experiment: BUT reweighting on training documents only

A separate training-only diagnostic is available to address weak authentic
contrast recall without tuning against the **already inspected** 217-case
test. It does not change the merged implicit-conclusion phase (PRs #99–100)
or the synonym checker (PR #98).

```powershell
git pull
node scripts/evaluate-reader-gum-but-cv.mjs --preview
node scripts/evaluate-reader-gum-but-cv.mjs
```

The experiment reuses the cached 402 synthetic scores (including genuine
synthetic KEEP examples) and the 308 authentic **training** scores. It
partitions only authentic training data into five document-disjoint folds,
always fitting on the 402 synthetic rows plus other authentic training
documents. The 217-case authentic holdout and its score caches are neither
loaded nor evaluated.

The old balanced linear fusion is unchanged by default. The experimental
training loss compares predeclared relative BUT multipliers **1.0, 1.4,
2.0 and 3.0**, using two existing feature configurations (full fusion and
without period/hyphen). Training-only selection maximises pooled balanced
AND/BUT recall, with a smaller weighting preferred at equal scores.
It also reports individual class recall and KEEP prediction counts.
These class-weight hypotheses are diagnostics, not the production model.

Output: `evaluation/reader-gum-training-only-but-cv-v1.json` (gitignored).
The target test was already inspected, so another score on it would be
exploratory and not independent confirmation. A future new document split
must be frozen before testing any revised classifier. Without independently
annotated authentic KEEP cases, three-class performance remains unmeasured.

## Training-only contrast expansion beyond the original 36 documents

We first relaxed the original four-BUT-per-document limit while preserving
full-sentence GDTB annotation rules. The pinned-source check found only
**three more eligible BUT examples** in the same 36 training documents.
Therefore simply raising that cap would not substantially address poor
contrast recall.

The next training-only source manifest,
`evaluation/reader-gum-contrast-expanded-documents-v1.json`,
was frozen **before examining its annotations**. It reserves 118 previously
unused GUM documents across sixteen genres for training, and a further
39 documents which **are not read or used** and remain untouched for future
independent validation. All are disjoint from the original 250-case pilot,
existing 36 train / 24 test / 12 review documents, and each other.

Build the additional genuine GDTB BUT examples using the same conservative
requirements (implicit, adjacent full sentences, no leading explicit
connective). The original corpus and both original test and review data
remain unchanged:

```powershell
git pull
node scripts/build-reader-gum-contrast-expansion.mjs
node scripts/evaluate-reader-gum-contrast-expansion.mjs --preview
node scripts/evaluate-reader-gum-contrast-expansion.mjs --max-errors 5
```

The build records source document SHA-256 checksums, relation subtypes
(`comparison.contrast`, `comparison.concession`), and selected case hashes;
all generated GUM source text is **gitignored**. The expansion includes
only *extra* human-annotated BUT training cases, avoiding original training
pair duplicates. It never manufactures contrast examples, relaxes annotation
requirements, or infers missing KEEP labels.

The inference script reuses the 402 previously scored synthetic cases and
the original 308 training score caches; it scores **only the new BUT
examples** into isolated, resumable local files:

- `evaluation/reader-gum-contrast-expansion-v1.json` (source cases)
- `evaluation/reader-gum-contrast-expansion-lm-v1.json`
- `evaluation/reader-gum-contrast-expansion-sem-v1.json`
- `evaluation/reader-gum-contrast-expansion-cv-v1.json` (comparison report)

Comparison uses the **identical original five training-document folds**
as the previous BUT-weight run. All rows from a held-out training document,
including its new supplements, are excluded from fitting in that fold.
Both the original and expanded models are evaluated on the same **original
308 validation examples**, not on newly added examples. Previously reported
full-fusion and no-period/hyphen baselines for BUT loss weights 1.0, 1.4,
and 2.0 must be exactly reproduced or the script fails.

Report both AND and BUT recall, balanced recall, paired corrected/regressed
examples, and the performance breakdown on human-annotated contrast vs
concession. The previously inspected 217-case test is never scored in this
run and the 39 reserved future documents remain untouched.

**Interpretation:** this is a training-only diagnostic, not a fresh external
validation. A rise in recall should still be tested later on the untouched
reserved documents with independently fixed selection and adequate KEEP gold.
The implicit-conclusion module is independent and unchanged.

## Genuine KEEP: blinded two-reviewer procedure

No sentence is automatically labelled KEEP. A pair lacking a GDTB annotation,
or a sentence that seems unrelated, is **not a verified negative**.

The review queue is from **review-only documents**, with original GDTB labels
deliberately hidden. To prepare separate forms for independent reviewers:

```powershell
node scripts/finalize-reader-keep-reviews.mjs --prepare
```

This creates two local JSON files, one for each reviewer. Each reviewer
supplies a distinct `reviewerId` and selects exactly one of
`keep`, `and`, `but`, or `abstain` for each item; they do
not inspect model outputs or each other's labels.

The agreed manual labels can then be extracted with:

```powershell
node scripts/finalize-reader-keep-reviews.mjs --a evaluation/reader-gum-review-sheet-a-v1.json --b evaluation/reader-gum-review-sheet-b-v1.json
```

This emits `evaluation/reader-gum-review-finalized-v1.json`. It requires
distinct reviewer IDs and exact source fingerprints, and excludes disputed or
abstained examples. These labels **are not automatically fed into the model**.
A later experiment must independently decide where to use them, preserving
document-level isolation. Reviewers should understand that sentence continuity
on the same topic can warrant AND even without entailment or causation.

## Data rights and interpretation

GUM may contain source-specific copyright and non-commercial licence
restrictions; verify rights before republication. All generated source text,
review sheets, model scores and results are excluded from Git by default.
Only manifest metadata, scripts and documentation are committed.

The human GDTB mapping is provisional relative to this project's desired
reading of KEEP, AND and BUT. Authentic examples may still require
independent task-specific adjudication. Model improvements on this
previously defined split support further testing, not a general real-world
accuracy claim.
