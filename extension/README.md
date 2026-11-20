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


## Green positive-pattern matching

The Firefox selected-text analyser now recognises the 12 positive communication
patterns from the published `positive-patterns.json` using a separate
conservative rule matcher and the same local MiniLM model. Green matches link
to the public `positive-patterns/<id>.html` detail pages. The existing
negative matcher, its strict thresholds, and red inconsistency pass remain
independent. Blue takes priority if blue and green matches overlap.

The local Matcher Test Lab also offers **Positive patterns — rules only** and
**Positive patterns — rules + local AI**. Both test only green labels; the AI
mode runs the same shared positive-matching module as Firefox, using the same
MiniLM embeddings with extra observable-evidence gates and higher similarity
thresholds. The initial default dataset contains 72 fictional cases:
36 constructive statements across 12 patterns and 36 neutral or negative
near misses. A new private dataset can be uploaded as JSON/JSONL with
`{"id":"...","text":"...","expected":["restoring_agency"]}`, or
`"expected":[]` for a non-example.

Adding a new positive pattern to the public JSON makes it automatically
available for embedding-based classification; add high-precision cues to
`extension/src/positive-rules.json` and `positive-evidence.mjs` to enable
reliable detection of new wording. Rebuild the extension with
`npm run build` after changing these files.

A constructive phrase may be quoted, sarcastic, or followed by a manipulative
demand. A green match identifies the local phrase only: it does **not** certify
that the passage as a whole is constructive. Detecting a negative pattern
**concealed behind** a positive one is a separate later relationship classifier.


## Turquoise concealed-manipulation relationship analysis

The Firefox selected-text analyser now performs a **fourth**, independent
pass looking for positive-sounding statements that are subsequently reversed
by an explicit demand, penalty, threat or shaming condition. For example:

    No pressure, but you must agree with me or lose your place.

The pressure clause receives a **turquoise underline**. The hover text shows
the preceding positive opening and, where the blue matcher recognises it,
the related manipulation technique. A relationship finding is a description
of the passage's structure and is **not proof of an author's intentions**.

The rules and explanations are driven by
`extension/src/concealed-patterns.json`. Each pattern contains observable
positive cues, negative cues and the positive/negative technique IDs that
provide additional model evidence. To extend the library, add a pattern
entry instead of hardcoding extra tests in the UI. The matcher requires a
close, connected reversal: merely finding a green and a blue span nearby
is insufficient. Reports of distinct speakers disagreeing, unrelated
paragraphs and ordinary deadlines are negative controls.

The local Matcher Test Lab has two new modes:
**Concealed manipulation — relationships (rules)** and
**Concealed manipulation — local AI + relationships**. The first is the
quick, deterministic reference. The second runs both real local MiniLM
positive and negative passes, then uses those results as additional
evidence for the **same** relationship classifier.

The initial fixture `evaluation/concealed-pattern-examples.json` contains
96 fictional cases (48 reversals, 48 difficult non-examples); generated
variations are also available. Import JSON/JSONL cases with
`{"id":"...", "text":"...", "expected":["choice_with_coercion"]}`
or `"expected":[]`. The failure-copy report includes matched positive and
pressure passages to make diagnosing false positives straightforward.

**Scope:** this first version targets direct reversal of reassuring wording
by a clearly coercive statement. Subtle implication, indirect threats,
sarcasm, long-range persuasion and concealed manipulation that does not
match these observable mechanisms need further development and testing.


## Whole-paragraph argument support analysis (experimental)

The Firefox extension now runs two **different red NLI checks** on the same
selected text:

1. The existing sentence-pair contradiction detector (unchanged).
2. A new paragraph-level analysis that identifies an **explicit conclusion**
   (for example, "Therefore, ...", "This proves ...", or "Thus, ..."), gathers
   up to five preceding premise statements across adjacent paragraphs, then
   asks the **same local NLI model** whether the supplied premises entail,
   contradict or leave the conclusion unestablished.

Outcomes: **supported conclusion** (available in the test lab but not red
underlined); **contradicted conclusion** (red); and **insufficient evidence
provided for the conclusion** (red). If the inference is uncertain or the
conclusion is only a suggestion or recommendation, the analyser **abstains**.

A neutral NLI score does not mean a conclusion is false. A flag means only
that the evidence **present in the selection** appears insufficient for the
inference made. Additional evidence may exist elsewhere. The analyser does
not attempt unrestricted logical proof, causal inference or author-intent
detection, and sentences without a clear conclusion signal are not
classified by this version.

The Firefox selection remains editable and browsable during the longer
analysis. A small **non-blocking status badge** reports the active stage,
with an indeterminate progress bar rather than a bogus percentage or busy
mouse cursor. The hover popup shows the premises for each flagged
conclusion, and links to its red pattern entry.

### Whole-argument benchmark

Open the Matcher Test Lab and choose **Arguments — premise and conclusion
(local NLI)**. The default is **96 fictional cases**:
24 supported conclusions, 24 unsupported inferences, 24 contradictions,
and 24 passages without an explicit assessable conclusion. You can also
upload a labelled JSON/JSONL file with `id`, `text` and
`expected`: one of `["supported_conclusion"]`,
`["unsupported_conclusion"]`, `["contradictory_claims"]`,
or `[]` for passages that should not receive a verdict.

The test lab uses the same local NLI scoring and argument extraction as
Firefox, reports precision/recall for all three classes, and includes the
premises and conclusion in failure details. The prior 200-case
**Inconsistencies — local NLI** contradiction benchmark remains separate.

CI exercises the parser, evidence gathering and decision logic using
deterministic scorer outputs, **not** the browser's real NLI inference.
Run the test lab in Firefox to assess the real model, and add fresh,
independently written examples before claiming general accuracy.
