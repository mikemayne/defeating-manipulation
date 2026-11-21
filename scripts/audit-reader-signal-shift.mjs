#!/usr/bin/env node
/**
 * Compare the distribution of extreme masked-BERT contrast evidence against
 * lexical overlap in original synthetic and authentic GDTB-labelled data.
 *
 * Only aggregate NUMBERS are printed or written. No source snippets, IDs,
 * article text, posts, or text-derived exemplars are committed/exported.
 *
 * node scripts/audit-reader-signal-shift.mjs --preview
 * node scripts/audit-reader-signal-shift.mjs --offline
 *
 * Requires the previously generated local inference caches, with 0 new
 * model inference. The old 217-case test and 39 future reserved documents
 * are never consulted.
 */
import {readFile,writeFile,mkdir} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {syntheticTraining,scoreBatch,transferRows}
 from "./evaluate-reader-gum-transfer.mjs";
import {verifyExpansion}
 from "./build-reader-gum-contrast-expansion.mjs";
import {verifyAndPool}
 from "./build-reader-gum-and-mixtures.mjs";

export const VERSION="reader-contrast-domain-shift-v1";
// Fixed *diagnostic* grid. Do not pick the most flattering cutoff as a
// deployment rule; some authentic golds are ambiguous and n is small.
export const THRESHOLDS=Object.freeze([
 Object.freeze({bertMinimum:2,lexicalMaximum:0}),
 Object.freeze({bertMinimum:3,lexicalMaximum:0}),
 Object.freeze({bertMinimum:4,lexicalMaximum:0}),
 Object.freeze({bertMinimum:2,lexicalMaximum:.05}),
 Object.freeze({bertMinimum:3,lexicalMaximum:.05}),
 Object.freeze({bertMinimum:4,lexicalMaximum:.05}),
 Object.freeze({bertMinimum:2,lexicalMaximum:.10}),
 Object.freeze({bertMinimum:3,lexicalMaximum:.10}),
 Object.freeze({bertMinimum:4,lexicalMaximum:.10})
]);
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const local=n=>path.join(ROOT,"evaluation",n);
const PATHS={
 base:local("reader-gum-transfer-v1.json"),
 oldManifest:local("reader-authentic-transfer-documents-v1.json"),
 newManifest:local("reader-gum-contrast-expanded-documents-v1.json"),
 but:local("reader-gum-contrast-expansion-v1.json"),
 and:local("reader-gum-and-mixtures-v1.json"),
 oldJoin:local("reader-join-cross-validation.json"),
 oldMask:local("reader-mask-infill.json"),
 oldDataset:local("reader-strategy-synthetic-reference.json"),
 v1Scores:local("reader-holdout-v1-scores.json"),
 previousSemantic:local("reader-semantic-pair-scores.json"),
 trainLm:local("reader-gum-transfer-train-lm-v1.json"),
 trainSem:local("reader-gum-transfer-train-sem-v1.json"),
 butLm:local("reader-gum-contrast-expansion-lm-v1.json"),
 butSem:local("reader-gum-contrast-expansion-sem-v1.json"),
 andLm:local("reader-gum-and-mixtures-lm-v1.json"),
 andSem:local("reader-gum-and-mixtures-sem-v1.json"),
 output:local("reader-signal-shift-v1.json")
};
const json=p=>readFile(p,"utf8").then(JSON.parse);
const labelKey=k=>k==="keep"||k==="and"||k==="but";
/**
 * Deterministic aggregate by cohort and human label. Source, title, ID,
 * sentence fragments and document names are never returned.
 */
export function signalShift(datasets,thresholds=THRESHOLDS){
 if(!datasets||typeof datasets!=="object"||Array.isArray(datasets)||
  !Object.keys(datasets).length||!Array.isArray(thresholds)||
  !thresholds.length)throw Error("Datasets and threshold grid required");
 for(const t of thresholds)if(!Number.isFinite(t.bertMinimum)||
  !Number.isFinite(t.lexicalMaximum)||t.lexicalMaximum<0||
  t.lexicalMaximum>1)
  throw Error("Invalid numeric signal cutoff");
 const cohorts={};
 for(const [cohort,rows] of Object.entries(datasets)){
  if(!Array.isArray(rows)||!rows.length)
   throw Error("Empty signal-shift cohort");
  const counts=Object.fromEntries(["keep","and","but"].map(k=>[k,0]));
  const samples=[];
  for(const row of rows){
   const f=row.features;
   if(!labelKey(row.gold)||!Number.isFinite(f?.bertContrast)||
    !Number.isFinite(f?.lexicalJaccard)||
    f.lexicalJaccard<0||f.lexicalJaccard>1)
    throw Error("Invalid label or missing fixed LM/lexical scores");
   counts[row.gold]++;
  }
  for(const t of thresholds){
   const matched=Object.fromEntries(["keep","and","but"].map(k=>[k,0]));
   for(const row of rows)if(
    row.features.bertContrast>t.bertMinimum&&
    row.features.lexicalJaccard<=t.lexicalMaximum
   )matched[row.gold]++;
   samples.push({bertMinimum:t.bertMinimum,
    lexicalMaximum:t.lexicalMaximum,matched});
  }
  cohorts[cohort]={count:rows.length,labels:counts,grid:samples};
 }
 return {version:VERSION,
  note:"Aggregate feature distribution only, not a causal explanation or calibrated score. Golds are GDTB connective mappings, and some pairs may permit both readings. Historical development data, not fresh independent validation.",
  cohorts};
}
export function parseArgs(argv){
 let preview=false;
 for(const arg of argv){
  if(arg==="-h"||arg==="--help"){
   console.log("node scripts/audit-reader-signal-shift.mjs "+
    "[--preview] [--offline] \n"+
    "Only source-free aggregate results; all inference cached, no downloads.");
   process.exit(0);
  }
  if(arg==="--preview")preview=true;
  else if(arg!=="--offline")
   throw Error("Unsupported command option "+arg);
 }
 return {preview};
}
async function main(){
 const {preview}=parseArgs(process.argv.slice(2));
 const [base,old,newManifest,butCorpus,andCorpus]=await Promise.all([
  json(PATHS.base),json(PATHS.oldManifest),json(PATHS.newManifest),
  json(PATHS.but),json(PATHS.and)
 ]);
 verifyExpansion(butCorpus,base,old,newManifest);
 verifyAndPool(andCorpus,base,old,newManifest,butCorpus);
 if(preview){
  console.log("Manifest and split checks passed. No model inference.");
  return;
 }
 const synthetic=await syntheticTraining(PATHS);
 const genuine=(await scoreBatch(transferRows(base.train),{
  lmPath:PATHS.trainLm,semPath:PATHS.trainSem,offline:true,
  hash:base.meta.selectionHash+"|train"
 })).rows;
 const extraBut=(await scoreBatch(transferRows(butCorpus.cases),{
  lmPath:PATHS.butLm,semPath:PATHS.butSem,offline:true,
  hash:butCorpus.meta.selectionHash+"|training-only-contrast"
 })).rows;
 const extraAnd=(await scoreBatch(transferRows(andCorpus.cases),{
  lmPath:PATHS.andLm,semPath:PATHS.andSem,offline:true,
  hash:andCorpus.meta.selectionHash+"|training-only-AND-pool"
 })).rows;
 if(synthetic.length!==402||genuine.length!==308||
  extraBut.length!==110||extraAnd.length!==440)
  throw Error("Expected frozen original authentic and synthetic cohorts");
 const report=signalShift({synthetic,genuineTrain:genuine,
  additionalBUT:extraBut,additionalAND:extraAnd});
 await mkdir(path.dirname(PATHS.output),{recursive:true});
 await writeFile(PATHS.output,JSON.stringify(report,null,2)+"\n");
 console.log("EXTREME BERT CONTRAST vs lexical overlap (numeric aggregates).");
 for(const [name,cohort] of Object.entries(report.cohorts)){
  console.log(name+" label support "+JSON.stringify(cohort.labels));
  for(const probe of cohort.grid)
   console.log("  BERT > "+probe.bertMinimum+
    ", lexical <= "+probe.lexicalMaximum+": "+
    JSON.stringify(probe.matched));
 }
 console.log("Saved numeric-only "+PATHS.output);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
 main().catch(e=>{console.error(e?.stack||e);process.exitCode=1;});
