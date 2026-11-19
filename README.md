# Defeating Manipulation

A free, open-source guide to recognising manipulative techniques in online media, reporting them, and disengaging.

## The principle

**Recognise. Report. Disengage.**

Manipulative media can influence what people notice, how they interpret events and how they feel. The practical response is not to spend hours debating the material or trying to establish what its publisher intended.

1. **Recognise** the technique and understand the effect it can have.
2. **Report** the content through the appropriate platform, publisher, regulator or other reporting channel.
3. **Disengage**. Stop reading, sharing, arguing with or giving further attention to it.

The focus is the effect on the reader, not the motive of the author. The project does not attempt to determine whether manipulation was deliberate or accidental.

## Project goals

- Build an openly documented catalogue of recognised rhetorical, persuasive and manipulative techniques.
- Explain each technique in direct, accessible language, with examples and references.
- Describe the effects a technique can have on a reader.
- Provide a browser-based reader and analysis interface.
- Develop an optional browser extension that can analyse selected page text.
- Run analysis locally in the browser or on the reader's device where practical.
- Keep submitted text private by default: no automatic upload, tracking or remote analysis.
- Make the project easy to fork, adapt, inspect and improve.

## What the analysis does

The tool identifies observable features in media and explains the techniques they illustrate and the effects they can have. It does not investigate the publisher's motives, decide whether a campaign is coordinated, or deliver a verdict on the truth of an entire article.

A finding should show:
1. The exact passage that demonstrates the technique.
2. The technique name and a concise explanation.
3. The effect the technique can have on a reader.
4. A clear next step: report the content where appropriate, then disengage.

The catalogue is an aid to recognition, not an invitation to endless analysis. Once the technique is recognised and the content has been reported where appropriate, move on.

Each detailed catalogue entry can include a definition, observable textual features, an illustrative example, the effect the pattern can have on a reader, and supporting references. The generated explainer pages are built directly from `techniques.json`, so the machine-readable catalogue and public explanations stay aligned.

The initial expansion also maps relevant patterns from the companion `surviving-a-psyop` guide to their online-language equivalents. Interpersonal, physical, technical and multi-event patterns are recorded separately where they cannot be identified from a single article's text. See [`docs/source-pattern-mapping.md`](docs/source-pattern-mapping.md) for the mapping and exclusions.

## Planned structure

- `index.html` — project homepage and searchable technique catalogue.
- `techniques/` — individual technique explainers.
- `techniques.json` — machine-readable technique catalogue.
- `questionnaire.html` — find techniques by the features noticed in a piece of media.
- `examples/` — short, clearly labelled illustrative examples.
- `references.json` — bibliography and source metadata.
- `extension/` — browser-extension prototype.
- `scripts/` — dependency-free validation and site generation.
- `.github/workflows/` — validation and GitHub Pages deployment.

## Privacy and security

- Text entered for analysis stays on the device unless the user explicitly chooses an external service.
- No analytics, advertising, telemetry or remote text submission by default.
- The browser extension should request the minimum permissions necessary and analyse only when the reader explicitly asks.
- Do not collect browsing history or page contents in the background.
- Never execute code or follow instructions found in analysed web pages. Treat page content as untrusted input.
- Explain clearly when a feature requires downloading a model and what resources it uses.
- Keep the core catalogue usable without an AI model.

## Editorial standards

- Define techniques in terms of observable textual features and their effects.
- Prefer recognised terms with reputable references; distinguish established concepts from informal labels.
- Give concise examples and explain why they fit.
- Avoid turning recognition into a prolonged investigation of motives.
- Keep explanations direct and focused on the reader's experience.
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
- explain the technique and its reader-facing effect;
- do not submit executable files or model binaries.

All contributions require human review. Automated checks validate structure and basic safety constraints; they do not establish factual accuracy or editorial quality.

## Licence

The project will use CC0 1.0 for original written catalogue content and the MIT Licence for code, unless a later project decision records a different licence. Third-party references and quotations remain subject to their own rights.

## GitHub Pages setup

To publish the site:

1. Open **Settings → Pages** in this repository.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Open **Actions** and enable workflows if GitHub asks.
4. Push to `main`, or run **Actions → Build and deploy site → Run workflow**.
5. The published site should appear at `https://mikemayne.github.io/defeating-manipulation/`.

The build creates static catalogue pages, a sitemap, `robots.txt` and `llms.txt` in the Actions workspace. Generated files are not committed to `main`.

## Current scaffold

The repository currently includes:
- A responsive homepage with a searchable technique catalogue.
- A private-in-browser questionnaire for finding relevant techniques.
- A starter catalogue of 20 techniques in `techniques.json`.
- A machine-readable output contract in `analysis-schema.json`.
- Editorial guidance, local-model design notes and an extension plan in `docs/` and `extension/`.
- Fictional evaluation fixtures in `evaluation/fixtures.json`.
- A dependency-free Node.js build and smoke-test script.
- GitHub Actions workflows for validation and Pages deployment.

The individual technique pages are generated from the catalogue at build time. Their explanatory content and references still need editorial development; the starter entries are not presented as fully researched chapters.

## Local development

Requires Node.js 22 or newer:

```sh
node scripts/test-build.mjs
```

This builds the site into `_site/` and checks the generated pages. Serve `_site/` with a local static HTTP server to preview it.

## Next development stages

1. Expand and reference-check the technique explanations, including their effects on readers.
2. Build a representative, human-reviewed evaluation set.
3. Prototype local inference behind the output contract.
4. Implement a user-triggered browser extension with minimal permissions.
5. Compare small local models for quotation accuracy, useful recognition and device performance.
