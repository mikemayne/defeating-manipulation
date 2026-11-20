import { pipeline, env } from "@huggingface/transformers";
import nspell from "nspell";
import { findSpellingBait } from "./spelling-bait.mjs";
import { compilePatternRules, prototypeEntries, matchText } from "./matching-core.mjs";
import { embeddingRows } from "./embedding-rows.mjs";
import { findInconsistencies } from "./consistency.mjs";
import { analyseArguments, argumentFindings } from "./argument-analysis.mjs";
import { createNliScorer } from "./nli-inference.mjs";
import { positiveTechniques, matchPositiveText } from "./positive-matching.mjs";
import { findConcealedPatterns } from "./concealed-matching.mjs";

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
  const spellingMatches = findSpellingBait(data.text, spellchecker,
   techniques.find(item => item.id === "deliberate_errors"));
  const matches = await matchText(data.text, { techniques, rules, prototypes,
   embed: extractor ? embed : null });
  // Separate green pass: do not let it compete with the established negative
  // technique rankings or suppress blue matches. Relationship analysis comes later.
  const positiveMatches = await matchPositiveText(data.text, {
   prototypes: positivePrototypes,
   embed: extractor ? embed : null
  });
  const concealedMatches = findConcealedPatterns(data.text, {
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
  let inconsistencies = [], argumentIssues = [];
  try {
   stage("Checking statements for contradictions…");
   inconsistencies = await findInconsistencies(data.text, memoScore);
   stage("Checking whether conclusions follow from the evidence…");
   const assessed = await analyseArguments(data.text, memoScore, {
    includeImplicit:true,
    includeModelDiscovery:true,
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
  self.postMessage({ id: data.id,
   matches: [...matches, ...spellingMatches, ...positiveMatches, ...concealedMatches,
    ...inconsistencies, ...argumentIssues] });
 } catch (error) {
  self.postMessage({ id: data.id, error: String(error?.message || error) });
 }
});
