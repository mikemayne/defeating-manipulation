import { pipeline, env } from "@huggingface/transformers";
import { compilePatternRules, prototypeEntries, matchText } from "./matching-core.mjs";
import { embeddingRows } from "./embedding-rows.mjs";
import { generatedCase, validateSeeds } from "../../evaluation/benchmark-generator.mjs";
import { validateConsistencyCases, generatedConsistencyCase } from "../../evaluation/inconsistency-generator.mjs";
import { findInconsistencies } from "./consistency.mjs";
import { createNliScorer } from "./nli-inference.mjs";
import { positiveTechniques, matchPositiveText } from "./positive-matching.mjs";

env.allowLocalModels = false;
env.allowRemoteModels = true;
env.useBrowserCache = true;
env.backends.onnx.wasm.wasmPaths = new URL("./ort/", self.location.href).href;

const MAX_FAILURE_SAMPLES = 500;
const MAX_EMBED_CACHE = 4000;
const MODEL = "Xenova/all-MiniLM-L6-v2";
let running = false, stopRequested = false;
let extractor, cachedCatalogueKey, prototypes = [], cache = new Map();
let nliScorer;

async function embed(texts) {
 if (!texts.length) return [];
 const result = new Array(texts.length);
 const pending = new Map();
 for (let i = 0; i < texts.length; i++) {
  const text = texts[i];
  if (cache.has(text)) {
   const vector = cache.get(text);
   cache.delete(text);
   cache.set(text, vector);
   result[i] = vector;
  } else {
   if (!pending.has(text)) pending.set(text, []);
   pending.get(text).push(i);
  }
 }
 const missing = [...pending.keys()];
 for (let start = 0; start < missing.length; start += 24) {
  const batch = missing.slice(start, start + 24);
  const tensor = await extractor(batch, { pooling: "mean", normalize: true });
  const vectors = embeddingRows(tensor, batch.length);
  for (let j = 0; j < batch.length; j++) {
   const text = batch[j], vector = vectors[j];
   for (const index of pending.get(text)) result[index] = vector;
   cache.set(text, vector);
   if (cache.size > MAX_EMBED_CACHE) cache.delete(cache.keys().next().value);
  }
 }
 return result;
}
async function initialiseModel(techniques) {
 const key = JSON.stringify(techniques.map(t => [t.id, t.example, t.examples]));
 if (extractor && cachedCatalogueKey === key) return;
 self.postMessage({ type: "stage", message: "Loading local AI model and examples…" });
 if (!extractor) extractor = await pipeline("feature-extraction", MODEL, { dtype: "q8" });
 cache = new Map();
 const entries = prototypeEntries(techniques);
 const vectors = await embed(entries.map(entry => entry.text));
 prototypes = entries.map((entry, i) => ({ ...entry, vector: vectors[i] }));
 cachedCatalogueKey = key;
}

async function initialiseConsistencyModel() {
 if (!nliScorer) {
  nliScorer = await createNliScorer({
   onStatus: message => self.postMessage({ type: "stage", message })
  });
 }
 return nliScorer;
}

async function parseUpload(file) {
 if (!file) throw Error("Choose a JSON or JSONL test file");
 self.postMessage({ type: "stage", message: "Reading the local test file…" });
 const text = await file.text();
 if (file.name.toLowerCase().endsWith(".jsonl")) {
  return text.split(/\r?\n/).filter(line => line.trim()).map((line, i) => {
   try { return JSON.parse(line); }
   catch { throw Error("Invalid JSON on line " + (i + 1)); }
  });
 }
 const parsed = JSON.parse(text);
 return Array.isArray(parsed) ? parsed : parsed.cases;
}
function percentage(n, total) {
 return total ? (100 * n / total) : 0;
}
function buildSummary(data, elapsedMs, cancelled) {
 const total = data.tested;
 return {
  total, requested: data.requested, stopped: cancelled, elapsedSeconds: elapsedMs / 1000,
  casesPerSecond: elapsedMs > 0 ? total / (elapsedMs / 1000) : 0,
  exact: data.exact, incorrect: total - data.exact,
  exactRate: percentage(data.exact, total),
  precision: percentage(data.tp, data.tp + data.fp),
  recall: percentage(data.tp, data.tp + data.fn),
  negativeCount: data.negativeCount,
  falsePositiveNegatives: data.falsePositiveNegatives,
  negativeFalsePositiveRate: percentage(data.falsePositiveNegatives, data.negativeCount),
  truePositives: data.tp, falsePositives: data.fp, falseNegatives: data.fn,
  confusion: Object.entries(data.confusion).sort((a, b) => b[1] - a[1])
   .map(([pair, count]) => ({ pair, count })),
  perTechnique: Object.entries(data.perTechnique).sort((a,b) => b[1].missed - a[1].missed)
   .map(([id, metric]) => ({ id, ...metric })),
  failureSamples: data.failures, capturedFailures: data.failures.length
 };
}
async function startRun(message) {
 if (running) return;
 running = true;
 stopRequested = false;
 const begin = performance.now(), id = message.runId;
 try {
  const { catalogue, patterns, fixture, source, mode, amount, seed } = message;
  const consistency = mode === "consistency";
  const positive = mode === "positive_rules" || mode === "positive_ai";
  if (!["rules", "ai", "consistency", "positive_rules", "positive_ai"].includes(mode))
   throw Error("Unknown matcher mode");
  const techniques = positive ? positiveTechniques : (catalogue.techniques || []);
  const rawSeeds = source === "uploaded" ? await parseUpload(message.file) : fixture.cases;
  const seeds = consistency ? validateConsistencyCases(rawSeeds) :
   validateSeeds(rawSeeds, techniques.map(t => t.id));
  const total = source === "uploaded" ? seeds.length : Math.floor(Number(amount));
  const limit = consistency ? 10000 : 1000000;
  if (!Number.isSafeInteger(total) || total < 1 || total > limit)
   throw Error("Choose between 1 and " + limit.toLocaleString("en-GB") + " tests");
  const rules = consistency ? [] : positive ? null : compilePatternRules(catalogue, patterns);
  if (consistency) await initialiseConsistencyModel();
  else if (mode === "ai" || mode === "positive_ai") await initialiseModel(techniques);
  else self.postMessage({ type: "stage", message: "Running deterministic pattern tests…" });

  const data = { tested: 0, requested: total, exact: 0, tp: 0, fp: 0, fn: 0,
   negativeCount: 0, falsePositiveNegatives: 0, confusion: {}, perTechnique: {}, failures: [] };
  let lastUpdate = 0;
  for (let i = 0; i < total; i++) {
   if (stopRequested) break;
   const item = source === "uploaded" ? seeds[i] :
    consistency ? generatedConsistencyCase(seeds, i, Number(seed) || 2026) :
    generatedCase(seeds, i, Number(seed) || 2026);
   const matches = consistency ?
    await findInconsistencies(item.text, nliScorer) :
    positive ? await matchPositiveText(item.text, {
     prototypes: mode === "positive_ai" ? prototypes : [],
     embed: mode === "positive_ai" ? embed : null
    }) :
    await matchText(item.text, {
     techniques, rules, prototypes: mode === "ai" ? prototypes : [],
     embed: mode === "ai" ? embed : null
    });
   for (const match of matches) {
    if (match.start < 0 || match.end > item.text.length || match.start >= match.end)
     throw Error("Invalid match offsets in " + item.id);
   }
   const expected = [...new Set(item.expected)].sort();
   const predicted = [...new Set(matches.map(match => match.technique.id))].sort();
   const expectedSet = new Set(expected), predictedSet = new Set(predicted);
   const missing = expected.filter(value => !predictedSet.has(value));
   const extra = predicted.filter(value => !expectedSet.has(value));
   data.tested++;
   data.tp += expected.length - missing.length;
   data.fn += missing.length;
   data.fp += extra.length;
   if (!expected.length) {
    data.negativeCount++;
    if (predicted.length) data.falsePositiveNegatives++;
   }
   for (const label of expected) {
    const metric = data.perTechnique[label] ||= { expected: 0, detected: 0, missed: 0, falsePositives: 0 };
    metric.expected++;
    if (predictedSet.has(label)) metric.detected++;
    else metric.missed++;
   }
   for (const label of extra) {
    const metric = data.perTechnique[label] ||= { expected: 0, detected: 0, missed: 0, falsePositives: 0 };
    metric.falsePositives++;
   }
   if (!extra.length && !missing.length) data.exact++;
   else {
    const confusion = (expected.join(", ") || "(none)") + " → " + (predicted.join(", ") || "(none)");
    data.confusion[confusion] = (data.confusion[confusion] || 0) + 1;
    if (data.failures.length < MAX_FAILURE_SAMPLES) data.failures.push({
     id: item.id, text: item.text, expected, predicted, missing, extra,
     detectedPairs: consistency ? matches.filter(match => match.kind === "inconsistency")
      .map(match => ({
       text: item.text.slice(match.start, match.end),
       otherText: match.otherText, score: Number(match.score.toFixed(3))
      })) : []
    });
   }
   const now = performance.now();
   if (now - lastUpdate > 220 || i === total - 1) {
    self.postMessage({ type: "progress", runId: id, completed: data.tested, total });
    lastUpdate = now;
    // Yield periodically to receive a Stop command and keep progress responsive.
    await new Promise(resolve => setTimeout(resolve, 0));
   }
  }
  self.postMessage({ type: "done", runId: id,
   mode, source, result: buildSummary(data, performance.now() - begin, stopRequested) });
 } catch (error) {
  self.postMessage({ type: "error", runId: id, message: String(error?.message || error) });
 } finally {
  running = false;
  stopRequested = false;
 }
}
self.addEventListener("message", event => {
 if (event.data?.type === "stop") stopRequested = true;
 else if (event.data?.type === "start") void startRun(event.data);
});
