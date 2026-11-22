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
- [Potential analyser signals](docs/potential-signals.md) — research ideas and pilot results.
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


## Argument inconsistency patterns — paused

The red category is temporarily removed from the public website and normal
browser analysis. The website publishes the blue manipulation catalogue and
green positive-communication catalogue. It does not publish the red library,
its detail pages or its discovery links, and the extension does not run the
red contradiction or premise-to-conclusion checks.

`inconsistency-patterns.json`, its analysis modules and the dedicated local
benchmark modes remain in the repository for research and future restoration.
The build still validates the retained catalogue. Blue, green, turquoise and
orange analysis remain available.

## Orange: deserves scrutiny

The browser analyser may underline a passage **orange** when several different
weak signals converge but none of its named detectors identifies a pattern.
It looks for combinations of reader pressure, unqualified certainty, strongly
emotive stakes, urgency, threatened consequences and presumed agreement. When
available, a near-miss semantic match or uncertain inference can contribute
another signal. Four independent text-signal families can also trigger the
advisory without a local model.

Orange is **not a manipulation finding** and says nothing about the author's
intent or the truth of the statement. It means *check the wording, context and
supporting argument*. Individual signals (including emotional language) do not
trigger it. Known blue, turquoise and green matches take precedence.
This is experimental; thresholds should be validated against independently
labelled, real-world positive and negative examples before interpreting its
accuracy. Test the fallback with `node scripts/test-scrutiny-signals.mjs`.

## Local text preprocessing and attention cues

The extension now runs a conservative JavaScript pre-processing pass before
its model and pattern analysis. The original selection is preserved verbatim;
only a separate **analysis copy** is changed. A character-to-original offset
map keeps all highlights aligned with the actual page text.

- Unambiguous corpus-style spacing artefacts (for example, split apostrophes,
  common split prefix hyphens, and spaces before punctuation) are cleaned for
  analysis but **not** treated as manipulation signals.
- A local British-English dictionary identifies plausible misspellings.
  Only a single one-edit suggestion can be substituted in the working copy;
  ambiguous words, proper names, URLs, handles and code are left alone.
- Unusual repeated punctuation, adjacent repeated words and possible spelling
  errors create **weak attention-hook signals**. Such wording may attract
  attention or corrective replies, but intention cannot be inferred.
- The existing spelling highlight and new punctuation annotation identify
  possible attention hooks. These signals may also contribute to the orange
  multi-signal scrutiny category; a lone typo never triggers orange.

The preprocessing module is `extension/src/text-preprocessing.mjs`. Run
`node scripts/test-text-preprocessing.mjs` to check original offsets,
protected text, spelling ambiguity and scrutiny gating. Corrections are
**not retroactively applied to existing evaluation caches**, so historical
benchmarks remain comparable.

## Authentic-text reader training experiment

A reproducible document-disjoint GUM experiment now tests whether training the
KEEP / AND / BUT reader on additional genuine GDTB AND/BUT relations improves
generalisation. Source documents and all local scores remain excluded from Git.
There is no independently verified authentic KEEP dataset yet; an **unlabelled**
review queue and two-reviewer gate are provided separately.

```sh
node scripts/build-reader-gum-transfer.mjs
node scripts/evaluate-reader-gum-transfer.mjs --preview
node scripts/evaluate-reader-gum-transfer.mjs --max-errors 5
```

The comparison uses 402 existing synthetic cases, plus authentic GUM training
examples, and evaluates on different GUM documents. It reports per-class and
balanced recall, not just the heavily AND-skewed overall score. Details and
reviewer instructions are in
`evaluation/reader-authentic-transfer-protocol.md`.

The previously merged nonstandard vocabulary/synonym checker (PR #98) remains
part of the browser preprocessing pipeline. This training experiment does not
change or train that checker.

