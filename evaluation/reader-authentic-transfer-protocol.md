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

## Balanced authentic AND/BUT training-mixture experiment

The previous training-only CV demonstrated that adding 110 authentic BUT
examples alone increased BUT recall, but shifted many genuine AND examples
toward BUT. We now hold the added 110 BUT examples FIXED and add genuinely
annotated AND examples in **nested 0/110/220/440-sized batches**, with
the model's original loss weight **BUT x1**. This isolates the effect of
training class composition rather than conflating it with extra class weight.

All AND examples come from the already-pinned 118 expansion TRAINING
documents, not from the previously inspected 217-case holdout, the 250-case
pilot, the 12 review documents or the 39 untouched future documents.
The program checks every source against its previously pinned SHA-256 hash
and rejects conflicting labels, repeated sentence pairs and changed
case fingerprints. It samples a fixed seed ordering across documents,
rotating between them rather than taking all cases from the first few
documents. Human GDTB AND relation families are retained (expansion,
causal/contingency and temporal). There are no fabricated AND/KEEP labels.

Live source verification has found 440 new AND examples across 110 contributing
training documents: 295 expansion, 93 contingency and 52 temporal.
The original 308 authentic examples and 110 added BUT examples are
unchanged. The identical original five document-heldout CV folds and
their gold labels are retained for **every** mixture. No new AND examples
are added to the evaluation side, and examples from a heldout source
document are excluded from training for that fold.

```powershell
git pull
node scripts/build-reader-gum-and-mixtures.mjs --offline
node scripts/evaluate-reader-gum-and-mixtures.mjs --preview
node scripts/evaluate-reader-gum-and-mixtures.mjs --max-errors 5
```

The full evaluation reuses the original 402 synthetic score caches, 308
original authentic training caches and 110 added BUT caches. Only the 440
new AND pairs require neural inference. All new GUM source and model-score
files stay local and gitignored:

- `evaluation/reader-gum-and-mixtures-v1.json` (new AND source pool)
- `evaluation/reader-gum-and-mixtures-lm-v1.json` (resumable local LM)
- `evaluation/reader-gum-and-mixtures-sem-v1.json` (resumable embedding/NLI)
- `evaluation/reader-gum-and-mixtures-cv-v1.json` (results)

Both previously used feature configurations (full fusion and minus period/
hyphen) run at the original BUT weight 1.0. Mixture AND=0 MUST reproduce
the previously inspected 110-BUT-only CV results of **187/308** and
**175/308**, respectively, or the evaluation fails. Results report
balanced AND/BUT recall, class recall, individual AND relation families,
BUT contrast/concession, matched corrected and regressed predictions,
and unchanged fold membership.

This is still training-only, post-hoc diagnostic work. Because the authentic
folds do not have KEEP gold labels, KEEP recall remains unknown. Do not
select a production model or claim real-world accuracy from this comparison.
Freeze a choice before testing on the untouched 39-document reserve.

## Conservative BUT decisions: only choose contrast on strong evidence

A new, **experimental-only** decision layer treats AND as the default for
*meaningfully connected* sentence pairs. In ordinary English, “and” can
connect an event to a surprising continuation; “but” adds a more specific
claim that the second statement **contrasts with an expectation**.

The new gate therefore:

- Preserves `KEEP` when the existing three-class model ranks it highest
  (no clear connection). Authentic GUM validation contains no gold KEEP
  examples, so this branch remains unverified on real writing.
- Returns `BUT` only if the original model ranks BUT above both other
  classes, the **BUT softmax score** exceeds a threshold, and the score
  exceeds the runner-up class by a minimum margin.
- Otherwise returns `AND`. If the model initially favoured BUT but
  did not clear the gate, sets an optional
  `deserves_scrutiny` **advisory**, not a manipulation accusation or
  a new gold class. This advisory is **NOT enabled in the extension**.

The logits produced by the previously fitted linear-fusion classifier are
exposed as normalized softmax values through a new, backwards-compatible
`classifier.probabilities(row)` read-only method. The original classifier
still returns the **identical argmax label** and its production behaviour is
unchanged. Softmax values are **not calibrated probabilities of being right**;
thresholds are experimental score cutoffs.

The candidate decision gates were fixed in advance:
`argmax`, `low` (0.40 score / 0.05 margin),
`moderate` (0.50 / 0.10),
`cautious` (0.60 / 0.15),
`strict` (0.70 / 0.20) and
`very-strict` (0.80 / 0.25).

Run against the existing local neural-score caches (no new inference):

```powershell
git pull
node scripts/evaluate-reader-conservative-but.mjs --preview
node scripts/evaluate-reader-conservative-but.mjs --offline
```

The experiment fits the same original 402 synthetic plus authentic GUM
training mixtures (0, 110, 220, 440 added AND with 110 added BUT), two
feature sets and five original **document-grouped** validation folds. It
evaluates every candidate gate on the **same out-of-fold class scores**
without refitting on those validation labels.

Reported metrics include **BUT precision** (of predicted BUT statements,
how many were annotated BUT), BUT/AND recall, false BUT positives,
balanced recall, number of scrutiny advisories, KEEP predictions, ranked
AUROC, average precision (PR), and examples changed by the gate.
The runner checks that all previously observed argmax CV results are
exactly reproduced. Report is stored locally in
`evaluation/reader-conservative-but-cv-v1.json`.

**Scope:** all 308 GUM cases in these folds have already been explored
in several previous experiments, so this is a **post-hoc diagnostic** and
NOT an independent confirmation of a high-precision rule. The 217-case
previous test and 39 untouched reserved documents are not used here.
The genuine KEEP class remains unmeasured; there is no production
threshold selection until independent validation. The separate
implicit-conclusion system is unaffected.

## High-confidence AND/BUT error audit

The first high-confidence BUT gate produced fewer false BUT classifications,
but AUROC stayed around 0.63–0.66. Before changing features, inspect where
the score model confidently disagrees with human GDTB relationship labels.

```powershell
git pull
node scripts/audit-reader-contrast-errors.mjs --preview
node scripts/audit-reader-contrast-errors.mjs --offline --top 12
```

No new neural inference: this reuses the 402 synthetic, 308 original
authentic, 110 extra BUT and 440 extra AND local score caches. The original
five document-disjoint validation folds and earlier calibrated-classifier
settings remain unchanged. The prior 217-case test and 39 untouched reserved
documents are not read. All three scenarios replay *previously observed*
argmax accuracy totals (187, 237 and 221 of 308), and abort if these differ.

The audit compares the previous reader's argmax to a conservative BUT gate
for three **fixed** configurations:

- `full-fusion__AND+0__strict`: 110 extra BUT, no extra AND
- `full-fusion__AND+440__strict`: 110 extra BUT, 440 extra AND
- `no-period-hyphen__AND+220__moderate`: 110 extra BUT, 220 extra AND

Per scenario it ranks **confident false BUT** predictions, **missed BUT**
examples (including confidently scored AND), **correct BUT** predictions,
**rescued false BUT** (demoted to AND by the gate), and **lost true BUT**
(demoted genuine contrasts). It prints the highest-priority sentence pairs,
and emits:

- `evaluation/reader-contrast-error-audit-v1.md` — locally readable
  excerpts, GDTB relation subtypes, models' class scores, signed connective
  scores, NLI estimates, similarity, lexical overlap and elementary surface
  cues
- `evaluation/reader-contrast-error-audit-v1.json` — structured local
  audit plus cue incidence counts by category
- `evaluation/reader-contrast-error-review-v1.tsv` — manual annotation
  sheet with unfilled *AND plausible?*, *BUT plausible?*, *expectation
  violation?*, *explicit contradiction?*, *interpretation* and *notes*
  fields (spreadsheet formula prefixes escaped)

Surface cues (negation, negative/positive vocabulary, surprise/expectation
terms, temporal/causal connectives) are **hypotheses only**, not ground
truth and not replacement labels. An author or human reader may plausibly
read the same pair as both AND and BUT. A single GDTB discourse label
does not show that the other reading is impossible.

This audit is for inspecting high-confidence mistakes, not for training a
new classifier or changing decision thresholds. All source excerpts and
review answers stay **local and gitignored**; check GUM licence before any
public sharing. The extension's existing reader and implicit-conclusion
components remain unchanged.

## Synthetic-to-authentic contrast-score mismatch

The local training cache can be inspected with:

```powershell
node scripts/audit-reader-signal-shift.mjs --offline
```

This prints **only counts**, grouped by original label and data partition.
It never prints or commits source posts, case IDs, titles, or sentence pairs.
Nine fixed combinations of masked-BERT `but - and` score
(`>2`, `>3`, `>4`) and shared-word Jaccard overlap
(`<=0`, `<=0.05`, `<=0.10`) are reported together, not optimised
against labels. Its local numeric report is gitignored.

At `bertContrast > 3` and `lexicalJaccard = 0`, the initial
uploaded caches give:

| Cohort | Gold AND | Gold BUT | Matching AND | Matching BUT |
| --- | ---: | ---: | ---: | ---: |
| Original synthetic (402 cases; also 124 KEEP) | 154 | 124 | 0 | 7 |
| Original authentic TRAIN (308) | 266 | 42 | 4 | 0 |
| Extra authentic BUT (110) | 0 | 110 | 0 | 0 |
| Extra authentic AND (440) | 440 | 0 | 1 | 0 |

This is a candidate **dataset shift**: among a small set of
high-contrast, zero-overlap examples, synthetic labels favour BUT whereas
the authentic GDTB labels favour AND. Some examples can support multiple
readings; these figures do **not** establish that the original GDTB
annotations are incorrect, or prove why a prediction was wrong.

A private, post-hoc analysis reproduced all eight original authentic
document-fold baselines exactly from the uploaded caches. Several cheap
extensions (NLI direction agreement, BERT/similarity interactions,
surface negation and discourse cues), as well as dropping some or all
synthetic AND/BUT training cases, failed to provide a convincing,
stable improvement across the existing folds. Removing all synthetic
AND/BUT cases in particular depressed BUT recall. This is a **negative
development result**, not fresh held-out evidence. Keep the entire
feature/threshold search out of claims of independent performance.

Do not hard-code an AND rule for this extreme-score signature merely
because it would repair four previously inspected false BUT predictions.
Fresh labels or independently adjudicated AND/BUT ambiguity are needed
before trusting a new decision rule.

## Subject/category polarity and unexplained-findings contrast cues

The reader now includes two **narrow, deterministic** sentence-pair cues,
separate from proof of claim correctness or factual verification:

1. **Different subjects, opposing category membership.** A negated
   membership claim about one referent followed by positive membership
   of a DIFFERENT referent or category can express contrast without
   the statements being logically contradictory. Simply encountering
   a negated word is NOT sufficient.
2. **A finding whose explanation is explicitly uncertain.** A stated
   experimental observation can be qualified by a following statement
   that says its cause or explanation remains unknown, even when the
   finding itself is not denied.

Both rules are applied only when there is no explicit leading discourse
connector. They affect the reader's **proposed AND/BUT relationship**,
not source text or character offsets, and never judge author intention.
The interpretation mode exposes `structuralCue` and
`decisionSource=structural_contrast_cue` rather than presenting a
fictitious neural confidence score. The direct model-only evaluation
still retains its frozen historical results. The cues can miss
paraphrases and can over-predict context-sensitive contrast.

Tests use only invented sentences, including challenging negative
examples (shared category as an adjectival modifier, negation without
topic shift, same-subject contradiction, unrelated uncertainty). No
GUM sentence or public post is committed.

**Post-hoc numeric diagnostic**, with existing caches only:

```powershell
node scripts/evaluate-reader-structural-contrast.mjs --preview
node scripts/evaluate-reader-structural-contrast.mjs --offline
```

This replays five document-disjoint folds of the original 308 authentic
TRAIN cases under the frozen full/no-period fusion variants and four
synthetic AND mixture sizes. It compares each baseline prediction
against a hypothetical structural-cue promotion to BUT, and reports
ONLY counts by category. It does **not** inspect the existing 217-case
test, the KEEP-review queue, or the 39 future-reserved documents.
The private, numeric-only JSON report is gitignored.

The previously inspected data contain very few instances matching
these narrow constructions. Accordingly, any small gain is a
developer diagnostic, NOT independently validated generalisation.
The historical GDTB label for some pairs conflicts with the user's
preferred AND/BUT interpretation; preserve both as separate notions.

## Blind review of the AND/BUT distinction

Preparation and reconciliation live in the repository. This is a
development/measurement step, not a production release. It does not train,
calibrate, or modify the classifier automatically.

After the previous error audit and local cache scoring have completed,
prepare a blinded, independently shuffled 48-pair development sample:

```powershell
node scripts/prepare-reader-contrast-review.mjs --preview
node scripts/prepare-reader-contrast-review.mjs --offline
```

The sampler replays the historical **187/308** grouped-CV argmax baseline
with 402 original synthetic and 110 extra genuine BUT examples. Its
candidate pool contains ONLY the existing 308 original authentic TRAIN
pairs; the 217-case test, the separate KEEP review queue and the 39
future-reserved documents are NOT used. The six prominent examples
already displayed in a previous error audit are excluded.

Forty-eight cases are selected with a deterministic fixed seed: **12
false BUT predictions, 12 missed BUT, 12 correct BUT and 12 correct AND**
under that original model. Selection is deliberately balanced by
outcome, and constrained to at most three samples per source document
and eight per writing genre, across the original source-document folds.
These proportions must NOT be interpreted as natural class frequencies.

Only the private local answer key contains original GUM identifiers,
gold labels, model decisions, genres and selection stratum. The two
reviewer sheets contain **only anonymised case IDs and the pair of
sentences**; each has a different shuffled order. Reviewers must have
no access to gold labels, model scores, the other reviewer's answers
or the private key until both independent reviews are finished.

Available judgements are:

- **and_only**: a continuation/addition, without needed contrast
- **but_only**: a meaningful contrast, concession or violated expectation
- **both**: both connections would be reasonable
- **neither**: neither connection fits the given sentences
- **uncertain**: insufficient context or insufficient reviewer confidence

This judges **interpretive plausibility**, not grammatical connector
insertion alone. Do not force a single label when both are reasonable.
The original GDTB annotation is one interpretation, not proof of
exclusive connector validity.

Two distinct human reviewers complete different local TSV sheets
independently (confidence 1–3 is optional). Run:

```powershell
node scripts/finalize-reader-contrast-review.mjs --reviewer-a ReviewerA --reviewer-b ReviewerB
```

The reconciler verifies unmodified text, identical case sets, distinct
reviewer pseudonyms and valid labels. It computes raw agreement, Cohen's
kappa, consensus including `both`, and whether the original GDTB label
and model predictions are **compatible** with that consensus.
A separate local disagreement queue supports later adjudication.
No disputed or uncertain item is assigned a new gold label. A consensus
showing `both` is compatible with either original label, not evidence
that both mean exactly the same thing.

**All generated human-review outputs and public-source excerpts,
including the private answer key, are gitignored.** Do not upload
these files to a public pull request or commit. Tests use invented
synthetic examples only; they include no public post content.

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
