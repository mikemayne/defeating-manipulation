# Rhetorical signals: isolated first-stage prototype

The module is independent of the existing sentence matcher, paragraph reasoning, paraphraser, worker, and UI. It is not called by those passes yet. No model is bundled or invoked; its output can be supplied by a future local LLM adapter.

## Core principle

**Rudeness is not manipulation; politeness is not evidence of good faith.** Neither an ordinary insult nor emotive wording automatically makes a sound argument manipulative.

Three routing classes:

- **Scrutiny**: emotion, certainty, causal wording, motive attribution, presuppositions, vague sources, loaded questions, numbers and binary framing. Dispatch to an appropriate specialist check, but do not underline.
- **Context**: scope shifts, definition shifts, repetition, emotional escalation and unusual spelling. Compare wider context before any finding.
- **Direct candidates**: dehumanisation and discrediting reasoning through an insult. These may become underlines only after independently verified evidence of the pattern.

The built-in, deliberately narrow direct rule recognises explicit human-group descriptions as 'vermin', 'parasites', 'cockroaches' or 'subhuman'. It underlines the dehumanising term. A quoted phrase may still contain dehumanising wording, without proving that the author endorses it. Do not generalise from this small rule to high recall.

## API

The file `extension/src/rhetorical-signals.mjs` exports:

- `RHETORICAL_SIGNAL_REGISTRY` for allowlisted signal definitions and suggested follow-on checks;
- `routeModelRhetoricalSignals(text, rawModelOutput, {confirmDirect})` to verify exact spans and route suggested signals;
- `findExplicitDehumanization(text)` for the narrow explicit rule;
- `inspectRhetoricalSignals(text, rawModelOutput, options)` to merge and return `{findings, scrutinyChecks}`.

Model response example (plain JSON data, not executable instructions):

    {"findings":[{"signal_id":"emotive_language","start":6,"end":15,"quote":"heartless"}]}

Offsets are JavaScript UTF-16 indices. The router discards unknown IDs, fabricated text spans, excess candidates, HTML, arbitrary keys, model scores, actions and explanations. It does not evaluate code, create model-derived regular expressions, mutate the DOM, or make network calls. Render source quotations with safe text nodes rather than `innerHTML`.

`confirmDirect` must be trusted **application code**, never an LLM-generated script or expression. An LLM-proposed direct signal defaults to scrutiny unless that callback returns `true`. A thrown error also abstains. The built-in explicit rule is a separate deterministic direct detector.

Suggested `scrutinyChecks` are routing hints only; they do not mean those checks have run. The existing UI and highlighting remain unchanged.

## Evaluation and integration

Run `node scripts/test-rhetorical-signals.mjs` from the repository root.

Before integration, expand the independent dataset with quotations, satire, opposition to dehumanisation, ordinary swearing, literal animal language, highly emotional sound reasoning and subtle false dilemmas. Score **direct-underline precision separately from scrutiny-trigger recall**. Measure latency using the actual local browser model. This PR does not alter any existing benchmark or scoring pipeline.

Do not auto-merge while paragraph reasoning and paraphraser branches are open. Review and rebase integration changes once those features settle.
