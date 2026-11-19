# Defeating Manipulation

A free, open-source project for recognising persuasive and manipulative techniques in online written media.

The project is designed to help readers examine *how* a piece of writing works: its framing, language, structure, emotional cues, omissions, sourcing and presentation of evidence. It should make analysis more transparent, not tell readers what to think.

**Core principle:** identify observable features in the text, explain the recognised technique they may illustrate, quote the relevant passage, and distinguish evidence from interpretation.

## Project goals

- Build an openly documented catalogue of recognised rhetorical, persuasive and manipulative techniques.
- Explain each technique in clear, accessible language, with examples and references.
- Provide a browser-based reader and analysis interface.
- Develop an optional browser extension that can analyse selected page text.
- Run analysis locally in the browser or on the reader's device using a small language model where practical.
- Keep submitted text private by default: no automatic upload, tracking or remote analysis.
- Make the project easy to fork, adapt, inspect and improve.

## What the analysis should and should not claim

The tool analyses **text**, not the private intentions or character of its author.

It may report that a passage *uses language consistent with* a recognised technique. It must not infer that the author deliberately intended to manipulate the reader, that the article is false, or that the publisher is part of a coordinated campaign.

For every finding, the interface should show:
1. The exact passage that triggered the finding.
2. The technique name and a concise explanation.
3. Why the passage may fit the technique.
4. Relevant context or plausible alternative readings.
5. A confidence or uncertainty indicator that reflects the strength of the textual match, not the author's intent.

Absence of a detected technique is not proof that a text is neutral or accurate. Presence of a technique is not proof of deception. Ordinary reporting, advocacy, commentary, satire and legitimate persuasion can use some of the same rhetorical devices.

## Planned structure

- `index.html` — project homepage and interactive reader.
- `techniques/` — individual plain-text technique explainers.
- `techniques.json` — machine-readable technique catalogue.
- `questionnaire.html` — find techniques by the effects or textual features a reader wants to understand.
- `examples/` — short, clearly labelled illustrative examples.
- `references.json` — bibliography and source metadata.
- `extension/` — browser-extension prototype, developed separately from the core catalogue.
- `scripts/` — dependency-free validation and site generation.
- `.github/workflows/` — read-only checks and GitHub Pages deployment.

The initial scaffold will establish the content model and publishing pipeline before choosing or bundling a particular local model. Model choice should remain replaceable.

## Privacy and security

- Text entered for analysis stays on the device unless the user explicitly chooses an external service.
- No analytics, advertising, telemetry or remote text submission by default.
- The browser extension should request the minimum permissions necessary and analyse only when the reader explicitly asks.
- Do not collect browsing history or page contents in the background.
- Never execute code or follow instructions found in analysed web pages. Treat page content as untrusted input.
- Explain clearly when a feature requires downloading a model and what resources it uses.
- Keep the core catalogue usable without an AI model.

## Editorial standards

- Define techniques in terms of observable textual features.
- Prefer recognised terms with reputable references; distinguish established concepts from informal labels.
- Give concise examples and explain why they fit.
- Avoid presenting a list of techniques as proof of a hidden plan.
- Separate factual claims, value judgements, emotional framing and speculation.
- Include legitimate uses and alternative explanations where relevant.
- Cite research and primary sources. Do not invent citations or imply that a source supports more than it does.
- Keep the writing direct, accessible and free of unnecessary humour.

## Development

The site is intentionally dependency-free at the start. The publishing build and validation scripts use Node.js built-in modules. No model download or network request is required to browse the catalogue.

To build locally with Node.js 22 or newer:

```sh
node scripts/build-site.mjs
```

The generated site is written to `_site/`. Serve that directory with any local static HTTP server.

## Contributing

Contributions are welcome through pull requests. Please:
- propose additions or corrections with references;
- keep examples fictional or thoroughly anonymised;
- do not submit private messages, personal data or copyrighted full articles;
- distinguish direct quotations from paraphrases;
- explain uncertainty and competing interpretations;
- do not submit executable files or model binaries.

All contributions require human review. Automated checks validate structure and basic safety constraints; they do not establish factual accuracy or editorial quality.

## Licence

The project will use CC0 1.0 for original written catalogue content and the MIT Licence for code, unless a later project decision records a different licence. Third-party references and quotations remain subject to their own rights.
