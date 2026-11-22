# Real-text presupposition audit

The first real-text check found that the browser grammar prototype is too narrow for general article analysis. It found two of 16 passages labelled as carrying an assumption of prior activity. Both activity highlights were partial. This tests the presupposition carried by the wording, without assigning intent or verifying the source claim.

## Samples and labels

- Take 28 unfiltered passages and 28 passages with a form of “stop” from the existing pressure and targeted-pressure caches. Deduplicate text and limit to one excerpt per thread across these two groups. The combined cache contains 3,473 distinct passages. Sampling uses seed 31209.
- Add 20 paragraph excerpts from the cached ConcluGen argument corpus with a lexical stop-plus-ing construction. Use seed 29412, one excerpt per document and reject passages contained in or containing earlier sampled text.
- After the initial audit exposes few direct past-tense positives, add a separate probe of 16 excerpts containing “stopped” followed by an ing word. Use seed 83917 and exclude earlier source IDs and overlapping passages. This last sample is intentionally enriched for a particular construction.

The existing pressure labels did not determine gold labels. I annotated each sample before collecting its detector predictions. The three labels were definite prior activity, definite negative, and unclear. Examples with a clearly assumed activity could be positive even inside more complex syntax. Cases where a hypothetical, quotation, or missing context made the assumption unclear were marked unknown. This is a single-reviewer audit. Counts should not be extrapolated to articles in general, and the second probe answers a retrospective diagnostic question.

## Results

| Sample | Cases | Gold yes / no / unknown | Grammar positives found | Firefox regex positives found | Lexical candidates labelled yes / no / unknown |
| --- | ---: | --- | ---: | ---: | --- |
| Unfiltered pressure excerpts | 28 | 0 / 28 / 0 | 0 | 0 | 0 / 0 / 0 |
| Stop-enriched pressure excerpts | 28 | 2 / 22 / 4 | 0 | 0 | 2 / 2 / 4 |
| Activity-enriched ConcluGen excerpts | 20 | 7 / 1 / 12 | 1 | 0 | 7 / 1 / 12 |
| Past-activity probe | 16 | 7 / 0 / 9 | 1 | 0 | 7 / 0 / 9 |
| Total | 92 | 16 / 51 / 25 | 2 | 0 | 16 / 3 / 25 |

The grammar and Firefox rules flagged none of the definite negatives or unknowns. The Firefox result is specific to the targeted prior-activity examples. Its existing presupposition regex also covers different constructions. The lexical expression is a good candidate selector, but it was also the sampling filter for two groups and cannot be evaluated as a broadly useful classifier with this sample.

Inspection showed that the tagger recognised “stop” as a verb in the 16 positives. The main failure was recognising it inside a clause instead of expecting a simple sentence prefix. Additional failures involved gerunds tagged as nouns or adjectives. Both partial highlights dropped a prepositional phrase belonging to the activity. That points to clause boundaries and phrase attachment as the next experiments, with a fresh set of examples reserved for testing.

The CPU was sufficient for both matchers. The grammar rule and its training scope were held fixed for the audit.

## Re-run

With the extension dependencies installed, use:

~~~sh
node scripts/audit-real-presupposition.mjs classifier/artifacts/presupposition-audit-sample.json classifier/artifacts/presupposition-audit-labels.json
node scripts/audit-real-presupposition.mjs classifier/artifacts/presupposition-past-probe-sample.json classifier/artifacts/presupposition-past-probe-labels.json
~~~

The script checks the labelled sample fingerprint and returns only aggregate metrics and local case IDs. The samples, annotation spans and raw predictions are kept in the ignored local artifact directory.
