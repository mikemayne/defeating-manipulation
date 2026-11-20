import { pipeline, env } from "@huggingface/transformers";
import { compilePatternRules, prototypeEntries, matchText } from "./matching-core.mjs";
import { embeddingRows } from "./embedding-rows.mjs";
import { generatedCase, validateSeeds } from "../../evaluation/benchmark-generator.mjs";
import { validateConsistencyCases, generatedConsistencyCase } from "../../evaluation/inconsistency-generator.mjs";
import { findInconsistencies } from "./consistency.mjs";
import { createNliScorer } from "./nli-inference.mjs";
import { analyseArguments, ARGUMENT_LABELS } from "./argument-analysis.mjs";
import { ARGUMENT_REASONER_MODEL, evaluateArgumentsWithReasoner } from "./argument-reasoner.mjs";
import { validateArgumentCases, generatedArgumentCase } from "../../evaluation/argument-generator.mjs";
import { positiveTechniques, matchPositiveText } from "./positive-matching.mjs";
import { concealedPatterns, findConcealedPatterns } from "./concealed-matching.mjs";
import { generatedConcealedCase } from "../../evaluation/concealed-generator.mjs";

env.allowLocalModels = false;
env.allowRemoteModels = true;
env.useBrowserCache = true;
env.backends.onnx.wasm.wasmPaths = new URL("./ort/", self.location.href).href;

const MAX_FAILURE_SAMPLES = 500;
const MAX_EMBED_CACHE = 4000;
const MODEL = "Xenova/all-MiniLM-L6-v2";
let running = false, stopRequested = false;
let extractor, cachedCatalogueKey, prototypes = [], positivePrototypes = [], cache = new Map();
let nliScorer, argumentGenerator;

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

async function initialiseConcealedModel(negativeTechniques) {
 await initialiseModel(negativeTechniques);
 self.postMessage({ type: "stage", message: "Loading positive-pattern examples for relation analysis…" });
 const entries = prototypeEntries(positiveTechniques);
 const vectors = await embed(entries.map(entry => entry.text));
 positivePrototypes = entries.map((entry, index) => ({
  ...entry, vector: vectors[index]
 }));
}

async function initialiseConsistencyModel() {
 if (!nliScorer) {
  nliScorer = await createNliScorer({
   onStatus: message => self.postMessage({ type: "stage", message })
  });
 }
 return nliScorer;
}

async function initialiseArgumentReasoner() {
 if (argumentGenerator) return argumentGenerator;
 self.postMessage({ type:"stage",
  message:"Loading the optional local argument reasoning model (larger download; no cloud inference)…" });
 // A separate, explicitly opted-in model. Try browser GPU first;
 // use quantized WASM CPU only when GPU initialization is unavailable.
 try {
  argumentGenerator = await pipeline("text-generation", ARGUMENT_REASONER_MODEL,
   { dtype:"q4", device:"webgpu" });
 } catch (error) {
  console.warn("WebGPU argument model unavailable; attempting CPU:", error);
  self.postMessage({ type:"stage",
   message:"WebGPU unavailable; loading quantized local CPU reasoning model…" });
  argumentGenerator = await pipeline("text-generation", ARGUMENT_REASONER_MODEL,
   { dtype:"q8", device:"wasm" });
 }
 return argumentGenerator;
}
async function generateReasoning(messages) {
 const generator = await initialiseArgumentReasoner();
 const result = await generator(messages, {
  max_new_tokens: 125, do_sample: false, return_full_text: false
 });
 const generated = result?.[0]?.generated_text;
 if (typeof generated === "string") return generated;
 if (Array.isArray(generated)) return String(generated.at(-1)?.content || "");
 return String(generated?.content || "");
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
  realTracks: Object.entries(data.realTracks).map(([track, metrics]) => ({
   track, total: metrics.total, exact: metrics.exact,
   exactRate: percentage(metrics.exact, metrics.total),
   precision: percentage(metrics.tp, metrics.tp + metrics.fp),
   recall: percentage(metrics.tp, metrics.tp + metrics.fn)
  })),
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
  const argumentReasoning = mode === "argument_reasoning";
  const argumentMode = mode === "argument_support" || argumentReasoning;
  const positive = mode === "positive_rules" || mode === "positive_ai";
  const concealed = mode === "concealed_rules" || mode === "concealed_ai";
  if (!["rules", "ai", "consistency", "argument_support", "argument_reasoning", "positive_rules", "positive_ai",
   "concealed_rules", "concealed_ai"].includes(mode))
   throw Error("Unknown matcher mode");
  const techniques = positive ? positiveTechniques : (catalogue.techniques || []);
  const rawSeeds = source === "uploaded" ? await parseUpload(message.file) : fixture.cases;
  const ids = concealed ? concealedPatterns.map(pattern => pattern.id) :
   techniques.map(t => t.id);
  const seeds = argumentMode ? validateArgumentCases(rawSeeds) :
   consistency ? validateConsistencyCases(rawSeeds) : validateSeeds(rawSeeds, ids);
  const total = source === "uploaded" ? seeds.length : Math.floor(Number(amount));
  const limit = consistency || argumentMode || concealed ? 10000 : 1000000;
  if (!Number.isSafeInteger(total) || total < 1 || total > limit)
   throw Error("Choose between 1 and " + limit.toLocaleString("en-GB") + " tests");
  const rules = consistency || argumentMode || positive ? [] : compilePatternRules(catalogue, patterns);
  if (argumentReasoning) await initialiseArgumentReasoner();
  else if (consistency || argumentMode) await initialiseConsistencyModel();
  else if (mode === "concealed_ai") await initialiseConcealedModel(techniques);
  else if (mode === "ai" || mode === "positive_ai") await initialiseModel(techniques);
  else self.postMessage({ type: "stage",
   message: concealed ? "Running local relationship-rule tests…" :
    "Running deterministic pattern tests…" });

  const data = { tested: 0, requested: total, exact: 0, tp: 0, fp: 0, fn: 0,
   negativeCount: 0, falsePositiveNegatives: 0, confusion: {}, perTechnique: {},
   realTracks: {}, failures: [] };
  let lastUpdate = 0;
  for (let i = 0; i < total; i++) {
   if (stopRequested) break;
   const item = source === "uploaded" ? seeds[i] :
    consistency ? generatedConsistencyCase(seeds, i, Number(seed) || 2026) :
    argumentMode ? generatedArgumentCase(seeds, i, Number(seed) || 2026) :
    concealed ? generatedConcealedCase(seeds, i, Number(seed) || 2026) :
    generatedCase(seeds, i, Number(seed) || 2026);
   let matches, argumentAssessments = [], argumentDiagnostics = [], reasonerAssessments = [];
   if (argumentReasoning) {
    reasonerAssessments = await evaluateArgumentsWithReasoner(item.text, generateReasoning, {
     onProgress: ({ completed, total: argumentTotal }) => {
      if (argumentTotal) self.postMessage({ type:"stage",
       message:"Reasoning about argument " + Math.min(completed + 1, argumentTotal) + "/" + argumentTotal +
        " (" + (i + 1) + "/" + total + " passages)" });
     }
    });
    matches = reasonerAssessments.filter(assessment => assessment.label).map(assessment => ({
     start: assessment.conclusion.start, end: assessment.conclusion.end,
     technique: { id:assessment.label }, kind:"argument_assessment"
    }));
   } else if (argumentMode) {
    argumentAssessments = await analyseArguments(item.text, nliScorer, {
     onDiagnostic: diagnostic => argumentDiagnostics.push(diagnostic)
    });
    // Supported conclusions appear only in this benchmark's classification,
    // not as red highlights in the Firefox extension.
    matches = argumentAssessments.map(assessment => ({
     start: assessment.conclusion.start, end: assessment.conclusion.end,
     technique: { id: assessment.label }, kind: "argument_assessment"
    }));
   } else if (consistency) {
    matches = await findInconsistencies(item.text, nliScorer);
   } else if (concealed) {
    const useAi = mode === "concealed_ai";
    const negatives = await matchText(item.text, {
     techniques, rules, prototypes: useAi ? prototypes : [],
     embed: useAi ? embed : null
    });
    const positives = await matchPositiveText(item.text, {
     prototypes: useAi ? positivePrototypes : [],
     embed: useAi ? embed : null
    });
    matches = findConcealedPatterns(item.text, {
     positiveMatches: positives, negativeMatches: negatives
    });
   } else if (positive) {
    matches = await matchPositiveText(item.text, {
     prototypes: mode === "positive_ai" ? prototypes : [],
     embed: mode === "positive_ai" ? embed : null
    });
   } else {
    matches = await matchText(item.text, {
     techniques, rules, prototypes: mode === "ai" ? prototypes : [],
     embed: mode === "ai" ? embed : null
    });
   }
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
   if (argumentMode && source === "uploaded" &&
       (item.track === "natural" || item.track === "challenge")) {
    const track = data.realTracks[item.track] ||= { total:0, exact:0, tp:0, fp:0, fn:0 };
    track.total++;
    track.tp += expected.length - missing.length;
    track.fp += extra.length;
    track.fn += missing.length;
    if (!missing.length && !extra.length) track.exact++;
   }
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
     sourceUrl: source === "uploaded" ? item.source_url || null : null,
     sourceTitle: source === "uploaded" ? item.source_title || null : null,
     sampleTrack: source === "uploaded" ? item.track || null : null,
     humanRationale: source === "uploaded" ? item.rationale || null : null,
     detectedPairs: consistency ? matches.filter(match => match.kind === "inconsistency")
      .map(match => ({
       text: item.text.slice(match.start, match.end),
       otherText: match.otherText, score: Number(match.score.toFixed(3))
      })) : [],
     concealedLinks: concealed ? matches.map(match => ({
      pattern: match.technique.id, positive: match.positiveText,
      pressure: item.text.slice(match.start, match.end),
      relatedNegative: match.negativePattern
     })) : [],
     reasoningResults: argumentReasoning ? reasonerAssessments.map(assessment => ({
      label: assessment.rawLabel, reason: assessment.reason,
      premise: assessment.premise, conclusion: assessment.conclusion.text,
      marker: assessment.conclusion.marker
     })) : [],
     argumentAssessments: argumentMode && !argumentReasoning ? argumentAssessments.map(assessment => ({
      label: assessment.label, premise: assessment.premise,
      conclusion: assessment.conclusion.text,
      inferenceMarker: assessment.conclusion.marker,
      score: Number(assessment.score.toFixed(3)),
      decisivePremise: assessment.evidenceText, basis: assessment.basis,
      reason: assessment.reason || null
     })) : [],
     argumentDiagnostics: argumentMode && !argumentReasoning ? argumentDiagnostics.map(item => ({
      conclusion: item.conclusion, verdict: item.verdict,
      inferenceMarker: item.inferenceMarker, inline: item.inline,
      reason: item.reason || null,
      comparisons: item.comparisons.map(pair => ({
       kind: pair.kind, premise: pair.premise, repeated: pair.repeated,
       forward: pair.forward, reverse: pair.reverse
      }))
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
