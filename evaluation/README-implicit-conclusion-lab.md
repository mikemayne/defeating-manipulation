# Implicit Conclusions — real-world test lab

From the repository root, start the development lab:

```powershell
cd extension
npm install
npm run benchmark:dev
```

Open **http://127.0.0.1:4173/extension/benchmark.html** and choose **Implicit conclusions — local LLM (real examples)**. Select a JSON or JSONL file, then **Run tests**. The lab works with **1–2,000 examples per upload**. Stop is available; stopped runs return all completed rows.

## Input

Use a JSON array, an object containing `cases`, or one object per line (JSONL). The only required fields are a unique string `id` and nonempty `text`.

```json
[
  {
    "id": "source-001",
    "text": "And we're supposed to trust those figures after what happened last year?",
    "source_url": "https://example.org/article",
    "expected_implicit": true,
    "expected_conclusion": "Those figures cannot be trusted."
  },
  {
    "id": "source-002",
    "text": "The committee met on Tuesday and approved the updated budget.",
    "expected_implicit": false
  },
  {
    "id": "source-003",
    "text": "Why should we believe the revised estimate after last month's error?"
  }
]
```

The examples above are **fictional formatting examples**, not independently labelled real-world cases. For actual evaluation, prepare your own real-world samples and independent annotations. Fields `expected_implicit` (boolean), `expected_conclusion` (string), `source_url`, and `source_title` are optional. Unlabelled datasets work. The model's generated wording is compared **manually** with `expected_conclusion`; the lab does not claim to score paraphrase equivalence.

## Output

The table shows up to 100 individual examples, with the input, accepted conclusion if any, status (no candidate / NONE / rejected / error / accepted), support-check result, and any reviewer reference. Use **Copy all implied-conclusion results** or **Download predictions JSON** for the complete dataset, exact source offsets, candidate questions, raw local model text and errors.

Only `expected_implicit` supplies a detection reference label. Precision, recall and accuracy are **case-level presence-detection metrics**, not measurements of argument soundness, implied-conclusion semantic quality, manipulation, or author intent. Missing labels do not enter denominators; cases where the model fails are excluded from label metrics and counted separately. A missing eligible question, model returning NONE, and an invalid generated sentence are different outcomes.

The local `Xenova/flan-t5-small` generation model may be downloaded on first use and is cached in Firefox. The optional preceding-premise comparison uses the existing local NLI/JavaScript evidence checks. The model is only invoked for eligible rhetorical questions (up to two per text); this is not a universal enthymeme detector. Input wording and source offsets are unchanged in the lab; as a result, normalise spelling/punctuation in your input corpus if you wish to compare against preprocessed sources.

No selected text is sent to an inference service; first-use model weights may be downloaded from Hugging Face. All uploaded examples, results and reference labels remain in the browser unless you explicitly export them.
