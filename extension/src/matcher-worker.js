import { pipeline, env } from "@huggingface/transformers";
import nspell from "nspell";
import {preprocessText,remapFindings,punctuationHookFindings,
 analysisRangeForOriginal} from "./text-preprocessing.mjs";
import { compilePatternRules, prototypeEntries, matchText } from "./matching-core.mjs";
import { embeddingRows } from "./embedding-rows.mjs";
import { findInconsistencies } from "./consistency.mjs";
import { analyseArguments, argumentFindings } from "./argument-analysis.mjs";
import { createNliScorer } from "./nli-inference.mjs";
import { positiveTechniques, matchPositiveText } from "./positive-matching.mjs";
import { findConcealedPatterns } from "./concealed-matching.mjs";
import { findScrutinyWarnings } from "./scrutiny-signals.mjs";

env.allowLocalModels = false;
env.allowRemoteModels = true;
env.useBrowserCache = true;
env.backends.onnx.wasm.wasmPaths = new URL("./ort/", self.location.href).href;

const MODEL = "Xenova/all-MiniLM-L6-v2";
let inferenceModelPromise;

async function scorePair(premise, hypothesis) {
 // The same tokenised premise/hypothesis scoring is used in the test lab.
 if (!inferenceModelPromise) inferenceModelPromise = createNliScorer()
  .catch(error => {
   console.warn("Local consistency model unavailable:", error);
   return null;
  });
 const score = await inferenceModelPromise;
 return score ? score(premise, hypothesis) : null;
}
let extractor, spellchecker, techniques = [], rules = [], prototypes = [], positivePrototypes = [], initialising;

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
 // Load the packaged dictionary locally. Failure only disables spelling hints.
 const spellingReady = Promise.all(["aff", "dic"].map(async ext => {
  const response = await fetch(new URL("./spell-en-gb." + ext, self.location.href));
  if (!response.ok) throw new Error("Cannot load bundled spelling dictionary");
  return response.text();
 })).then(([aff, dic]) => { spellchecker = nspell({ aff, dic }); })
  .catch(error => console.warn("Local spellcheck unavailable:", error));
 try {
  extractor = await pipeline("feature-extraction", MODEL, { dtype: "q8" });
  const entries = prototypeEntries(techniques);
  const greenEntries = prototypeEntries(positiveTechniques);
  const vectors = await embed([...entries, ...greenEntries].map(entry => entry.text));
  prototypes = entries.map((entry, index) => ({ ...entry, vector: vectors[index] }));
  positivePrototypes = greenEntries.map((entry, index) => ({
   ...entry, vector: vectors[entries.length + index]
  }));
 } catch (error) {
  // Explicit rules remain useful if model download or initialisation fails.
  console.warn("Local model unavailable; using deterministic rules only:", error);
  extractor = null;
  prototypes = [];
  positivePrototypes = [];
 }
 await spellingReady;
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
  // Preserve the original selection and its offsets. Normalisation applies
  // ONLY to the working analysis copy; user-visible spans are mapped back.
  const preprocessing = preprocessText(data.text,{spellchecker});
  const analysedText = preprocessing.analysisText;
  const spellingTechnique = techniques.find(item => item.id === "deliberate_errors");
  const spellingMatches = spellingTechnique ?
   preprocessing.flags.filter(f => f.kind === "spelling_candidate")
    .map(f => ({start:f.analysisStart,end:f.analysisEnd,technique:spellingTechnique,
     kind:"spelling",method:"spellcheck",score:0.5})) : [];
  const vocabularyTechnique = {
   id:"nonstandard_vocabulary",title:"Nonstandard vocabulary: possible bait",
   category:"Attention and memory",
   summary:"Nonstandard wording may attract corrections or frame a subject. Intention is unknown."
  };
  const vocabularyMatches = preprocessing.flags
   .filter(f => f.kind === "nonstandard_vocabulary")
   .map(f => ({start:f.analysisStart,end:f.analysisEnd,
    technique:vocabularyTechnique,kind:"vocabulary",
    method:"curated_vocabulary",score:0.5,
    original:f.original,suggestions:f.suggestions,
    vocabularySignals:f.vocabularySignals}));
  const punctuationMatches = punctuationHookFindings(preprocessing);
  const nearMisses = [];
  const matches = await matchText(analysedText, { techniques, rules, prototypes,
   embed: extractor ? embed : null,
   onNearMiss: signal => nearMisses.push(signal) });
  // Separate green pass: do not let it compete with the established negative
  // technique rankings or suppress blue matches. Relationship analysis comes later.
  const positiveMatches = await matchPositiveText(analysedText, {
   prototypes: positivePrototypes,
   embed: extractor ? embed : null
  });
  const concealedMatches = findConcealedPatterns(analysedText, {
   positiveMatches, negativeMatches: matches
  });
  // Use one memoised local NLI scorer for both red analyses.
  // The same selected text can require many pairwise inferences.
  const cache = new Map();
  const memoScore = (premise, hypothesis) => {
   const key = JSON.stringify([premise, hypothesis]);
   if (!cache.has(key)) cache.set(key, scorePair(premise, hypothesis));
   return cache.get(key);
  };
  const stage = message => self.postMessage({ id: data.id, type: "stage", message });
  let inconsistencies = [], argumentIssues = [], argumentDiagnostics = [];
  try {
   stage("Checking statements for contradictions…");
   inconsistencies = await findInconsistencies(analysedText, memoScore);
   stage("Checking whether conclusions follow from the evidence…");
   const assessed = await analyseArguments(analysedText, memoScore, {
    includeImplicit:true,
    includeModelDiscovery:true,
    onDiagnostic: info => argumentDiagnostics.push(info),
    onProgress: ({ completed, total }) => {
     if (total) stage("Checking conclusion " + Math.min(completed + 1, total) +
      " of " + total + "…");
    }
   });
   argumentIssues = argumentFindings(assessed);
  } catch (error) {
   // A broken NLI model cannot erase successful blue, green or turquoise matches.
   console.warn("Local argument analysis unavailable:", error);
  }
  const recognised = [...matches, ...spellingMatches, ...vocabularyMatches, ...punctuationMatches,
   ...positiveMatches, ...concealedMatches, ...inconsistencies, ...argumentIssues];
  const scrutiny = findScrutinyWarnings(analysedText, {
   // Orthographic flags are weak signals, not confirmed techniques.
   findings: [...matches,...positiveMatches,...concealedMatches,
    ...inconsistencies,...argumentIssues],
   nearMisses, argumentDiagnostics,
   preprocessingFlags: preprocessing.flags
  });
  const mapped = remapFindings(preprocessing,[...recognised,...scrutiny]);
  self.postMessage({id:data.id,matches:mapped,
   analysisSignals:preprocessing.signals});

 } catch (error) {
  self.postMessage({ id: data.id, error: String(error?.message || error) });
 }
});
