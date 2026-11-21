# Reader relation evaluation: synthetic holdout and real-world check

## First authentic-text pilot: 250 GUM relations

Implementation is in `scripts/build-reader-gum-pilot.mjs` and
`scripts/evaluate-reader-gum-pilot.mjs`.

```powershell
git pull
node scripts/build-reader-gum-pilot.mjs
node scripts/evaluate-reader-gum-pilot.mjs --preview
node scripts/evaluate-reader-gum-pilot.mjs --max-errors 5
```

The importer fetches and caches original `.rels` files from the pinned GUM
source revision `1d999e5a0327ecb83015007774f6a9be23ecbc41`. It samples
25 examples in each of ten genres (news, essay, academic, interview, fiction,
speech, biography, textbook, voyage and podcast), max 14 per source document.
It intentionally favours the rare contrast category, so class proportions
are **not representative** of naturally occurring writing.

The data is authentic and the original GDTB discourse annotations were made
by corpus annotators. The conversion into the project's AND/BUT categories
is **our operational mapping** and has not yet been separately adjudicated.
Allowed source types are implicit, immediately adjacent, forward-ordered
full-sentence discourse relations, with a visible sentence boundary.

Mapping:
- `comparison.contrast`, `comparison.concession` -> BUT
- `expansion.conjunction`, `expansion.level-of-detail`,
  `expansion.instantiation`, `expansion.equivalence`,
  `contingency.cause`, `temporal.asynchronous/synchronous` -> AND
- Everything else -> ABSTAIN and excluded from scored sample
- KEEP is **not inferred** from absent annotations, entity relations,
  isolated paragraphs or topic shifts. This pilot **does not test KEEP recall**.

The frozen linear+lexical classifier is fitted on the prior 402 synthetic
development examples only. It is then scored against 250 authentic pairs
without fitting on any GUM labels. Reports include per-class precision,
recall, two-class macro-F1, mapped accuracy and rates of KEEP predictions.
Mapped accuracy is NOT overall three-class accuracy. Run the command once
and retain the first result as a baseline.

All downloaded source texts, assembled excerpts and inference scores are
gitignored and should remain local. GUM is built from texts with varying
source-specific licences, including non-commercial restrictions; review
`https://github.com/amir-zeldes/gum/blob/master/LICENSE.md` and original
document terms before any public redistribution or commercial use.

The natural next step after this pilot is independent human review of the
AND/BUT mappings, plus a separately annotated genuine KEEP dataset.
DiscoGeM remains a complementary research track for multiple-annotator
distributions; it has not yet been integrated into this pilot.

## First-GUM-pilot audit (original model unchanged)

The initial 250-case, ten-genre pilot scored **30/250 (12.0%)** on
the provisional mapped labels. Class-level observations from that first
unmodified run:

- GDTB mapped AND: 221; classifier recalled AND for 17 (7.7%).
- GDTB mapped BUT: 29; classifier recalled BUT for 13 (44.8%).
- Classifier predicted KEEP for 131/250 (52.4%), but **GUM contains no
  KEEP ground truth**, so KEEP recall is not measurable.
- This is a meaningful test-domain failure on these mapped relations, but
  is not an overall estimate of three-class performance.

The source-only verification against GUM revision
`1d999e5a0327ecb83015007774f6a9be23ecbc41` found **250/250
original annotated argument spans cover the entire adjacent sentences**.
The hypothesised narrower-span mismatch did **not** explain the low score.

Original GUM `expansion.conjunction` is treated as AND even if consecutive
sentences make separate observations about one match or topic. An AND
relation does not require explicit causal linkage. Reclassifying the soccer
example as KEEP would invalidate the intended broad reading.

The no-inference audit compares the 250 original labels with predictions,
original relation senses and source genre; reports model feature shifts from
the previous 402 synthetic examples; and checks every source-row checksum,
token span and prediction/score identifier. It never modifies the corpus,
the model, the labels, or the original 12% headline.

```powershell
git pull
node scripts/audit-reader-gum-pilot.mjs --source-only
node scripts/audit-reader-gum-pilot.mjs --top 15
```

The second command uses existing local model caches; no downloads or
inference. It writes `evaluation/reader-gum-pilot-audit.json` (gitignored,
because source excerpts can carry third-party text). These are diagnostics,
not a tuned benchmark. Do not change the label mapping to maximise a score.

## Offline diagnostic: feature ablations (existing caches only)

The current GUM pilot's first, unmodified score was **30/250 = 12.0%**
on provisional mapped AND/BUT labels. The separate 1000-example synthetic
holdout scored **743/1000 = 74.3%**. These are not comparable three-class
real-world accuracy measurements: the GUM sample has **no KEEP gold**.

After observing the large shift in the masked-BERT period feature, evaluate
fixed alternative feature sets **without running any additional model**:

```powershell
git pull
node scripts/evaluate-reader-gum-ablations.mjs
```

The script refits the same balanced linear fusion on the previous 402
synthetic examples, separately reporting GUM AND/BUT mapped-label recall,
predicted KEEP counts, synthetic-v2 recall in all three classes, and
family-grouped development cross-validation. It verifies the **original
30/250 and 743/1000 baselines** before comparing variants. Output remains
local at `evaluation/reader-gum-feature-ablations.json`.

Variants remove `bertPeriod`, both `bertPeriod` and `bertHyphen`, all
masked-BERT punctuation features, or the NLI scores; other variants retain
only GPT2 + semantic similarity + lexical features, or semantic + lexical
features. These are **post-hoc diagnostics** of an inspected sample, NOT a
new independently valid accuracy estimate. Do not select a production
configuration solely from their observed GUM improvement.

The browser's new `text-preprocessing.mjs` stage operates on a cleaned
working copy and emits weak spelling/punctuation signals while preserving
source offsets. **It does not modify the existing GUM model-score caches**.
A future normalised-text comparison needs its own separately versioned
source and score caches; substituting new text into old cached scores is not
a valid experiment.

## Current benchmark

The v2 corpus (reader-holdout-v2.json, generated from reader-holdout-v2-seeds.tsv) is **1,000 synthetic, developer-labelled** sentence-boundary examples from **100 scenario families** in 10 domains. The classes are nearly balanced: KEEP 333, AND 334, BUT 333. Ten cases share a scenario family, so these are **not 1,000 independent observations**.

The corpus includes deliberately unrelated cross-domain juxtapositions. These stress-test false joins but do **not** represent the frequency of unrelated adjacent sentences in naturally occurring prose. Preserve family groupings if v2 later becomes training data.

First evaluation: fit the already selected balanced linear+lexical classifier on the previous 102+300 examples; score v2 once without using v2 labels for parameter choices. Record the first score before inspecting errors. Once mistakes inform development, v2 is no longer a truly unseen test.

## Real-world validation is needed now

**DiscoGeM 1.0/2.0** — human-annotated implicit discourse relations:
https://github.com/merelscholman/DiscoGeM

- DiscoGeM 1.0 includes 6,505 implicit English relations from parliamentary speech, literature and encyclopedic writing. Each was annotated by ten crowd workers who inserted possible connectives.
- Preserve original train/dev/test or document/source splits. Never randomly split repeated passages.
- Map confidently contrastive/concessive relations to BUT, additive/causal/sequential relations to AND only according to published definitions and an explicit mapping table.
- **Do not invent KEEP labels** from an implicit-relations corpus: ambiguous/unmapped relations should be marked ABSTAIN rather than forced into our categories.
- Keep annotator disagreements and distributions; report coverage as well as class performance.
- Review original source and data redistribution terms before reproducing excerpts publicly.

**Georgetown University Multilayer Corpus (GUM / GDTB)**:
https://gucorpling.org/gum/
https://github.com/amir-zeldes/gum

- Genre-diverse naturally occurring text, including PDTB-style discourse relation annotations.
- Distinguish implicit relations, entity relations, and genuine NoRel; these are not interchangeable with our project's KEEP concept.
- Preserve source document identifiers and text genres; split by document/publication rather than adjacent sentence pairs.
- Have human reviewers adjudicate borderline mappings to KEEP, AND, BUT or ABSTAIN.

The LDC-licensed Penn Discourse Treebank 3.0 is another standard resource but should not be redistributed without appropriate access:
https://catalog.ldc.upenn.edu/LDC2019T05

## Proposed first real-world pilot

1. Select a genre-balanced set of naturally occurring examples with human annotation and source/document IDs.
2. Create an explicit mapping to KEEP/AND/BUT plus ABSTAIN. Do not equate a possible connective with a uniquely true logical relationship.
3. Run the frozen reader classifier without fitting anything to these examples.
4. Report class confusion, macro-F1, balanced accuracy, abstention/coverage, source genres, and disputed labels for adjudication.
5. Expand to a separate document-held-out real-world test after the label mapping is reviewed.

Report synthetic and authentic-text results separately. Neither is a direct assessment of factual truth or manipulation; these evaluations measure only local discourse-relationship classification.
