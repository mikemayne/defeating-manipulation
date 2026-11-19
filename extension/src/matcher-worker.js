import { pipeline, env } from "@huggingface/transformers";
import { windows } from "./text-windows.mjs";
env.allowLocalModels = false;
env.allowRemoteModels = true;
env.useBrowserCache = true;

// Load ONNX Runtime JS/WASM companions from this extension, not the CDN.
env.backends.onnx.wasm.wasmPaths = new URL("./ort/", self.location.href).href;

const MODEL = "Xenova/all-MiniLM-L6-v2";
const MATCH_THRESHOLD = 0.43;
let extractor, techniques = [], prototypes = [], compiledPatterns = [], initialising;

const dot = (a, b) => {
 let sum = 0, na = 0, nb = 0;
 for (let i = 0; i < a.length; i++) {
  sum += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i];
 }
 return sum / (Math.sqrt(na) * Math.sqrt(nb) || 1);
};

async function embed(texts) {
 const output = await extractor(texts, { pooling: "mean", normalize: true });
 return Array.from({ length: texts.length }, (_, i) => Array.from(output[i].data));
}

function prototypeTexts(t) {
 // Match against examples of the technique, not prose explaining how to recognise it.
 // Otherwise definitions and chapter descriptions can be mistaken for real instances.
 return [...new Set([t.example, ...(t.examples || [])]
  .filter(x => typeof x === "string" && x.trim()).map(x => x.trim()))];
}

async function initialise(catalogue, patternCatalogue) {
 techniques = catalogue.techniques || [];
 const byId = new Map(techniques.map(t => [t.id, t]));
 compiledPatterns = (patternCatalogue.patterns || []).flatMap(rule => {
  const technique = byId.get(rule.id);
  if (!technique) return [];
  return (rule.expressions || []).flatMap(expression => {
   try { return [{ technique, regex: new RegExp(expression, "i") }]; }
   catch (error) { console.warn("Invalid pattern expression:", rule.id, expression, error); return []; }
  });
 });

 extractor = await pipeline("feature-extraction", MODEL, { dtype: "q8" });
 const entries = techniques.flatMap((technique, index) =>
  prototypeTexts(technique).map(text => ({ techniqueIndex: index, text })));
 const vectors = await embed(entries.map(x => x.text));
 prototypes = entries.map((entry, index) => ({ ...entry, vector: vectors[index] }));
 self.postMessage({ type: "ready" });
}


function deterministicMatches(part) {
 const found = [];
 for (const rule of compiledPatterns) {
  if (rule.regex.test(part.text)) {
   found.push({ ...part, technique: rule.technique, score: 1, method: "pattern" });
  }
 }
 return found;
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
  const parts = windows(data.text);
  if (!parts.length) { self.postMessage({ id: data.id, matches: [] }); return; }

  // Explicit phrase/structure rules catch known constructions reliably.
  const patterned = parts.flatMap(deterministicMatches);
  const embedded = await embed(parts.map(p => p.text));
  const semantic = [];
  for (let i = 0; i < parts.length; i++) {
   // A semantic match must not duplicate or override a deterministic match.
   if (patterned.some(m => m.start < parts[i].end && m.end > parts[i].start)) continue;
   let best = -1, score = -1;
   for (const prototype of prototypes) {
    const value = dot(embedded[i], prototype.vector);
    if (value > score) { score = value; best = prototype.techniqueIndex; }
   }
   if (score >= MATCH_THRESHOLD) {
    semantic.push({ ...parts[i], technique: techniques[best], score, method: "semantic" });
   }
  }

  // Prefer exact pattern matches where spans overlap.
  const found = [...patterned, ...semantic].sort((a, b) =>
   (a.method === "pattern" ? 0 : 1) - (b.method === "pattern" ? 0 : 1) || b.score - a.score);
  const selected = [];
  for (const match of found) {
   if (!selected.some(x => match.start < x.end && match.end > x.start)) selected.push(match);
  }
  self.postMessage({ id: data.id, matches: selected });
 } catch (error) {
  self.postMessage({ id: data.id, error: String(error?.message || error) });
 }
});
