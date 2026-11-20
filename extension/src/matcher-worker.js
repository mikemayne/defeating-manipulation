import { pipeline, env } from "@huggingface/transformers";
import { compilePatternRules, prototypeEntries, matchText } from "./matching-core.mjs";
import { embeddingRows } from "./embedding-rows.mjs";
import { findInconsistencies } from "./consistency.mjs";

env.allowLocalModels = false;
env.allowRemoteModels = true;
env.useBrowserCache = true;
env.backends.onnx.wasm.wasmPaths = new URL("./ort/", self.location.href).href;

const MODEL = "Xenova/all-MiniLM-L6-v2";
const NLI_MODEL = "Xenova/distilbert-base-uncased-mnli";
let inferenceModel, inferenceAttempted = false;

async function scorePair(premise, hypothesis) {
 if (!inferenceAttempted) {
  inferenceAttempted = true;
  try { inferenceModel = await pipeline("text-classification", NLI_MODEL, { dtype: "q8" }); }
  catch (error) { console.warn("Local consistency model unavailable:", error); }
 }
 if (!inferenceModel) return null;
 const result = await inferenceModel({ text: premise, text_pair: hypothesis }, { top_k: null });
 const scores = {};
 for (const item of (Array.isArray(result[0]) ? result[0] : result)) {
  const label = String(item.label).toLowerCase();
  if (label.includes("contradiction") || label === "label_0") scores.contradiction = item.score;
  if (label.includes("neutral") || label === "label_1") scores.neutral = item.score;
  if (label.includes("entailment") || label === "label_2") scores.entailment = item.score;
 }
 return scores.contradiction === undefined || scores.neutral === undefined ? null : scores;
}
let extractor, techniques = [], rules = [], prototypes = [], initialising;

async function embed(texts) {
 const result = [];
 // Batching avoids a large selection exhausting the local inference runtime.
 for (let i = 0; i < texts.length; i += 24) {
  const batch = texts.slice(i, i + 24);
  const output = await extractor(batch, { pooling: "mean", normalize: true });
  result.push(...embeddingRows(output, batch.length));
 }
 return result;
}

async function initialise(catalogue, patternCatalogue) {
 techniques = catalogue.techniques || [];
 rules = compilePatternRules(catalogue, patternCatalogue);
 try {
  extractor = await pipeline("feature-extraction", MODEL, { dtype: "q8" });
  const entries = prototypeEntries(techniques);
  const vectors = await embed(entries.map(entry => entry.text));
  prototypes = entries.map((entry, index) => ({ ...entry, vector: vectors[index] }));
 } catch (error) {
  // Explicit rules remain useful if model download or initialisation fails.
  console.warn("Local model unavailable; using deterministic rules only:", error);
  extractor = null;
  prototypes = [];
 }
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
  const matches = await matchText(data.text, { techniques, rules, prototypes,
   embed: extractor ? embed : null });
  // The two analyses share the same selection and return one result set.
  // A missing NLI model never prevents ordinary pattern highlighting.
  let inconsistencies = [];
  try { inconsistencies = await findInconsistencies(data.text, scorePair); }
  catch (error) { console.warn("Consistency analysis unavailable:", error); }
  self.postMessage({ id: data.id, matches: [...matches, ...inconsistencies] });
 } catch (error) {
  self.postMessage({ id: data.id, error: String(error?.message || error) });
 }
});
