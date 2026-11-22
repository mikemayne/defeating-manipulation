# Experimental structured language analysis

Enable **Use experimental clause analysis** in the local hybrid lab, run
`node scripts/analyze-hybrid.mjs --structured`, or pass
`{ structured: true }` to `analyzeHybrid(text, options)`. The default is off.
The regular Firefox matcher and its blue, green, turquoise and orange paths
still run independently. Red analysis stays disabled.

## Version 1 schema

`analyzeStructure(source, { offset = 0, spellchecker })` returns a JSON-compatible
object with `version`, `paragraphs`, and preprocessing `flags`. The hybrid
adapter runs this once per bounded paragraph scope and includes it in
`scopes[].structure`. Flag start/end coordinates refer to the source document.
The flags' `analysisStart` and `analysisEnd` remain working-copy coordinates
relative to the extraction input.

| Object | Fields |
| --- | --- |
| Span | `start`, `end`, `text`. Offsets are half-open UTF-16 indices into the original input, including any caller-provided offset. |
| Paragraph | Span, deterministic `id`, `sentences[]`, `edges[]`. |
| Sentence | Span, `id`, `attributedTo` (nullable lexical attribution), `clauses[]`. |
| Clause | Span, `id`, `kinds[]`, `speechActs[]`, `features[]`. Quoted and parenthetical clauses can nest inside a containing clause's span. |
| Label | `type`, `basis` (`explicit` or `inferred`), `evidence[]` of source spans. Negation can include a provisional source `scope`. |
| Edge | Deterministic `id`, `type`, `from` and `to` clause IDs, `basis`, heuristic `confidence`, and `evidence[]`. Confidence is a rule weight rather than a probability. |

Span IDs have the form `kind:start:end` and are stable for the same source and
offset. Label absence means the extractor abstained. Each paragraph owns its
edges. Conditions point to consequences, claims point to their stated reasons,
supplied evidence or qualifications, and an instruction can point to an
explicitly marked consequence. A conclusion introduced by a connective is
linked from the preceding statement. These edges describe the writer's
wording. Assessing whether an argument is valid remains a separate question.

The deterministic path reuses reader preprocessing and offset mapping,
the explicit argument parser and the existing attribution detector.
It recognizes common connective constructions, quote and parenthetical spans,
reported attribution, modal and temporal wording, negation markers, and
surface question and imperative forms. It can propose multiple acts, including
an interrogative request. It records original spelling and preprocessing
flags even when the interpretation copy uses a correction.

For `If you don't cooperate, everyone will find out what you've done.`, the
condition and outcome form an explicit edge. The possible requested behavior,
vague group and unspecified conduct are inferred from spans in the source.
For `You have no idea what's coming.`, the structure records a direct
assertion, wording about the listener's knowledge and an unspecified future
event. The adapter leaves the nature of the outcome unresolved.

The adapter routes existing questions toward condition/consequence and
claim/reason evidence. It can resolve a narrow explicit lack-of-knowledge
question locally. The structure is available as an optional data argument
to the existing `classify(messages, { signal, structure })` callback. Existing
model prompts are unchanged and keep pasted content in the data field.
No new model dependency, network call, or execution of source content is
introduced. Callers can disable feature or relation routing separately with
`structureOptions: { features: false }` or `{ relations: false }`.

### Extraction limits

English finite-clause, imperative and attribution rules have incomplete
coverage. Modal contractions, indirect predictions, coordinated predicates
with omitted subjects, nested quotes and parentheticals, and long-distance
coreference can be missed or mis-scoped. Negation scope is a lexical candidate.
The parser does not reliably recover a question's embedded presupposition,
moral judgement links, unstated conclusions, or hook/explanation/payload
sequences. It can record lexical cues for possible presuppositions,
accusations and loaded wording. Distinguishing quoted use from endorsement,
ordinary policy from coercion, or genuine evidence from a claim framed as
evidence often needs context and can require a local semantic model or human
judgement. A model can also abstain.

## Benchmark

Run these from the repository root with Node.

```sh
node scripts/test-semantic-structure.mjs
node scripts/evaluate-semantic-structure.mjs
node scripts/evaluate-semantic-structure.mjs --replay
node scripts/evaluate-semantic-structure.mjs --replay --complete
```

A is the extension's existing deterministic catalogue matcher with its
positive, concealed and advisory passes. B is the current hybrid question bank
and local rules. C adds the structure and adapter, retaining B's question
bank and budget. Ablations run the extractor but remove feature cues, relation
cues, or both. The benchmark also accepts `--ollama` for B and C if the
repository's configured local endpoint and model are available.

The corpus consists of 20 original synthetic items and 11 previously frozen
hybrid examples. The downstream score covers 16 named or advisory pattern IDs
with 17 positive labels and 16 entirely negative passages. This samples
blue, green, turquoise and orange behavior without exhausting every catalogue
entry. Ten original items have exact gold clause spans, clause-level act and
feature labels, and typed edges. Precision, recall and F1 are micro-averaged.
A false positive is any scored finding on an entirely negative passage.
The benchmark emits individual misses and mismatches. Existing regressions
cover other catalogue entries independently.

### Results on an Intel Core i7-8700, Node 24

Each reported CPU timing uses 775 warm runs per arm. These synthetic figures
characterize the prototype and do not estimate performance on live pages.

| Structural task | Initial P / R / F1 | Revised P / R / F1 |
| --- | --- | --- |
| Exact clause spans | .882 / .938 / .909 | 1.000 / 1.000 / 1.000 |
| Speech acts | .889 / .842 / .865 | 1.000 / .947 / .973 |
| Semantic features | 1.000 / .895 / .944 | 1.000 / .895 / .944 |
| Typed relationships with exact endpoints | .750 / .750 / .750 | 1.000 / 1.000 / 1.000 |

The initial run exposed a qualification boundary error and a
cross-sentence justification label error. Both were corrected after seeing
these cases, so the revised structural figures are a development recheck.
The initial figures are the less optimistic first-pass estimate. Remaining
misses included a modal contraction, its negative outcome, and a hedged
prediction. Four gold relationships are too few to establish reliability.

With rules only, A, B and revised C missed all 17 targets. All three had
0/16 false-positive passages. The initial C recovered one threat case and
also flagged one ordinary administrative policy (1/16 false-positive
passages). That experiment motivated making the sanction a cue for
question routing, removing deterministic threat promotion in revised C.

| Selective labelled replay | TP / FP / FN | Precision / recall / F1 | Calls | Median / p95 CPU |
| --- | --- | --- | --- | --- |
| A, rules only | 0 / 0 / 17 | undefined / .000 / .000 | 0 | 0.090 / 0.165 ms |
| B | 3 / 0 / 14 | 1.000 / .176 / .300 | 93 | 0.477 / 0.884 ms |
| C | 4 / 0 / 13 | 1.000 / .235 / .381 | 93 | 0.514 / 0.905 ms |
| C without features | 4 / 0 / 13 | 1.000 / .235 / .381 | 93 | 0.493 / 0.801 ms |
| C without relations | 3 / 0 / 14 | 1.000 / .176 / .300 | 93 | 0.484 / 0.710 ms |
| C without adapter | 3 / 0 / 14 | 1.000 / .176 / .300 | 93 | 0.487 / 0.834 ms |

Selective C used the same calls as B and resolved 10 semantic questions
versus 7. The relationship cue put a relevant threat question inside the
three-call budget. The ablations attribute the visible downstream gain to
relation routing. With complete replay, both scored 16/17 positive labels
and zero false positives. C skipped one model call (1,270 vs 1,271) by
answering a narrow question locally. Replay uses provided gold responses
for annotated questions and returns unknown for others. Its timings
measure JavaScript overhead only and the scores demonstrate routing
potential. This run did not measure real-model accuracy or latency.

Across rules-only samples, the standalone layer took about **0.06 ms
median and 0.13 ms p95**. Its largest serialized result on the short
passages was 1,822 bytes. Serialized output is a storage proxy. Peak heap,
browser startup and live page latency were not measured.

Keep the layer opt-in for its evidence trace and tentative routing gain.
Before considering a default, evaluate a frozen real-text set with
independently annotated clauses and relationships, especially ordinary
policies, attribution chains and implicit threats. Run the same examples
through a live local model under multiple budgets and measure whether
routing actually reduces questions at a fixed recall and false-positive
rate.

The strict existing rules benchmark passed all 290 expanded cases. Two
existing tests failed on both the starting commit and this branch
(`test-build.mjs` on the frozen corpus hash and
`test-implicit-discourse-passes.mjs` on its bridge example).

## Experimental binary pressure tree

Run `node scripts/analyze-hybrid.mjs --pressure-tree` with a passage on stdin to inspect each paragraph's yes/no path, leaf score and experimental flag. The score is the fraction of positive training passages in the reached leaf. This research output is separate from ranked catalogue findings.

Run `node scripts/evaluate-sir-pressure.mjs` with the local targeted pressure corpus from `classifier/pressure_target_collect.py` to reproduce fitting and verify the shipped model. The evaluator checks thread separation and removes repeated normalized passages. It uses depth four, at least ten training passages per leaf and binary Gini splits over SIR categories. The threshold maximizes calibration F1, with ties favoring the higher threshold. The root asks whether a clause has a condition feature.

On the local snapshot (SHA-256 `b7d85caf36f736e39dcb7f8c4979ec8afc5940208f13d229871ad22031987d6d`), 597 real passages trained the tree, 178 calibrated it and 298 tested it. A positive means the existing Qwen annotation includes fear of consequences or pressure to doubt one's judgement. The targeted sampling and machine labels limit generalization. The model stores feature names and aggregate counts.

At the selected threshold of 0.1707, held-out TP/FP/TN/FN were 27/76/173/22. Precision was 26.2%, recall 55.1%, F1 0.355 and false-positive rate 30.5%. Always predicting positive scored F1 0.282. The error rate supports retaining this as an opt-in research output. Evaluation used whole corpus passages. CLI output is per paragraph.

### Separate consequence and judgement trees

Run the CLI with `--pressure-roles` for both decision paths. Reproduce the comparison with `node scripts/evaluate-sir-pressure-roles.mjs`. Both trees use the 597 original training passages and the original depth and minimum leaf size. The larger of their two leaf scores determines the alert. Calibration chooses the highest available threshold meeting the original calibration recall. Discrete leaf scores jump past that target.

An independent transfer evaluation used 2,399 passages from the earlier six-label Qwen corpus, removing overlapping threads, normalized text duplicates and insufficient-context labels. Only fear of consequences and judgement doubt counted as positive. The sampling and annotation prompt differ between corpora. Both use machine annotations.

| Transfer result | Original | Separate trees |
| --- | ---: | ---: |
| True positives out of 170 | 95 | 121 |
| False positives out of 2,229 | 644 | 899 |
| Precision | 12.9% | 11.9% |
| Recall | 55.9% | 71.2% |
| F1 | .209 | .203 |

Interpolating within tied leaf scores to compare at 95 true positives gives about 692 expected false positives for the new trees. This diagnostic is distinct from the actual threshold result. The previous diagnostic set suggested an improvement at matched recall (67 versus 76 false positives) that did not transfer. In training, 132 passages triggered the linked listener condition, but zero triggered the specific speaker penalty, listener loss or offered help cues. Direct judgement dismissal matched 33. Check manually annotated clause boundaries and outcome roles before fitting more splits.

Use `--review` on the evaluator to generate two private blind review queues of the same 60 passages. Each reviewer can independently mark fear and judgement true or false and use context to record ordinary advice, warnings, quoted threats, direct challenges or insufficient context. Existing review files are preserved. No human labels were available for these results.
