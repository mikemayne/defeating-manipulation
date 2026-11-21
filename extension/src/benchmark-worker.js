import { pipeline, env } from "@huggingface/transformers";
import { compilePatternRules, prototypeEntries, matchText } from "./matching-core.mjs";
import { embeddingRows } from "./embedding-rows.mjs";
import { generatedCase, validateSeeds } from "../../evaluation/benchmark-generator.mjs";
import { validateConsistencyCases, generatedConsistencyCase } from "../../evaluation/inconsistency-generator.mjs";
import { findInconsistencies } from "./consistency.mjs";
import { createNliScorer } from "./nli-inference.mjs";
import { analyseArguments, combineArgumentEvidence } from "./argument-analysis.mjs";
import { extractArgumentStatements } from "./argument-clauses.mjs";
import { findImplicitConclusionQuestions, reconstructImplicitConclusions,
 checkImpliedConclusions } from "./implicit-conclusion-reconstruction.mjs";
import { generateImpliedConclusion } from "./implicit-conclusion-model.mjs";
import { validateImplicitConclusionCases,
 summarizeImplicitConclusionCases } from "./implicit-conclusion-lab.mjs";
import { scoreReaderInterpretations, validateReaderCases } from "./reader-interpretation.mjs";
import { rankBoundaryChoices } from "./reader-boundary-scorer.mjs";
import { createBoundaryLanguageScorer } from "./reader-language-model.mjs";
import {fitJoinThresholds,validateJoinThresholds} from "./reader-join-thresholds.mjs";
import { compareReaderStrategies,validateStrategyCases,summarizeStrategyComparison } from "./reader-strategy-comparison.mjs";
import { validateArgumentParagraphCases, inspectArgumentStructure } from "../../evaluation/argument-structure-evaluator.mjs";
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
let nliScorer;
let boundaryLanguageScorer;

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
  failureSamples: data.failures, capturedFailures: data.failures.length,
  paragraphStages: data.paragraphStages,
  unlabelledScan: data.unlabelledScan,
  predictions: data.unlabelledScan || data.readerMode || data.boundaryMode || data.compareMode ? data.predictions : null,
  predictionCounts: data.unlabelledScan ? data.predictionCounts : null,
  readerMode: data.readerMode, readerCounts: data.readerMode ? data.readerCounts : null,
  readerPairs: data.readerMode ? data.readerPairs : null,
  readerCasesWithPairs: data.readerMode ? data.readerCasesWithPairs : null,
  readerExistingParserCases: data.readerMode ? data.readerExistingParserCases : null,
  boundaryMode:data.boundaryMode,
  boundaryCounts:data.boundaryMode?data.boundaryCounts:null,
  boundaryPairs:data.boundaryMode?data.boundaryPairs:null,
  boundaryCasesWithPairs:data.boundaryMode?data.boundaryCasesWithPairs:null,
  compareMode:data.compareMode,
  strategyComparison:data.compareMode?summarizeStrategyComparison(data.predictions):null,
  joinThresholds:data.boundaryMode||data.compareMode?data.joinThresholds:null,
  joinThresholdFit:data.boundaryMode||data.compareMode?fitJoinThresholds(data.predictions):null
 };
}
// Unlabelled examples expose predictions only. Optional reviewer labels are
// scored at case level; generated interpretations are never treated as truth.
async function runImplicitConclusionLab(message,begin){
 const seeds=validateImplicitConclusionCases(await parseUpload(message.file));
 const total=seeds.length,predictions=[];
 let announcedModel=false;
 for(let i=0;i<total;i++){
  if(stopRequested)break;
  const item=seeds[i],statements=extractArgumentStatements(item.text);
  const candidates=findImplicitConclusionQuestions(item.text,statements);
  if(candidates.length&&!announcedModel){
   announcedModel=true;
   self.postMessage({type:"stage",
    message:"Loading local FLAN-T5 conclusion model (first run may download weights)…"});
  }
  const attempts=[];
  const proposals=await reconstructImplicitConclusions(
   item.text,statements,generateImpliedConclusion,{
    onAttempt:detail=>attempts.push(detail)
   });
  const checked=await checkImpliedConclusions(proposals,async(premise,conclusion)=>{
   const score=await initialiseConsistencyModel();
   const result=await score(premise,conclusion);
   return combineArgumentEvidence([
    {kind:"combined",text:premise,forward:result,reverse:null}
   ],conclusion);
  });
  predictions.push({
   id:item.id,text:item.text,source_url:item.source_url||null,
   source_title:item.source_title||null,
   expected_implicit:typeof item.expected_implicit==='boolean'?
    item.expected_implicit:null,
   expected_conclusion:item.expected_conclusion||null,
   predicted_implicit:checked.length>0,
   candidates:candidates.map(c=>({
    question:c.question.text,start:c.question.start,end:c.question.end,
    context:c.context?.text||null
   })),
   attempts,
   conclusions:checked.map(c=>({
    question:c.original,start:c.start,end:c.end,
    impliedConclusion:c.impliedConclusion,
    context:c.context?.text||null,
    supportStatus:c.supportStatus,
    provisional:true
   }))
  });
  self.postMessage({type:"progress",runId:message.runId,
   completed:predictions.length,total});
  // Yield so a stop request can be delivered even for skipped cases.
  await new Promise(resolve=>setTimeout(resolve,0));
 }
 self.postMessage({type:"done",runId:message.runId,
  mode:message.mode,source:message.source,result:{
   implicitMode:true,total:predictions.length,requested:total,
   stopped:stopRequested,elapsedSeconds:(performance.now()-begin)/1000,
   summary:summarizeImplicitConclusionCases(predictions),
   predictions
  }});
}

async function startRun(message) {
 if (running) return;
 running = true;
 stopRequested = false;
 const begin = performance.now(), id = message.runId;
 try {
  const { catalogue, patterns, fixture, source, mode, amount, seed } = message;
  if(mode==="implicit_conclusion"){
   if(source!=="uploaded")throw Error("Implicit-conclusion tests require a JSON/JSONL upload");
   await runImplicitConclusionLab(message,begin);
   return;
  }
  const joinThresholds=validateJoinThresholds(message.joinThresholds);
  const consistency = mode === "consistency";
  const argumentMode = mode === "argument_paragraph";
  const readerMode = mode === "reader_inference";
  const boundaryMode = mode === "reader_boundary";
  const compareMode = mode === "reader_compare";
  const positive = mode === "positive_rules" || mode === "positive_ai";
  const concealed = mode === "concealed_rules" || mode === "concealed_ai";
  if (!["rules", "ai", "consistency", "argument_paragraph", "reader_inference", "reader_boundary", "reader_compare", "positive_rules", "positive_ai",
   "concealed_rules", "concealed_ai"].includes(mode))
   throw Error("Unknown matcher mode");
  const techniques = positive ? positiveTechniques : (catalogue.techniques || []);
  if ((argumentMode || readerMode || boundaryMode || compareMode) && source !== "uploaded")
   throw Error("Argument and reader-interpretation tests require a local JSON/JSONL upload");
  const rawSeeds = source === "uploaded" ? await parseUpload(message.file) : fixture.cases;
  const ids = concealed ? concealedPatterns.map(pattern => pattern.id) :
   techniques.map(t => t.id);
  const seeds = compareMode ? validateStrategyCases(rawSeeds) : (readerMode || boundaryMode) ? validateReaderCases(rawSeeds) :
   argumentMode ? validateArgumentParagraphCases(rawSeeds) :
   consistency ? validateConsistencyCases(rawSeeds) : validateSeeds(rawSeeds, ids);
  const total = source === "uploaded" ? seeds.length : Math.floor(Number(amount));
  const unlabelledScan = argumentMode &&
   seeds.every(item => !Object.hasOwn(item,"expected_argument"));
  const limit = consistency || argumentMode || readerMode || boundaryMode || compareMode || concealed ? 10000 : 1000000;
  if (!Number.isSafeInteger(total) || total < 1 || total > limit)
   throw Error("Choose between 1 and " + limit.toLocaleString("en-GB") + " tests");
  const rules = consistency || argumentMode || positive ? [] : compilePatternRules(catalogue, patterns);
  // Structural-only files do not load the NLI model. A labelled 'expected'
  // field, including [], explicitly opts that row into reasoning evaluation.
  const needsNli = argumentMode &&
   seeds.some(item => Object.hasOwn(item, "expected") || item.analyse_reasoning === true);
  if (boundaryMode || compareMode){
   if(!boundaryLanguageScorer)
    boundaryLanguageScorer=await createBoundaryLanguageScorer({
     onStatus:message=>self.postMessage({type:"stage",message})
    });
  }
  else if (consistency || needsNli || readerMode) await initialiseConsistencyModel();
  else if (argumentMode) self.postMessage({type:"stage",
   message:"Checking argument structure locally (no AI download)…"});
  else if (mode === "concealed_ai") await initialiseConcealedModel(techniques);
  else if (mode === "ai" || mode === "positive_ai") await initialiseModel(techniques);
  else self.postMessage({ type: "stage",
   message: concealed ? "Running local relationship-rule tests…" :
    "Running deterministic pattern tests…" });

  const data = { tested: 0, requested: total, exact: 0, tp: 0, fp: 0, fn: 0,
   negativeCount: 0, falsePositiveNegatives: 0, confusion: {}, perTechnique: {},
   realTracks: {}, failures: [],
   paragraphStages: argumentMode && !unlabelledScan ? { structure:{total:0,exact:0},
    reasoning:{total:0,exact:0} } : null,
   unlabelledScan, readerMode, boundaryMode, compareMode, joinThresholds, predictions: [], predictionCounts: {},
   readerCounts:{}, readerPairs:0, readerCasesWithPairs:0,
   readerExistingParserCases:0,
   boundaryCounts:{}, boundaryPairs:0, boundaryCasesWithPairs:0 };
  let lastUpdate = 0;
  for (let i = 0; i < total; i++) {
   if (stopRequested) break;
   const item = source === "uploaded" ? seeds[i] :
    consistency ? generatedConsistencyCase(seeds, i, Number(seed) || 2026) :
    concealed ? generatedConcealedCase(seeds, i, Number(seed) || 2026) :
    generatedCase(seeds, i, Number(seed) || 2026);
   let matches, argumentAssessments = [], argumentDiagnostics = [], structureCheck = null;
   if(compareMode){
    const comparisons=await compareReaderStrategies(item.text,boundaryLanguageScorer,joinThresholds);
    const modelCalls=comparisons.length?comparisons.at(-1).neuralCallsForCase:0;
    data.predictions.push({
     id:item.id,text:item.text,
     expected_boundaries:item.expected_boundaries||[],
     source_url:item.source_url||null,
     boundaries:comparisons,modelCalls
    });
    data.tested++;
    const now=performance.now();
    if(now-lastUpdate>220 || i===total-1){
     self.postMessage({type:"progress",runId:id,completed:data.tested,total});
     lastUpdate=now;
     await new Promise(resolve=>setTimeout(resolve,0));
    }
    continue;
   }
   if(boundaryMode){
    const boundaries=await rankBoundaryChoices(item.text,boundaryLanguageScorer,joinThresholds);
    data.boundaryPairs+=boundaries.length;
    if(boundaries.length)data.boundaryCasesWithPairs++;
    for(const b of boundaries)
     data.boundaryCounts[b.uncertain?"uncertain (kept original)":b.choice]=
      (data.boundaryCounts[b.uncertain?"uncertain (kept original)":b.choice]||0)+1;
    data.predictions.push({
     id:item.id,text:item.text,
     expected_boundaries:item.expected_boundaries||[],
     source_url:item.source_url||null,
     source_annotation:item.source_annotation||null,
     boundaries
    });
    data.tested++;
    const now=performance.now();
    if(now-lastUpdate>220||i===total-1){
     self.postMessage({type:"progress",runId:id,completed:data.tested,total});
     lastUpdate=now;
     await new Promise(resolve=>setTimeout(resolve,0));
    }
    continue;
   }
   if (readerMode) {
    // Reader interpretation is independent of argument truth and red findings.
    // Every test case is stored with exact original spans and uncalibrated
    // scores. The corpus itself is never committed or sent to a server.
    const baseline=inspectArgumentStructure(item).hypotheses;
    if(baseline.length)data.readerExistingParserCases++;
    const interpreted=await scoreReaderInterpretations(item.text,nliScorer);
    data.readerPairs+=interpreted.length;
    if(interpreted.length)data.readerCasesWithPairs++;
    for(const relation of interpreted)
     data.readerCounts[relation.interpretation]=(data.readerCounts[relation.interpretation]||0)+1;
    data.predictions.push({
     id:item.id,text:item.text,
     source_url:item.source_url||null,
     source_annotation:item.source_annotation||null,
     interpretations:interpreted,
     existing_rule_arguments:baseline.map(h=>({
      conclusion:h.sourceConclusion,start:h.start,end:h.end,marker:h.marker
     }))
    });
    data.tested++;
    const now=performance.now();
    if(now-lastUpdate>220 || i===total-1){
     self.postMessage({type:"progress",runId:id,completed:data.tested,total});
     lastUpdate=now;
     await new Promise(resolve=>setTimeout(resolve,0));
    }
    continue;
   }
   if (argumentMode) {
    structureCheck = inspectArgumentStructure(item);
    matches = structureCheck.predicted.map(label => ({
     start:0, end:item.text.length, technique:{id:label}, kind:"structure_check"
    }));
    if (Object.hasOwn(item, "expected") || item.analyse_reasoning === true) {
     argumentAssessments = await analyseArguments(item.text, nliScorer, {
      includeImplicit:unlabelledScan,
      includeModelDiscovery:unlabelledScan,
      // The synchronous structure pass cannot call a neural model.
      // Extend its provisional hypotheses only when the AI pass proposes
      // a source-exact candidate. Scored benchmarks never enter this path.
      onCandidate: candidate => {
       const h = {
        sourceConclusion:candidate.conclusion.text,
        modelConclusion:candidate.conclusion.text,
        start:candidate.conclusion.start,
        end:candidate.conclusion.end,
        marker:candidate.conclusion.marker,
        inferred:true, inferredConnector:candidate.inferredConnector,
        analysisText:candidate.analysisText,
        reconstructionMethod:candidate.reconstructionMethod,
        relationScore:candidate.relationScore
       };
       if(item.text.slice(h.start,h.end)!==h.sourceConclusion)
        throw Error("AI candidate lost original source offsets");
       if(!structureCheck.hypotheses.some(x=>
         x.start===h.start && x.end===h.end))
        structureCheck.hypotheses.push(h);
      },
      onDiagnostic: diagnostic => argumentDiagnostics.push(diagnostic)
     });
     // This is only a benchmark classification; supported conclusions are
     // never converted to a red underline in the actual Firefox extension.
     matches.push(...argumentAssessments.map(assessment => ({
      start: assessment.conclusion.start, end: assessment.conclusion.end,
      technique: { id: assessment.label }, kind: "argument_assessment"
     })));
    }
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
   if (unlabelledScan) {
    const labels = [...new Set(argumentAssessments.map(a=>a.label))].sort();
    const extracted = structureCheck.hypotheses.map(h=>({
     sourceConclusion:h.sourceConclusion, modelConclusion:h.modelConclusion,
     start:h.start,end:h.end,marker:h.marker,
     inferred:h.inferred||false,
     inferredConnector:h.inferredConnector||null,
     analysisText:h.analysisText||null,
     reconstructionMethod:h.reconstructionMethod||null,
     relationScore:h.relationScore??null
    }));
    const key=labels.join(", ") || (extracted.length ? "(no reasoning label)" : "(no extracted argument)");
    data.predictionCounts[key]=(data.predictionCounts[key]||0)+1;
    data.predictions.push({
     id:item.id, text:item.text, source_url:item.source_url||null,
     source_annotation:item.source_annotation||null,
     extracted_arguments:extracted, predicted_labels:labels,
     assessments:argumentAssessments.map(a=>({
      label:a.label,premise:a.premise,conclusion:a.conclusion.text,
      score:a.score,basis:a.basis,reason:a.reason||null
     })),
     diagnostics:argumentDiagnostics
    });
    data.tested++;
    const now=performance.now();
    if(now-lastUpdate>220 || i===total-1){
     self.postMessage({type:"progress",runId:id,completed:data.tested,total});
     lastUpdate=now;
     await new Promise(resolve=>setTimeout(resolve,0));
    }
    continue;
   }
   const expected = [...new Set(argumentMode
    ? [...structureCheck.expected, ...(item.expected ?? [])] : item.expected)].sort();
   const predicted = [...new Set(matches.map(match => match.technique.id))].sort();
   const expectedSet = new Set(expected), predictedSet = new Set(predicted);
   const missing = expected.filter(value => !predictedSet.has(value));
   if (argumentMode) {
    const equals = (a,b) => a.length===b.length &&
     a.every(label=>b.includes(label));
    const stages = data.paragraphStages;
    stages.structure.total++;
    if (equals(structureCheck.expected, structureCheck.predicted))
     stages.structure.exact++;
    if (Object.hasOwn(item, "expected")) {
     stages.reasoning.total++;
     const modelLabels = [...new Set(argumentAssessments.map(a=>a.label))];
     if (equals(item.expected,modelLabels)) stages.reasoning.exact++;
    }
   }
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
     argumentAssessments: argumentMode ? argumentAssessments.map(assessment => ({
      label: assessment.label, premise: assessment.premise,
      conclusion: assessment.conclusion.text,
      inferenceMarker: assessment.conclusion.marker,
      score: Number(assessment.score.toFixed(3)),
      decisivePremise: assessment.evidenceText, basis: assessment.basis,
      reason: assessment.reason || null
     })) : [],
     structureCheck: argumentMode ? structureCheck : null,
     argumentDiagnostics: argumentMode ? argumentDiagnostics.map(item => ({
      conclusion: item.conclusion, modelConclusion: item.modelConclusion, verdict: item.verdict,
      inferenceMarker: item.inferenceMarker, inline: item.inline,
      reason: item.reason || null,
      status: item.status || null,
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
