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

### Single-paragraph argument benchmark

The Matcher Test Lab now has **one** argument-testing mode:
**Arguments — single paragraph (structure + optional NLI)**.
The retired, separate `argument_support` and `argument_structure` test modes
are no longer available. Existing 96-case synthetic argument tests still run
as development regressions, but are no longer a selectable browser mode.

Choose **Dataset: Upload labelled JSON / JSONL** and provide an array of
cases or an object with a `cases` array. Each row contains:

```json
{
  "id": "fictional-example-01",
  "text": "The council increased rents and therefore expects more revenue.",
  "expected_argument": true,
  "expected_model_conclusion": "The council expects more revenue.",
  "expected": ["supported_conclusion"]
}
```

Only `id`, `text`, and `expected_argument` are required. The optional
`expected_model_conclusion` tests the exact normalized NLI input. The
optional `expected` array is one of `[]`, `["supported_conclusion"]`,
`["unsupported_conclusion"]` or `["contradictory_claims"]`. **Only rows
with an explicit `expected` field invoke the unchanged local NLI model**.
An empty array means an independently labelled abstention/no-verdict
reference, not missing metadata.

The lab reports separate exact structure and reasoning counts, as well as
combined metrics and detailed misses. Downloaded test data stays local.
Reference labels must be assigned independently before inspecting predictions;
the tests do not establish political truth or a writer's intent.

CI tests the new metadata schema and the unchanged local analyser using
fictional cases. Live browser accuracy requires a separate labelled corpus.

### Per-premise evidence fusion (after the first browser benchmark)

The first real `argument_support` run on the default 96 cases reported
84.4% exact classifications: 8 contradicted conclusions were missed,
5 unsupported conclusions were missed, and 2 supported conclusions were
incorrectly classed as unsupported. The extractor found all 72 examples
with explicit conclusions, so we refined **NLI evidence scoring** rather
than changing the extraction markers or the test fixture.

A single concatenated premise can cause sentence-pair NLI to overlook
a decisive sentence when another sentence concerns a different fact.
The analyser now scores the **combined premises and each individual
premise**, retaining the joint score for genuine multi-step arguments.
A verified contradiction in any premise takes precedence over support;
a clearly supported statement takes precedence over unrelated neutral
evidence; otherwise sufficiently confident neutral evidence can trigger
**Insufficient evidence provided to support this conclusion**. Exact
repetitions of the conclusion are safely recognised as supported.

The **Copy failure details** output for this mode now includes every
combined and individual NLI score (contradiction, neutral, entailment,
plus reverse contradiction where checked), even when the model abstains.
This makes it possible to distinguish an extraction problem, a model
misclassification and an over-strict decision threshold.

This refinement is covered by deterministic CI tests; actual accuracy
must be measured by rerunning **the same 96 cases in Firefox**. Existing
blue, green, turquoise, and pairwise-red detection remain unchanged.


### Calibrating insufficient evidence vs contradictory conclusions

After the first per-premise change, the 96-case real-model benchmark
improved from 84.4% exact to **96.9%**, with three remaining errors:
two unsupported conclusions were missed, and one was incorrectly
called a contradiction.

The NLI model had scored claims such as "a council published a report,
therefore all waste is eliminated" as strongly contradictory in one
direction but **not** the other. This is an unsupported inference, not
a logical contradiction. The updated analyser checks for highly
asymmetric NLI scores before abstaining, and explicitly handles a
limited positive-example-to-universal-claim scope expansion (e.g.
"platform two is accessible" does not prove "every platform is
accessible"). Clear opposing claims remain in the contradiction class.

The local failure report includes the precise decision reason when
this calibration is used. Nine model-score replay and contrast cases
are stored in `evaluation/argument-evidence-contrasts.json`, alongside
existing regression tests. These are fixed diagnostic scores, **not**
independent estimates of generalisation; the 96-case local AI test
must be rerun to verify improvement before changing thresholds again.


## Benchmark authentic real-world arguments (recommended after synthetic tests)

**Note for older datasets:** the archived real-world collector exports the
retired `{id, text, expected}`-only argument schema. Its files are **not**
accepted by the current paragraph test mode unless the independently labelled
`expected_argument` property is added to each row. The older source files
remain outside the new test workflow. Do not infer structure labels from NLI
predictions.


The template-generated 96-case argument dataset is a **regression test**.
Even 96/96 correct does not establish reliability on unknown writing.
For a meaningful external test, use the new
[real-world corpus collector](./real-data.html), served locally alongside
the Matcher Test Lab:

```bash
cd extension
npm run benchmark:dev
```

Open `http://127.0.0.1:4173/extension/real-data.html`. The page lists
authentic published starting sources across statistics, government reports,
parliamentary evidence and scientific guidance. It does **not** contain
prewritten/paraphrased "real" examples or automatically guessed labels.
Choose real, unmodified, continuous paragraphs and manually annotate the
conclusion **before** running the analyser.

The collector captures source title, public URL, natural-versus-challenge
sampling strategy, verbatim text, the human-selected label, and rationale.
Use the "Uncertain — exclude" label where no fair ground truth can be
assigned. Annotations are retained in the browser's local storage;
the exported `real-argument-benchmark.json` is entirely local and excludes
uncertain cases. Back it up before clearing site data. The local server
does not accept uploads or send selection text to any third party.
Respect source licences if redistributing your exported excerpts.

In the Matcher Test Lab, choose **Arguments — single paragraph (structure + optional NLI)**, set **Dataset: Upload labelled JSON / JSONL**, select the
exported file, and run. Results now show separate exact accuracy,
precision and recall for **natural** and **challenge** sampling and
include the publication URL plus original human rationale in copied
failure details.

Suggested evaluation: sample **50–100 naturally selected passages** from
multiple independent articles, plus **25–50 challenge passages** containing
real, sometimes implicit arguments. Include both supported and unsupported
inferences, reported disagreements, and no-argument controls. Labels must
be chosen *without inspecting model results*. Natural prevalence matters:
don't artificially force every article to have one of each technique.
A second independent reviewer is valuable for ambiguous examples.

The current parser recognises explicitly signalled conclusions; real
implicit arguments will often be missed. This is an important and
measurable coverage limitation, not a reason to rewrite the article
to fit the matcher or to relabel it as "no argument." Maintain the
original text and label, then use the failures to decide what to improve.


### First authentic-text pilot: important coverage gap

The first source-linked real-world pilot used **23 genuine excerpts**
(18 ordinary passages and 5 independently labelled supported arguments).
The existing analyser correctly left all 18 ordinary passages unflagged
but found **none of the five supported arguments**: three were
misclassified as insufficiently supported and two were not extracted
at all. Accuracy was 18/23 (78.3%). The zero precision and recall
reflect **zero correctly labelled supported examples**; they do not
provide a useful estimate of performance across all argument types.

Two genuine conclusions appeared **inside** a sentence, introduced by
`which means` and `indicates that`, rather than beginning a new sentence
with `Therefore`. This update adds conservative in-sentence extraction
for these and related evidential verbs, including qualified factual
claims with `might`, `may`, `can` or `could`. Recommendations such as
`we should consider` remain excluded. It keeps the exact source-text
offsets, reports the inference marker in diagnostic output, and does
not treat the connective itself as proof that the reasoning is sound.

**What this does not solve:** the remaining three real-world passages
used technical or probabilistic reasoning. A neutral score from a
sentence-pair entailment model does not assess how much scientific
evidence supports a cautious inference, and a real argument may depend
on background knowledge not present in the selection. Automatically
declaring every `therefore`, `which means` or `indicates that`
conclusion supported would conceal weak arguments, not fix them.

Rerun the **same 23-case uploaded pilot** to check extraction coverage
and inspect the newly available diagnostics for the two inline cases.
Expect that the overall 78.3% accuracy may **not** improve until we
add better argument-specific reasoning, rather than merely broader
trigger phrases. For a valid external performance estimate, gather
a **new held-out set** with real supported, unsupported and
contradicted conclusions labelled before seeing predictions.


### Retired browser instruction-model experiment

The opt-in Qwen argument-reasoning test mode has been **retired** after
real Firefox measurements. The 23-case run took 507.4 seconds and
returned five malformed model replies. After the output-handler
changes, a one-case smoke test still required **94.4 seconds**, caused
serious browser sluggishness, and generated gibberish instead of a
meaningful argument classification.

The code no longer loads or runs that model; the test-lab option and
model module are removed. The single-paragraph local MNLI evaluation path and the original red highlighter remain intact.

**Important distinction:** on the same real-text pilot, the NLI
extractor found the five scientific arguments, but its neutral class
did not recognise their qualified evidential support. That unresolved
limitation must not be concealed by calling neutral "unsupported" with
unwarranted certainty. Any future solution needs to be fast enough for
ordinary browsing and evaluated on fresh, independently labelled
real passages including supported, unsupported and contradicted claims.


### Fast, conservative assessment of evidential support

The local NLI model is fast but its **neutral** label means only that
the conclusion is not *deductively entailed*. It cannot distinguish
a reasonable statistical/scientific inference from weak evidence
merely by returning neutral. In the 23-case real-world pilot all five
supported scientific conclusions were wrongly marked unsupported for
this reason.

The default local argument checker now takes the conservative route:

- **Genuine contradictions** that pass the existing two-direction NLI
  check remain red.
- **Obvious unsupported scope or certainty leaps** remain red when the
  conclusion makes a categorical universal, absolute guarantee or
  superlative claim not established by the stated premises. An
  inference marker such as "therefore" is never proof of correctness.
- **Insufficient evidence to judge the quality of the inference** means
  **no underline**. NLI neutrality alone is not enough to flag a
  factual or qualified conclusion as an error.
- **Clearly supported conclusions** remain unmarked, and they can still
  be reported as supported in the benchmark.

The Matcher Test Lab's argument diagnostics now explicitly identify
`evidential_support_uncertain` with "insufficient evidence to judge;
no underline". This is *not* the same thing as an affirmative
`unsupported_conclusion` finding. The real pilot's five neutral
NLI-score traces, including the inline "which means" and "indicates"
examples, are preserved in automated abstention tests.

This change **does not claim to have proved** those five scientific
arguments are supported. It deliberately avoids a misleading red flag
when the model is unable to assess the relevant background knowledge.
It runs on the original fast local NLI model and lexical scope checks,
without any browser-based text-generation model or extra API calls.


### Clause-level argument structure extraction

The argument analyser now imports the independent, deterministic
`src/argument-clauses.mjs` module. It separates **premise clauses** from the
**conclusion**, in whichever order they appear, while keeping original source
offsets so red highlighting applies only to the actual conclusion. Recognised
forms include `because`, `since`, `therefore`, `which means`,
`indicates that`, `we concluded`, and a following `This is because` sentence.
It avoids splitting domain names and decimals into fake sentences.

This **only finds candidate arguments**. It neither proves support nor labels
manipulative intent. The existing local NLI evidence scoring, conservative
abstention (no red underline when uncertain), and maximum candidate/premise
limits remain. The parser intentionally ignores some ambiguous or context-only
constructions rather than inventing a premise.

The 101-case web-sourced exploratory pilot exposed 16 missed self-contained
arguments. With the new parser, local extraction tests found **16/16** labelled
inference candidates and **0/85** of its no-inference passages. This is
**extraction coverage**, not model accuracy; no new browser MNLI accuracy is
claimed. The separate synthetic regression suite uses 16 positive and 20
negative independent examples and checks exact source offsets. Run it with
`node scripts/test-argument-clauses.mjs` from the repository root; it is
also part of `node scripts/test-build.mjs` validation.

Rerun **Arguments — single paragraph (structure + optional NLI)** on the unchanged
101-case JSON and inspect the NLI diagnostics, actual red false positives,
recall, and runtime. Changes to extraction can expose new NLI limitations;
keep the pilot's labels unchanged until independent review.


### Explicit evidence checks for red argument findings

The existing browser-local `Xenova/distilbert-base-uncased-mnli` model and
its quantisation, weights, and token budget are **unchanged**. A second, fast,
rule-based check in `src/argument-evidence-checks.mjs` consumes the parsed
premise and conclusion separately. It is fed structured comparisons rather
than interpreting a raw MNLI probability as a logical proof:

- **Contradiction requires an observable conflict** such as the same claim
  being explicitly denied, an opposing predicate about the same subject and
  time, or an explicit `only` restriction that conflicts with `every`.
  Different authors or periods do not automatically contradict one another.
- **Unsupported requires a specific evidence gap** such as observing two
  platforms and concluding every platform is accessible. The mere presence
  of `all`, `most`, `best`, `guaranteed` or strong MNLI neutrality is
  not enough for a red underline.
- **Everything else abstains** with no red underline, including scientific
  inferences that may require specialist knowledge.

These are deliberately narrow *verification signals*, not a claim that the
model knows a statement is true, that a writer is deceptive, or that every
unsupported inference has been caught. Supported conclusions are still
classified only by the original NLI/identity paths.

`evaluation/argument-evidence-pairs.json` contains 54 distinct manually
authored premise/conclusion contrasts, with expected evidence signals and
rationales. The independent test is `node scripts/test-argument-evidence.mjs`.
It also replays the **actual reported NLI scores** that previously generated
incorrect red marks for the election example and the physics example.
CI runs this test during project validation. It does **not** rerun the
neural model.

Keep the 101-case real-world benchmark unchanged and rerun in Firefox to
measure the tradeoff: false red markings should become less likely, while
unsupported-argument recall may stay low or fall. Metrics must report
abstention and misses honestly, not relabel reference cases.


### Complete model hypotheses in a single paragraph

The local argument analyser uses the **same quantised NLI model**. The
`src/argument-claim-normalisation.mjs` module can fill in an unambiguous shared
subject for the *model hypothesis only*. For instance, `The service raised
prices and therefore expects higher revenue` is compared as `The service
expects higher revenue`, but the original text is always retained for
highlighting and attribution.

Quoted assertions, conversational asides, and unassessable inferences should
not be silently treated as the author's own factual conclusions. Source
offsets and the conservative evidence checks remain unchanged.

Run `node scripts/test-media-social-arguments.mjs` for independent **fictional**
positive and negative structural tests. Project validation includes those
tests and verifies the NLI hypothesis and original underline positions.

Real media and social-media collections are kept **outside the repository**;
no scraped passages, source URLs, or downloadable corpus is committed.
Testing the unchanged browser NLI model on a separate, independently labelled
paragraph collection is still needed before claiming real-world improvement.


### Single-paragraph media reasoning: structural coverage and explicit relations

The argument analyser retains the same local `Xenova/distilbert-base-uncased-mnli`
model. A new extraction pass covers factual `X, so Y` clauses and leading
`That means / That proves / That guarantees`, while preserving the original
conclusion offsets and preceding premises in a single paragraph. Explanations
such as `Because of the rain, the event was cancelled` are not assumed to be
self-contained arguments.

The separate, deterministic `src/argument-claim-relations.mjs` checks only
narrow observable relationships: same-topic opposite actions, a clearly
conflicting venue ticket claim, and a limited sample being presented as a
whole-population result. The rules require matching scope and abstain for
different dates, groups, locations, resale tickets or qualified conclusions.
A verified opposing relationship can prevent a bad high-confidence model
entailment from becoming a false `supported_conclusion` verdict.

**Rule match scores are binary indicators, not calibrated probabilities or
independent corroboration.** Do not treat a sentence as factually false or
its author as dishonest solely because a supplied premise and conclusion
appear inconsistent. Unknown cases still abstain without red underlines.

These changes were motivated by a user-run 100-paragraph exploratory
media/social benchmark (80/100 structural, 35/100 reasoning before this
change). The corpus **is not included or committed**; CI exercises separately
authored fictional positive and negative controls. Re-run the identical
downloaded dataset after merging for a regression comparison, then verify
performance on a different independently annotated sample before claiming
generalisation.

## Possible correction bait (spelling)

When selected English text contains a likely spelling mistake, the extension
underlines that word in blue with the warning: **“Possible correction bait —
don't take it.”** The feature is intentionally cautious: it uses an offline
en-GB dictionary and only marks words with a plausible one-edit correction,
skipping capitalised names, links, handles and common service names. A warning
is not evidence that an author deliberately misspelled something. The extension
does not display suggested corrections or tell readers to reply.

Firefox's native spelling marks are not exposed through a WebExtensions read
API, so this check uses the open-source `nspell` engine and a bundled dictionary.
Build with `npm run build` before running the unpacked extension. The generated
`spell-en-gb.aff` and `spell-en-gb.dic` files remain local to the extension.
The en-GB dictionary and affix data are licensed (MIT AND BSD), and nspell is MIT.
