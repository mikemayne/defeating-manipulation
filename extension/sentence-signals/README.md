# Local sentence signals

Run this Node.js pilot from the repository root. Each input sentence gives you
emotion, clickbait, toxicity, grammatical structure, similarity to labelled
examples and natural language inference. It can take preceding context or a
proposed takeaway. The pilot outputs JSON for evaluation alongside the existing
extension and test lab.

## Setup

Use Node.js 22 and Python 3.11 or 3.12 in an active virtual environment. The
first setup downloads model weights. All analysis runs on your machine.

```sh
npm --prefix extension install --no-package-lock
python -m pip install "spacy>=3.8,<3.9" "optimum-onnx[onnxruntime]>=0.1,<0.2" "transformers>=4.51,<5" "torch>=2.6"
python -m spacy download en_core_web_sm
python extension/sentence-signals/prepare_clickbait.py
node extension/sentence-signals/analyse.mjs --warm
```

To use a different Python executable for inference set
SENTENCE_PYTHON. To put model files elsewhere set SENTENCE_MODEL_DIR and pass
the same directory to prepare_clickbait.py. The Python exporter converts the
original Valurank weights once. A persistent local Python process runs the
spaCy parser. JavaScript runs the five ONNX models and combines their outputs.

## Run the pilot

```sh
node --test extension/sentence-signals/analyse.test.mjs
node extension/sentence-signals/analyse.mjs --file extension/sentence-signals/cases.json
```

The file can hold one object or an array. Each object requires sentence.
Optional context contains preceding text. Set role to headline for a headline
or title. Optional takeaway supplies a hypothesis for the inference model.

```json
{
  "sentence": "They voted to close the park.",
  "context": "The councillors met on Friday.",
  "takeaway": "The councillors voted to close the park."
}
```

Ordinary runs disable remote model loading. Run --warm again to fetch any
missing weights. The command reports model errors explicitly.

| Signal | Output |
| --- | --- |
| GoEmotions | 28 independent scores, suitable for comparing the headline and first sentence label by label |
| Valurank clickbait | Model label scores. Outputs for body text carry an out-of-domain marker |
| Unitary Toxic BERT | Six independent scores including threat and insult |
| spaCy | Dependency tokens with noun spans, plus candidate antecedents for third-person subject pronouns |
| MiniLM | Four closest labelled consequence examples and their cosine similarities |
| DeBERTa NLI | Three scores for a proposed takeaway, or an experimental consequence probe if no takeaway is supplied |

The consequence status uses wording cues and parsed grammar. It can return
specified, underspecified, review or unclear. The NLI probe and similarities
are additional measurements to compare against that status. They are
uncalibrated. The pronoun output proposes possible antecedents from visible
subjects and can miss implied subjects and references introduced as objects. Score calibration and accuracy on human-labelled
examples are still open.

The checked-in cases exercise explicit and vague consequences, contextual
references, headline scoring and takeaway comparison. The JavaScript tests
exercise the orchestration with deterministic model adapters.

## Smoke-test results

All six models scored 12 synthetic examples with remote model loading
disabled. Set SENTENCE_LIVE=1 in your shell before running the JavaScript
tests to repeat the live check with the prepared weights.

- The wording check marked both the cake and the direct threat as specified,
  and marked both the friendly surprise and the vague warning as
  underspecified. Toxic BERT scored the direct threat about 0.65 and the
  vague warning about 0.00012.
- The DeBERTa takeaway comparison supported the park-closure paraphrase.
  The generic consequence probe returned neutral for both explicit outcomes
  and entailment for “The report is on the table.” It stays experimental.
- Valurank gave a low clickbait score to the synthetic “You won’t believe”
  headline. Across four export checks, quantization moved the model's output
  probabilities by at most 0.0112. The headline classifier still needs
  separate accuracy evaluation.

[Successful verification run](https://github.com/mikemayne/defeating-manipulation/actions/runs/44980074552)
