# Defeating Manipulation

A public, collaborative, open-source collection of recognised language patterns that AI tools can use to analyse online articles.

## Purpose

This repository is a shared knowledge base. It defines patterns found in language and media, describes their observable features, and provides explanations, examples and references. AI tools can compare online article text against these definitions and identify passages that match.

The project is primarily a resource for software and AI systems, rather than a consumer-facing article-analysis service. The public website briefly explains the project and links to the repository, where the catalogue is maintained.

**The software identifies textual patterns. The reader decides what significance to give them.**

The project analyses words and their effects. It does not attempt to determine an author's motives or make judgements about authors or publishers.

## How the knowledge base is used

The catalogue is maintained in machine-readable form in `techniques.json`. Each technique should describe:

- its name and definition;
- observable textual features that may indicate a match;
- an explanation of how the pattern can work;
- illustrative examples;
- references where appropriate.

An AI system can use these definitions to compare text with recognised patterns, quote the relevant passage and explain why it matched. A match is an analytical indication, not a verdict about an entire article or its author.

A planned browser extension will perform analysis locally in the reader's browser. The long-term aim is to avoid API keys, paid inference services and sending article text to a central server.

## Principles

- **Observable patterns:** describe features of the text, not assumptions about the person who wrote it.
- **Reader interpretation:** identify and explain matches; leave conclusions to the reader.
- **Collaborative development:** make definitions open to scrutiny, correction and improvement.
- **Evidence and clarity:** use recognised terminology, explain concepts plainly and cite reliable sources.
- **Privacy:** local analysis by default; no collection of browsing history or automatic upload of article text.
- **Open access:** keep the catalogue easy to reuse, inspect and fork.

## Repository structure

- `index.html` — short public explanation of the project.
- `techniques.json` — machine-readable collection of patterns.
- `techniques/` — generated explanations for individual techniques.
- `references.json` — bibliography and source metadata.
- `docs/` — design and implementation notes.
- `extension/` — browser-extension planning and prototype.
- `analysis-schema.json` — structured format for analysis findings.
- `evaluation/` — test examples and evaluation guidance.
- `scripts/` — site generation and validation.
- `.github/workflows/` — automated validation and GitHub Pages deployment.

## Contributing

Contributions are welcome through pull requests. Please:

- propose additions or corrections with references where possible;
- define observable features that can be identified in text;
- explain the pattern without attributing motives to an author;
- use fictional or properly anonymised examples;
- do not submit private messages, personal data or full copyrighted articles;
- distinguish direct quotations from paraphrases.

All contributions require human review. Automated checks validate structure; they do not establish factual accuracy or editorial quality.

## Development

The site is intentionally dependency-free. With Node.js 22 or newer:

```sh
node scripts/test-build.mjs
```

This builds the static site into `_site/` and checks the generated pages. To build without running the checks:

```sh
node scripts/build-site.mjs
```

## Licence

The project uses CC0 1.0 for original written catalogue content and the MIT Licence for code. Third-party references and quotations remain subject to their own rights.

## Current status

The repository contains an initial catalogue and supporting project scaffolding. Definitions, examples and references are a starting point for collaborative development, not a completed or definitive taxonomy.


## Argument inconsistency patterns

The website has three searchable, colour-coded catalogue areas: manipulation
techniques (blue), positive communication (green), and argument consistency
patterns (red). The red library is defined entirely in
`inconsistency-patterns.json`, with generated detail pages at
`inconsistency-patterns/<id>.html`.

To extend it, add a new object to that JSON file using a unique `id`, a
`title`, `category`, `summary`, `definition`, `observable_features`,
`tags` and an illustrative `example`. The shared homepage renderer
automatically displays every entry and supports searching it; the site
generator automatically publishes its individual red page and sitemap URL.
Run `node scripts/test-build.mjs` to validate the catalogue.

The initial patterns are contradictory claims, a conclusion insufficiently
supported by the evidence **provided**, and a conclusion appropriately
supported by its premises. The supported-conclusion entry is a reference
pattern, not an error simply because it is displayed in the red library.
The current local second-stage model detects potential contradictions;
paragraph-level conclusion support remains a planned classifier enhancement.
