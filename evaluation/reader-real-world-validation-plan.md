# Reader relation evaluation: synthetic holdout and real-world check

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
