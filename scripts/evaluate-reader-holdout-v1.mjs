#!/usr/bin/env node
/**
 * FIRST unseen, group-stratified challenge test of the previously selected
 * balanced GPT2+DistilBERT fusion design. The training set is the existing
 * 102-example synthetic corpus, the holdout is frozen reader-holdout-v1.
 * No tuning / training on challenge labels, and no production changes.
 *
 * node scripts/evaluate-reader-holdout-v1.mjs --preview
 * node scripts/evaluate-reader-holdout-v1.mjs --max-errors 5
 *
 * Resume-safe score cache: evaluation/reader-holdout-v1-scores.json.
 */
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {createHash} from "node:crypto";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {generateHoldout,HOLDOUT_VERSION} from "./build-reader-holdout-v1.mjs";
import {alignModelScores,assignExplicitRules,trainFusion}
 from "./evaluate-reader-fusion.mjs";
import {extractBoundaryProbes,buildBoundaryChoices}
 from "../extension/src/reader-boundary-scorer.mjs";
import {explicitBoundaryConnector}
 from "../extension/src/reader-connector-normalisation.mjs";
import {MASK_MODEL,MASK_TEMPLATE_VERSION,maskedGapPrompt}
 from "../extension/src/reader-mask-infill.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const LABELS=["keep","and","but"];
const FEATURES={
 gpt2:["gptQuality","gptContrast"],
 bert:["bertContrast","bertHyphen","bertPeriod","bertSo"],
 fusion:["gptQuality","gptContrast","bertContrast","bertHyphen","bertPeriod","bertSo"]
};
export const HOLDOUT_SCORER_VERSION="holdout-score-v1";
const defaultOptions={
 trainJoin:path.join(root,"evaluation/reader-join-cross-validation.json"),
 trainMask:path.join(root,"evaluation/reader-mask-infill.json"),
 cache:path.join(root,"evaluation/reader-holdout-v1-scores.json"),
 scores:null,
 output:path.join(root,"evaluation/reader-holdout-v1-results.json"),
 preview:false,maxErrors:5
};
function parseArgs(args){
 const o={...defaultOptions};
 const paths=new Map([
  ["--train-join","trainJoin"],["--train-mask","trainMask"],
  ["--cache","cache"],["--scores","scores"],["--output","output"]
 ]);
 for(let i=0;i<args.length;i++){
  const a=args[i];
  if(a==="--help"||a==="-h"){
   console.log("Usage: node scripts/evaluate-reader-holdout-v1.mjs "+
    "[--preview] [--train-join PATH] [--train-mask PATH] "+
    "[--cache PATH] [--scores PATH] [--output PATH] [--max-errors N]\n"+
    "Scoring uses one DistilBERT and two DistilGPT2 calls per new case. "+
    "The model scores are cached; labels are never used for training on this corpus.");
   process.exit(0);
  }
  if(a==="--preview"){o.preview=true;continue;}
  if(a==="--max-errors"){
   if(++i>=args.length)throw Error("Missing value after --max-errors");
   o.maxErrors=Number(args[i]);continue;
  }
  if(!paths.has(a))throw Error("Unrecognised option "+a);
  if(++i>=args.length)throw Error("Missing path after "+a);
  o[paths.get(a)]=path.resolve(process.cwd(),args[i]);
 }
 if(!Number.isSafeInteger(o.maxErrors)||o.maxErrors<0||o.maxErrors>100)
  throw Error("--max-errors must be an integer between 0 and 100");
 return o;
}
const scoreOk=x=>typeof x==="number"&&Number.isFinite(x);
const pct=n=>n==null?"n/a":(100*n).toFixed(1)+"%";
const keyOf=(id,offset)=>JSON.stringify([id,offset]);
export function sourceFingerprint(cases){
 return createHash("sha256").update(JSON.stringify(cases)).digest("hex");
}
export function makeHoldoutRows(cases){
 const rows=[];
 const ids=new Set();
 for(const item of cases){
  if(ids.has(item.id))throw Error("Duplicate holdout case ID");
  ids.add(item.id);
  if(item.expected_boundaries?.length!==1)throw Error("Each challenge case must have one gold boundary");
  const gold=item.expected_boundaries[0];
  if(!LABELS.includes(gold.choice))throw Error("Unknown gold class");
  const probes=extractBoundaryProbes(item.text,{maxPairs:8});
  const probe=probes.find(x=>x.punctuationStart===gold.offset);
  if(!probe||probes.length!==1)throw Error("Missing/extra punctuation boundary "+item.id);
  const choices=buildBoundaryChoices(item.text,probe);
  const prompt=maskedGapPrompt(item.text,probe);
  if(choices.length!==2||!prompt)throw Error("Invalid model prompt "+item.id);
  rows.push({id:item.id,text:item.text,challenge:item.challenge,
   family:item.family,offset:gold.offset,gold:gold.choice,probe,choices,
   prompt:prompt.text,explicit:explicitBoundaryConnector(item.text,probe)});
 }
 return rows;
}
function cacheRowValid(entry,row,fingerprint){
 if(!entry||entry.version!==HOLDOUT_SCORER_VERSION||
    entry.corpusFingerprint!==fingerprint||
    entry.modelMask!==MASK_MODEL||entry.maskTemplate!==MASK_TEMPLATE_VERSION||
    entry.gptModel!=="Xenova/distilgpt2"||
    entry.id!==row.id||entry.offset!==row.offset||
    entry.text!==row.text||entry.prompt!==row.prompt)return false;
 for(const value of [entry.scores?.gptAnd,entry.scores?.gptBut,
  entry.scores?.mask?.and,entry.scores?.mask?.but,
  entry.scores?.mask?.["-"],entry.scores?.mask?.["."],entry.scores?.mask?.so])
  if(!scoreOk(value))return false;
 return true;
}
function cacheRow(row,fingerprint,scores){
 return {version:HOLDOUT_SCORER_VERSION,corpusFingerprint:fingerprint,
  modelMask:MASK_MODEL,maskTemplate:MASK_TEMPLATE_VERSION,
  gptModel:"Xenova/distilgpt2",
  id:row.id,offset:row.offset,text:row.text,prompt:row.prompt,scores};
}
async function loadJSON(file){
 return JSON.parse(await readFile(file,"utf8"));
}
async function loadRowsFromCache(rows,file,fingerprint){
 let cache;
 try{cache=await loadJSON(file);}
 catch(e){if(e.code==="ENOENT")return new Map();throw e;}
 if(cache?.corpusVersion!==HOLDOUT_VERSION||cache?.fingerprint!==fingerprint)
  throw Error("Cached model scores do not match the frozen holdout corpus");
 const byId=new Map();
 for(const item of cache.predictions||[]){
  const key=keyOf(item.id,item.offset);
  if(byId.has(key))throw Error("Duplicate cache entry at "+key);
  byId.set(key,item);
 }
 const active=new Set(rows.map(r=>keyOf(r.id,r.offset)));
 for(const id of byId.keys())if(!active.has(id))throw Error("Extra cache entry at "+id);
 return byId;
}
async function writeScoreCache(file,rows,byId,fingerprint){
 await mkdir(path.dirname(file),{recursive:true});
 const content={
  description:"Frozen synthetic holdout: scored inputs only, no training on holdout labels",
  corpusVersion:HOLDOUT_VERSION,fingerprint,
  predictions:rows.map(r=>byId.get(keyOf(r.id,r.offset))).filter(Boolean)
 };
 await writeFile(file,JSON.stringify(content,null,2)+"\n");
}
export async function obtainHoldoutScores(rows,{fingerprint,cache,scores=null,createGPT,createMask,log=console.log}){
 const file=scores||cache;
 const byId=await loadRowsFromCache(rows,file,fingerprint);
 let gpt=null,bert=null,newCount=0,reused=0;
 for(const row of rows){
  const key=keyOf(row.id,row.offset);
  const prior=byId.get(key);
  if(cacheRowValid(prior,row,fingerprint)){row.scores=prior.scores;reused++;continue;}
  if(scores)throw Error("Missing/invalid cached score for "+row.id+
   "; --scores requires a completely scored file");
  if(!bert)bert=await createMask({onStatus:log});
  if(!gpt)gpt=await createGPT({onStatus:log});
  const scored=await bert.score(row.text,row.probe);
  if(!scored||scored.text!==row.prompt)throw Error("Unexpected masked prompt "+row.id);
  const gptAnd=await gpt(row.choices[0].prefix,row.choices[0].completion);
  const gptBut=await gpt(row.choices[1].prefix,row.choices[1].completion);
  const values=[gptAnd,gptBut,scored.scores?.and,scored.scores?.but,
   scored.scores?.["-"],scored.scores?.["."],scored.scores?.so];
  if(!values.every(scoreOk))throw Error("Model returned nonfinite score at "+row.id);
  const entry=cacheRow(row,fingerprint,{
   gptAnd,gptBut,mask:scored.scores
  });
  row.scores=entry.scores;
  byId.set(key,entry);
  newCount++;
  if(newCount%5===0){
   await writeScoreCache(cache,rows,byId,fingerprint);
   log("Holdout model calls completed: "+newCount+" new cases; "+reused+
    " previous cases reused (checkpoint saved)");
  }
 }
 if(newCount)await writeScoreCache(cache,rows,byId,fingerprint);
 log("Holdout scoring complete: "+newCount+" newly scored, "+reused+" reused.");
 return {newCount,reused};
}
export function heldoutFeatures(row){
 const {gptAnd,gptBut,mask}=row.scores||{};
 if(![gptAnd,gptBut,mask?.and,mask?.but,mask?.["-"],mask?.["."],mask?.so].every(scoreOk))
  throw Error("Missing holdout model scores");
 const best=Math.max(mask.and,mask.but);
 return {...row,features:{
  gptQuality:Math.max(gptAnd,gptBut),gptContrast:gptBut-gptAnd,
  bertContrast:mask.but-mask.and,
  bertHyphen:mask["-"]-best,bertPeriod:mask["."]-best,
  bertSo:mask.so-best
 }};
}
function metrics(rows,choose){
 const matrix=Object.fromEntries(LABELS.map(g=>
  [g,Object.fromEntries(LABELS.map(p=>[p,0]))]));
 let correct=0;
 for(const row of rows){
  const predicted=choose(row);
  if(!LABELS.includes(predicted))throw Error("Invalid prediction");
  matrix[row.gold][predicted]++;
  if(predicted===row.gold)correct++;
 }
 const recall=Object.fromEntries(LABELS.map(g=>{
  const count=Object.values(matrix[g]).reduce((a,b)=>a+b,0);
  return [g,count?matrix[g][g]/count:null];
 }));
 const present=Object.values(recall).filter(x=>x!==null);
 return {count:rows.length,correct,accuracy:correct/rows.length,
  balancedAccuracy:present.reduce((a,b)=>a+b,0)/present.length,
  matrix,recall};
}
export function scoreFrozenHoldout(training,holdout){
 if(!training.length||!holdout.length)throw Error("Missing training or holdout");
 const results={};
 const assessed=holdout.map(heldoutFeatures);
 for(const [name,keys] of Object.entries(FEATURES)){
  // Class-balanced fit from the OLD 102 labelled examples only.
  const predictor=trainFusion(training.filter(r=>!r.explicit),keys,{balanced:true});
  const decisions=assessed.map(row=>({
   ...row,predicted:row.explicit?.choice??predictor(row)
  }));
  const combined=metrics(decisions,r=>r.predicted);
  const byChallenge={};
  for(const challenge of [...new Set(decisions.map(r=>r.challenge))]){
   const subset=decisions.filter(r=>r.challenge===challenge);
   byChallenge[challenge]=metrics(subset,r=>r.predicted);
  }
  results[name]={
   combined,byChallenge,
   predictions:decisions.map(r=>({id:r.id,offset:r.offset,
    gold:r.gold,predicted:r.predicted,challenge:r.challenge,family:r.family})),
   errors:decisions.filter(r=>r.predicted!==r.gold).map(r=>({
    id:r.id,challenge:r.challenge,gold:r.gold,
    predicted:r.predicted,text:r.text,features:r.features
   }))
  };
 }
 return results;
}
function printResult(name,result,maxErrors){
 const m=result.combined;
 console.log("\n"+name.toUpperCase()+": "+m.correct+"/"+m.count+
  " = "+pct(m.accuracy)+"; balanced "+pct(m.balancedAccuracy));
 for(const g of LABELS)console.log("  "+g+": "+JSON.stringify(m.matrix[g])+
  " recall "+pct(m.recall[g]));
 for(const [challenge,s] of Object.entries(result.byChallenge))
  console.log("  "+challenge+": "+pct(s.accuracy)+" ("+s.correct+"/"+s.count+")");
 for(const e of result.errors.slice(0,maxErrors))
  console.log("  ERROR "+e.id+" "+e.challenge+": "+e.gold+
   " => "+e.predicted+"  "+e.text);
}
async function main(){
 const o=parseArgs(process.argv.slice(2));
 const dataset=generateHoldout();
 const rows=makeHoldoutRows(dataset.cases);
 const fingerprint=sourceFingerprint(dataset.cases);
 console.log("Frozen "+HOLDOUT_VERSION+": "+rows.length+" novel labelled boundaries, "+
  new Set(rows.map(r=>r.family)).size+" authored families");
 console.log("Source checksum SHA-256: "+fingerprint);
 const counts=Object.fromEntries(LABELS.map(g=>
  [g,rows.filter(r=>r.gold===g).length]));
 console.log("Gold classes: "+JSON.stringify(counts));
 if(o.preview){
  for(const row of rows.filter((r,i)=>i%50===0))
   console.log("  "+row.challenge+" "+row.id+": "+row.prompt);
  console.log("Preview only: no scoring, no file writes.");return;
 }
 const [join,mask,trainingDataset]=await Promise.all([
  loadJSON(o.trainJoin),loadJSON(o.trainMask),
  loadJSON(path.join(root,"evaluation/reader-strategy-synthetic-reference.json"))
 ]);
 const oldCases=Array.isArray(trainingDataset)?trainingDataset:trainingDataset.cases;
 const training=assignExplicitRules(alignModelScores(join,mask,oldCases),
  (source,offset)=>explicitBoundaryConnector(source,{
   punctuationStart:offset,punctuationEnd:offset+1
  }));
 if(training.length!==102)throw Error("Frozen fusion training set should have exactly 102 boundaries");
 console.log("Fitting original 102-case classifier. No new holdout labels used.");
 const {createBoundaryLanguageScorer}=await import("../extension/src/reader-language-model.mjs");
 const {createMaskedGapScorer}=await import("../extension/src/reader-mask-infill.mjs");
 const scoring=await obtainHoldoutScores(rows,{
  fingerprint,cache:o.cache,scores:o.scores,
  createGPT:createBoundaryLanguageScorer,createMask:createMaskedGapScorer
 });
 const results=scoreFrozenHoldout(training,rows);
 for(const [name,result] of Object.entries(results))
  printResult(name,result,o.maxErrors);
 const final={
  description:"Unseen synthetic challenge corpus; model and feature design frozen before test",
  corpusVersion:HOLDOUT_VERSION,corpusFingerprint:fingerprint,
  trainingCaseCount:new Set(training.map(x=>x.id)).size,
  trainingBoundaryCount:training.length,
  holdoutCount:rows.length,holdoutFamilyCount:new Set(rows.map(r=>r.family)).size,
  scoring,design:{regularizedSoftmax:"existing trainFusion 650 epochs, lambda 0.10",
   classBalanced:true,explicitConnectorRules:true,
   trainingOnly:"Original 102 synthetic labelled boundaries",sourceModels:["Xenova/distilgpt2",MASK_MODEL]},
  caveat:"All references are developer-authored, including the fresh challenge set. No human agreement study was done. Related chronological/causal examples are labelled AND under the existing 3-way taxonomy.",
  results
 };
 await mkdir(path.dirname(o.output),{recursive:true});
 await writeFile(o.output,JSON.stringify(final,null,2)+"\n");
 console.log("\nSaved "+o.output);
 console.log("New-case labels were not used in fitting. This report is the holdout result; do not select new thresholds based on it and call the same cases unseen again.");
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
 main().catch(e=>{console.error(e?.stack||e);process.exitCode=1;});
