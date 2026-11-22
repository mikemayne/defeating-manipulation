import { pipeline, env } from "@huggingface/transformers";
import nspell from "nspell";
import {preprocessText,remapFindings,punctuationHookFindings,
 analysisRangeForOriginal} from "./text-preprocessing.mjs";
import { compilePatternRules, prototypeEntries, matchText } from "./matching-core.mjs";
import { embeddingRows } from "./embedding-rows.mjs";
import { combineArgumentEvidence } from "./argument-analysis.mjs";
import { extractArgumentStatements } from "./argument-clauses.mjs";
import { findImplicitConclusionQuestions, reconstructImplicitConclusions,
 checkImpliedConclusions, implicitConclusionFindings } from "./implicit-conclusion-reconstruction.mjs";
import { generateImpliedConclusion } from "./implicit-conclusion-model.mjs";
import { createNliScorer } from "./nli-inference.mjs";
import { positiveTechniques, matchPositiveText } from "./positive-matching.mjs";
import { findConcealedPatterns } from "./concealed-matching.mjs";
import { findScrutinyWarnings } from "./scrutiny-signals.mjs";

import { paragraphTopicFindings } from "./paragraph-topic.mjs";

env.allowLocalModels = false;
env.allowRemoteModels = true;
env.useBrowserCache = true;
env.backends.onnx.wasm.wasmPaths = new URL("./ort/", self.location.href).href;

const MODEL = "Xenova/all-MiniLM-L6-v2";
let inferenceModelPromise;
async function scorePair(premise, hypothesis) {
 // Keep the existing pairwise local NLI scorer independent of text generation.
 if (!inferenceModelPromise) inferenceModelPromise = createNliScorer()
  .catch(error => {
   console.warn("Local inference model unavailable:", error);
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
  // The red inconsistency category is paused. Its algorithms remain available
  // in the test lab, but do not run in normal selected-text analysis.
  // Keep NLI lazy: only the optional orange implied-conclusion pass uses it.
  const cache = new Map();
  const memoScore = (premise, hypothesis) => {
   const key = JSON.stringify([premise, hypothesis]);
   if (!cache.has(key)) cache.set(key, scorePair(premise, hypothesis));
   return cache.get(key);
  };
  const stage = message => self.postMessage({ id: data.id, type: "stage", message });
  let implicitFindings = [];
  // Only invoke the optional text-generation model on a bounded number of
  // question-shaped candidates. Its output can only create an orange review
  // cue, never red evidence or a statement about the author's intention.
  // This pass is independent: unavailable weights do not affect other matches.
  try {
   const statements = extractArgumentStatements(analysedText);
   if (findImplicitConclusionQuestions(analysedText, statements).length) {
    stage("Checking for possible implied conclusions…");
    const proposals = await reconstructImplicitConclusions(
     analysedText, statements, generateImpliedConclusion);
    const checked = await checkImpliedConclusions(proposals, async (premise, conclusion) => {
     const scores = await memoScore(premise, conclusion);
     // The check sees only actual preceding evidence, never the rhetorical
     // question whose suggested conclusion is under consideration.
     return combineArgumentEvidence([
      {kind:"combined",text:premise,forward:scores,reverse:null}
     ], conclusion);
    });
    implicitFindings = implicitConclusionFindings(analysedText, checked);
   }
  } catch (error) {
   console.warn("Optional implied-conclusion analysis unavailable:", error);
  }
  const paragraphMatches = await paragraphTopicFindings(analysedText,
   opening => matchText(opening, { techniques, rules, prototypes, embed: extractor ? embed : null }),
   generateImpliedConclusion);
  const recognised = [...paragraphMatches, ...matches, ...spellingMatches, ...vocabularyMatches, ...punctuationMatches,
   ...positiveMatches, ...concealedMatches,
   ...implicitFindings];
  const scrutiny = findScrutinyWarnings(analysedText, {
   // Orthographic flags are weak signals, not confirmed techniques.
   findings: [...matches,...positiveMatches,...concealedMatches,...implicitFindings],
   nearMisses,
   preprocessingFlags: preprocessing.flags
  });
  const mapped = remapFindings(preprocessing,[...recognised,...scrutiny]);
  self.postMessage({id:data.id,matches:mapped,
   analysisSignals:preprocessing.signals});

 } catch (error) {
  self.postMessage({ id: data.id, error: String(error?.message || error) });
 }
});
