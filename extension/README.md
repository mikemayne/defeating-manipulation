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
