# Local semantic Firefox highlighter

From this directory run:

```powershell
npm install
npm run build
npx web-ext run --source-dir .
```

The extension uses a quantized MiniLM sentence-embedding model through Transformers.js. The first run downloads model weights; browser caching is used for subsequent runs. Matching is performed locally and webpage text is not sent to a server.

Each sentence and adjacent two-sentence window is compared with all technique titles, summaries and tags in the bundled catalogue. The cosine-similarity threshold (currently 0.48) is an initial setting and must be evaluated against representative positive and negative examples.

The technique catalogue is bundled locally. Full explanation links still require internet access.

## Test matching without Firefox

From the repository root, run `node extension/evaluate.mjs --strict`.
This exercises the same pattern matching code as the extension against hundreds
of labelled examples and reports errors by technique. After `npm install` in
`extension/`, run `npm run evaluate:ai` there to include the locally executed
MiniLM semantic model. See `evaluation/README.txt` for commands and test design.

## Local webpage to stress-test the matcher

Install dependencies once using `npm install`, then run
`npm run benchmark:dev` from `extension/` and open
`http://127.0.0.1:4173/extension/benchmark.html` in Firefox.

The page imports the same matching core as the browser extension, generates
a reproducible large test set, displays only progress and aggregate statistics,
and provides a button to copy failure details. It also accepts local labelled
JSON/JSONL datasets. See `evaluation/README.txt` for the test data format.


## Second-pass inconsistency benchmark

Open the same local Matcher Test Lab and choose **Inconsistencies — local NLI**.
The extension and test lab share the exact same `findInconsistencies` algorithm,
with bidirectional contradiction checks. Both now use the same tokenizer and
quantised `Xenova/distilbert-base-uncased-mnli` model to encode a **pair of
statements**, rather than analysing each statement separately.

The model downloads on first use from Hugging Face, then runs on your own
computer with browser model caching. Firefox does not upload the selected
passage. First-run model loading can take noticeably longer than the normal
MiniLM matching step; allow it to finish before interpreting the results.

The generated default is **200 cases**, drawn from 50 fictional topics with
controlled wording variants: 50 direct contradictions, 50 paraphrases,
40 consistent statements, 40 different-speaker/date comparisons and 20
hypotheticals. These are preliminary, synthetic smoke tests and should not be
treated as independent evidence of accuracy on real news articles.

For imported JSON or JSONL files use the existing case format, but specify
`"expected": ["argument_inconsistency"]` for a text containing a contradiction
within the same relevant context, or `"expected": []` if it should not be
highlighted. The lab reports case-level precision/recall and copies failure
details including any red-highlighted pairs. A model download or inference
error is reported as an error, not as a successful negative classification.


### Reporting disagreements versus contradictory claims

The local inconsistency pass excludes comparisons of clearly attributed claims
from **different sources** (for example, a manager saying a centre is open
and a spokesperson saying it is closed). Reporting their disagreement is not
by itself an inconsistency in the article. Two conflicting claims by the
**same named source** remain eligible, as do unattributed contradictions.
The attribution parser is deliberately conservative: ambiguous passages may
still require manual review.

The public technique entry **Inconsistent or unsupported reasoning** now also
explains that a conclusion may be unsupported *by the premises actually given*,
without being disproved. The current local NLI pass is primarily a claim
contradiction detector; recognising unsupported paragraph-level conclusions
is a separate, later enhancement and is not yet claimed as a tested ability.
