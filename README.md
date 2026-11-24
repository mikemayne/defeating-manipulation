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

## Principles

- **Observable patterns:** describe features of the text, not assumptions about the person who wrote it.
- **Reader interpretation:** identify and explain matches; leave conclusions to the reader.
- **Collaborative development:** make definitions open to scrutiny, correction and improvement.
- **Evidence and clarity:** use recognised terminology, explain concepts plainly and cite reliable sources.
- **Open access:** keep the catalogue easy to reuse, inspect and fork.

## Repository structure

- `index.html` — short public explanation of the project.
- `techniques.json` — machine-readable collection of patterns.
- `techniques/` — generated explanations for individual techniques.
- `references.json` — bibliography and source metadata.
- `docs/` — catalogue design and historical research notes.
- [Potential analyser signals](docs/potential-signals.md) — research ideas and pilot results.
- `analysis-schema.json` — structured format for analysis findings.
- `evaluation/` — historical evaluation examples and research notes.
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


The browser extension has been retired and is no longer distributed or maintained in this repository. Earlier experimental software and its tests remain in Git history. The website and machine-readable catalogue remain active.

The red argument-inconsistency catalogue is retained as research data but is not published on the website.
