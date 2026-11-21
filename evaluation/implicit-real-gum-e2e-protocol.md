# Genuine-paragraph implied argument end-to-end study — 21 November 2026

## Status

Development run completed in GitHub Actions, with actual on-device model code:
- [Reproducible workflow](../.github/workflows/implicit-gum-e2e.yml)
- [Corpus and model harness](../scripts/evaluate-implicit-real-gum.mjs)
- [Declarative implicit argument assessment](../scripts/implicit-gum-argument-links.mjs)
- [Model-assisted candidate discovery and assessment](../scripts/implicit-gum-model-discovery.mjs)
- [Successful final full-model run](https://github.com/mikemayne/defeating-manipulation/actions/runs/44926709578)

All original source excerpts are fetched at run time, never committed, printed,
uploaded as an artifact or stored in any published result. Invented test
sentences are the only reproduced example text.

## Sampling and scope

- Pinned Georgetown GUM corpus revision `1d999e5a0327ecb83015007774f6a9be23ecbc41`.
- Uses only the previously assigned GUM training documents, excluding
  separate test/review documents, all 39 future-reserved documents and Reddit.
- 33 source documents downloaded from upstream CoNLL-U format, which preserves
  normal spacing and paragraph boundaries (rather than tokenized GDTB units).
- 316 readable paragraphs met source-only filters; 180 selected from
  32 source documents and 11 genres, with a fixed deterministic sample seed.
- No human reference annotations for rhetorical implied conclusions or
  the project's intended meaning of unstated logical steps exist in this
  specific selection. Accordingly **no precision, recall, true-positive
  or false-positive accuracy can be claimed from these real paragraphs**.

## Observations, not accuracy estimates

| Stage | Observed |
| --- | ---: |
| Genuine paragraphs evaluated | 180 |
| Eligible rhetorical questions | **0** |
| Actual FLAN-T5 inference on real paragraphs | **0 calls** (no eligible input) |
| Explicit argument candidates from existing parser | 37 |
| Deterministically inferred declarative argument links | 2 |
| Deterministically inferred links assessed by actual MNLI | 2 |
| Deterministically inferred links receiving a support verdict | 0 |
| Candidate-free paragraphs given model-assisted discovery | 120 |
| MNLI scoring calls for discovery plus checker | 361 |
| Model-assisted implicit relation candidates | 12, in 10 paragraphs |
| Those candidates independently verified by people | 0 |
| Candidates receiving model 'supported' verdict | 12/12 |
| Model runtime errors during the final study | 0 |

The last result is **not independent corroboration**. Directional NLI
entailment is part of the candidate-selection criterion, and the same NLI
model assesses the selected candidates. An entirely supported set of
hypotheses is therefore unsurprising and **does not demonstrate detection
of unsupported inference**.

The 16 *invented*, manually designated controls use the genuine
`Xenova/flan-t5-small` Q8 model:

| Control outcome | Count |
| --- | ---: |
| Positive rhetorical-question controls | 8 |
| Positive controls accepted by output validator | 4 |
| Positive controls rejected by output validator | 4 |
| Neutral controls properly skipped before generation | 8 |
| Genuine human check of generated conclusion meaning | Not performed |

**Crucially, an accepted conclusion is not necessarily a sound
reconstruction.** Several accepted outputs merely restated evidence or
introduced information not established by the question. The 4/8 acceptance
figure measures the current gate plus output validator only, not semantic
accuracy. It cannot be reported as 50% correctly interpreted.

## What the study establishes

The real model weights load and run; the package, paragraph extraction,
source offsets, rhetorical gate, source-only inference and MNLI argument
checker execute without runtime failures. The testing harness correctly
separates third-party source text, code-generated safe controls, model
candidates and numeric aggregate statistics.

## What it does not establish

1. The current rhetorical-question detector is **far too narrow for
   general implied argument analysis**: none of the genuine test paragraphs
   triggered the generator.
2. The heuristic declarative extractor has **very low coverage** on
   diverse prose and the two candidates both produced abstentions.
3. Model-assisted discovery finds strong entailments but has **not shown
   the ability to recover missing premises, unsupported steps or the
   likely implication an average reader would infer**.
4. The small generator's accepted text can be semantically poor.
5. There are no independently human-labelled positive and negative
   implied-conclusion gold examples in this real corpus.

## Next milestone (separate, prospective evaluation)

Do not keep adding regex rules merely to increase the pass rate of this
already-inspected sample. Build a **genuine, human-labelled argumentative
corpus** (100–200 paragraphs, source-document-separated and licensed for
local evaluation) deliberately including both implied assertions and
explicitly stated arguments. Each case should have:

- whether it contains an implied conclusion, including non-question prose;
- one or more short, independently reviewed *plausible reader takeaways*;
- the cited premise spans, if any;
- whether the premise supports the reconstructed takeaway, with an
  *uncertain/context missing* choice; and
- explicit *neutral / descriptive / quoted / unrelated* controls.

Assess candidate recall, semantic reconstruction quality, abstention,
and checker validity separately. Compare the current small model with a
more capable locally runnable model on the **same frozen cases**. Only
after that should a new prospective document-level test estimate
generalization.

## Reproduction

From the repository root, with Node 22 and `extension` dependencies
installed:

```powershell
node scripts/evaluate-implicit-real-gum.mjs --sample-only
node scripts/evaluate-implicit-real-gum.mjs --run
```

Upstream network access to the pinned GUM revision and Hugging Face models
is required. The GitHub Actions workflow already handles installation.
Only aggregate numbers and the invented control outputs appear in logs.

**No third-party article, post or paragraph content is committed.**
