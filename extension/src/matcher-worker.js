import { pipeline, env } from "@huggingface/transformers";
import { compilePatternRules, prototypeEntries, matchText } from "./matching-core.mjs";
import { embeddingRows } from "./embedding-rows.mjs";

env.allowLocalModels = false;
env.allowRemoteModels = true;
env.useBrowserCache = true;
env.backends.onnx.wasm.wasmPaths = new URL("./ort/", self.location.href).href;

const MODEL = "Xenova/all-MiniLM-L6-v2";
let extractor, techniques = [], rules = [], prototypes = [], initialising;

async function embed(texts) {
 const output = await extractor(texts, { pooling: "mean", normalize: true });
 return embeddingRows(output, texts.length);
}

async function initialise(catalogue, patternCatalogue) {
 techniques = catalogue.techniques || [];
 rules = compilePatternRules(catalogue, patternCatalogue);
 extractor = await pipeline("feature-extraction", MODEL, { dtype: "q8" });
 const entries = prototypeEntries(techniques);
 const vectors = await embed(entries.map(entry => entry.text));
 prototypes = entries.map((entry, index) => ({ ...entry, vector: vectors[index] }));
 self.postMessage({ type: "ready" });
}

self.addEventListener("message", async event => {
 const data = event.data;
 if (data.type === "init") {
  if (!initialising) initialising = initialise(data.catalogue, data.patterns)
   .catch(error => self.postMessage({ type: "fatal", error: String(error?.message || error) }));
  return;
 }
 if (data.type !== "match") return;
 try {
  await initialising;
  const matches = await matchText(data.text, { techniques, rules, prototypes, embed });
  self.postMessage({ id: data.id, matches });
 } catch (error) {
  self.postMessage({ id: data.id, error: String(error?.message || error) });
 }
});
