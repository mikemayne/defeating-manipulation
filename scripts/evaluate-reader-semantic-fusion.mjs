#!/usr/bin/env node
/**
 * Experimental semantic-fusion research over the original 102 labelled
 * boundaries and the already-observed 300-case challenge corpus.
 *
 * New inference: MiniLM embeddings + forward/reverse MNLI ONLY.
 * Reuses all existing GPT2 and masked-BERT scores.
 *
 * Run:
 *  node scripts/evaluate-reader-semantic-fusion.mjs --preview
 *  node scripts/evaluate-reader-semantic-fusion.mjs --max-errors 5
 *
 * Reports:
 *  1) Retrospective 102 -> 300 transfer (not a fresh independent test).
 *  2) 5-fold grouped-by-family CV on 300 + original 102 training examples.
 *     Every pair of variants from one authored scenario stays in one fold.
 *  3) Original baseline reproduced with identical train/test rows.
 *
 * All gold labels are developer-authored synthetic; no human agreement.
 */
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {createHash} from "node:crypto";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {generateHoldout} from "./build-reader-holdout-v1.mjs";
import {alignModelScores,assignExplicitRules,trainFusion}
 from "./evaluate-reader-fusion.mjs";
import {heldoutFeatures,makeHoldoutRows,sourceFingerprint}
 from "./evaluate-reader-holdout-v1.mjs";
import {extractBoundaryProbes} from "../extension/src/reader-boundary-scorer.mjs";
import {explicitBoundaryConnector}
 from "../extension/src/reader-connector-normalisation.mjs";
import {sentencePair,semanticFeatures,validateSemanticSignals,
 createSemanticPairScorer,EMBEDDING_MODEL,NLI_MODEL,SEMANTIC_SIGNAL_VERSION}
 from "../extension/src/reader-semantic-signals.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const LABELS=["keep","and","but"];
const ORIGINAL=["gptQuality","gptContrast","bertContrast","bertHyphen","bertPeriod","bertSo"];
const SIM=["semanticSimilarity"];
const NLI=["nliForwardContradiction","nliForwardEntailment","nliReverseContradiction","nliReverseEntailment"];
export const EXPERIMENTS=Object.freeze({
 "original-fusion":ORIGINAL,
 "similarity-only":SIM,
 "nli-only":NLI,
 "semantic-only":[...SIM,...NLI],
 "fusion+similarity":[...ORIGINAL,...SIM],
 "fusion+nli":[...ORIGINAL,...NLI],
 "fusion+both":[...ORIGINAL,...SIM,...NLI]
});
export const SEMANTIC_BENCHMARK_VERSION="reader-semantic-benchmark-v1";
const DEFAULTS={
 trainJoin:path.join(root,"evaluation/reader-join-cross-validation.json"),
 trainMask:path.join(root,"evaluation/reader-mask-infill.json"),
 oldDataset:path.join(root,"evaluation/reader-strategy-synthetic-reference.json"),
 holdoutScores:path.join(root,"evaluation/reader-holdout-v1-scores.json"),
 semanticScores:path.join(root,"evaluation/reader-semantic-pair-scores.json"),
 output:path.join(root,"evaluation/reader-semantic-fusion.json"),
 readOnly:false,preview:false,folds:5,seed:20261121,maxErrors:5
};
const finite=n=>typeof n==="number"&&Number.isFinite(n);
const pct=n=>n==null?"n/a":(100*n).toFixed(1)+"%";
const rowId=r=>JSON.stringify([r.id,r.offset]);
function args(argv){
 const o={...DEFAULTS};
 const paths=new Map([["--train-join","trainJoin"],["--train-mask","trainMask"],
  ["--old-dataset","oldDataset"],["--holdout-scores","holdoutScores"],
  ["--semantic-scores","semanticScores"],["--output","output"]]);
 const nums=new Map([["--folds","folds"],["--seed","seed"],["--max-errors","maxErrors"]]);
 for(let i=0;i<argv.length;i++){
  const key=argv[i];
  if(key==="-h"||key==="--help"){
   console.log("Usage: node scripts/evaluate-reader-semantic-fusion.mjs "+
    "[--preview] [--offline] [--max-errors N] [--folds N] [--seed N] "+
    "[--train-join PATH] [--train-mask PATH] [--holdout-scores PATH] "+
    "[--semantic-scores PATH] [--output PATH]\n"+
    "--preview: check boundary inputs without any inference.\n"+
    "--offline: replay saved semantic scores, refuse missing cases. "+
    "Models load ONLY when new semantic scores are missing.");
   process.exit(0);
  }
  if(key==="--preview"){o.preview=true;continue;}
  if(key==="--offline"){o.readOnly=true;continue;}
  if(!paths.has(key)&&!nums.has(key))throw Error("Unknown option: "+key);
  if(++i>=argv.length)throw Error("Missing value after "+key);
  if(paths.has(key))o[paths.get(key)]=path.resolve(process.cwd(),argv[i]);
  else{
   const n=Number(argv[i]);
   if(!Number.isSafeInteger(n))throw Error("Expected integer after "+key);
   o[nums.get(key)]=n;
  }
 }
 if(o.folds<2||o.folds>15||o.maxErrors<0||o.maxErrors>100)
  throw Error("Invalid folds/max-errors");
 return o;
}
async function json(file){return JSON.parse(await readFile(file,"utf8"));}
export function originalProbeRows(oldCases,oldJoined){
 const index=new Map(oldCases.map(c=>[c.id,c]));
 const rows=[];
 for(const row of oldJoined){
  const item=index.get(row.id);
  if(!item||row.source!==item.text)throw Error("Old score/source mismatch at "+row.id);
  const probes=extractBoundaryProbes(item.text,{maxPairs:8});
  const probe=probes.find(x=>x.punctuationStart===row.offset);
  if(!probe)throw Error("Missing original boundary "+row.id+":"+row.offset);
  rows.push({...row,source:item.text,probe,
   challenge:"original-102",family:row.id});
 }
 if(rows.length!==102)throw Error("Expected 102 original labelled boundaries");
 return rows;
}
export function attachPriorHoldoutScores(holdout,cache,cases){
 if(cache?.corpusVersion!=="reader-holdout-v1"||
  cache.fingerprint!==sourceFingerprint(cases))
  throw Error("Cached holdout scores do not match the 300-case corpus");
 const index=new Map();
 for(const entry of cache.predictions||[]){
  const id=rowId(entry);
  if(index.has(id))throw Error("Duplicate existing holdout score "+id);
  index.set(id,entry);
 }
 if(index.size!==holdout.length)throw Error("Existing GPT/BERT scores incomplete; run evaluate-reader-holdout-v1.mjs");
 const rows=[];
 for(const row of holdout){
  const old=index.get(rowId(row));
  if(!old||old.text!==row.text||old.version!=="holdout-score-v1"||
   old.corpusFingerprint!==cache.fingerprint)
   throw Error("Old holdout score does not match "+row.id);
  rows.push({...heldoutFeatures({...row,scores:old.scores}),
   source:row.text});
 }
 return rows;
}
export function signalCacheFingerprint(rows){
 const inputs=rows.map(r=>{
  const {left,right}=sentencePair(r.source,r.probe);
  return [r.id,r.offset,r.source,left,right];
 });
 return createHash("sha256").update(JSON.stringify(inputs)).digest("hex");
}
function cacheEntryValid(value,row){
 if(!value||value.id!==row.id||value.offset!==row.offset||
  value.source!==row.source||value.left!==row.left||
  value.right!==row.right)return false;
 try{validateSemanticSignals(value.signals);return true;}catch{return false;}
}
async function saveSignals(file,items,byId,fingerprint){
 await mkdir(path.dirname(file),{recursive:true});
 await writeFile(file,JSON.stringify({
  benchmarkVersion:SEMANTIC_BENCHMARK_VERSION,
  signalVersion:SEMANTIC_SIGNAL_VERSION,
  embeddingModel:EMBEDDING_MODEL,nliModel:NLI_MODEL,
  corpusFingerprint:fingerprint,
  predictions:items.map(r=>byId.get(rowId(r))).filter(Boolean)
 },null,2)+"\n");
}
export async function obtainSemanticSignals(items,{
 file,fingerprint,readOnly=false,createScorer=createSemanticPairScorer,
 log=console.log
}={}){
 if(!file||!fingerprint)throw Error("Cache path/fingerprint required");
 const byId=new Map();
 let previous;
 try{previous=await json(file);}catch(e){
  if(e.code!=="ENOENT")throw e;
  if(readOnly)throw Error("Missing score cache: "+file);
 }
 if(previous){
  if(previous.benchmarkVersion!==SEMANTIC_BENCHMARK_VERSION||
   previous.signalVersion!==SEMANTIC_SIGNAL_VERSION||
   previous.embeddingModel!==EMBEDDING_MODEL||previous.nliModel!==NLI_MODEL||
   previous.corpusFingerprint!==fingerprint)
   throw Error("Semantic cache metadata mismatch: use new cache path or recalculate");
  for(const entry of previous.predictions||[]){
   const id=rowId(entry);
   if(byId.has(id))throw Error("Duplicate cached semantic row "+id);
   byId.set(id,entry);
  }
 }
 const wanted=new Set(items.map(rowId));
 if(wanted.size!==items.length)throw Error("Duplicate semantic scoring case");
 for(const id of byId.keys())if(!wanted.has(id))
  throw Error("Cached semantic rows have extra case "+id);
 let scorer=null,count=0,reused=0;
 for(const row of items){
  const key=rowId(row),old=byId.get(key);
  if(cacheEntryValid(old,row)){row.semantic=old.signals;reused++;continue;}
  if(readOnly)throw Error("Missing/invalid semantic result for "+row.id);
  if(!scorer)scorer=await createScorer({onStatus:log});
  const signals=validateSemanticSignals(await scorer(row.left,row.right));
  row.semantic=signals;
  byId.set(key,{id:row.id,offset:row.offset,
   source:row.source,left:row.left,right:row.right,signals});
  count++;
  if(count%10===0){
   await saveSignals(file,items,byId,fingerprint);
   log("Semantic pairs: "+count+" new; "+reused+" cached (checkpoint saved)");
  }
 }
 if(count)await saveSignals(file,items,byId,fingerprint);
 log("Semantic scoring complete: "+count+" new; "+reused+" cached");
 return {newCount:count,reused};
}
export function addSemanticFeatures(rows){
 return rows.map(row=>{
  if(!row.semantic)throw Error("Missing semantic scores for "+row.id);
  const features={...row.features,...semanticFeatures(row.semantic)};
  return {...row,features};
 });
}
function metrics(rows){
 const matrix=Object.fromEntries(LABELS.map(g=>[g,
  Object.fromEntries(LABELS.map(p=>[p,0]))]));
 let correct=0;
 for(const row of rows){
  if(!LABELS.includes(row.gold)||!LABELS.includes(row.predicted))
   throw Error("Invalid predicted/gold label");
  matrix[row.gold][row.predicted]++;
  if(row.gold===row.predicted)correct++;
 }
 const recall=Object.fromEntries(LABELS.map(label=>{
  const total=Object.values(matrix[label]).reduce((a,b)=>a+b,0);
  return [label,total?matrix[label][label]/total:null];
 }));
 const present=Object.values(recall).filter(x=>x!=null);
 return {count:rows.length,correct,accuracy:correct/rows.length,
  balancedAccuracy:present.reduce((a,b)=>a+b,0)/present.length,
  recall,matrix};
}
function summarize(predictions,maxErrors=10){
 const combined=metrics(predictions);
 const byChallenge={};
 for(const challenge of [...new Set(predictions.map(r=>r.challenge))]){
  byChallenge[challenge]=metrics(predictions.filter(r=>r.challenge===challenge));
 }
 const errors=predictions.filter(r=>r.predicted!==r.gold).slice(0,maxErrors)
  .map(r=>({id:r.id,family:r.family,challenge:r.challenge,
   gold:r.gold,predicted:r.predicted,source:r.source}));
 return {combined,byChallenge,errors,
  predictions:predictions.map(r=>({id:r.id,offset:r.offset,
   gold:r.gold,predicted:r.predicted,challenge:r.challenge,family:r.family}))};
}
function predictRows(train,test,keys){
 const model=trainFusion(train.filter(r=>!r.explicit),keys,{balanced:true});
 return test.map(row=>({...row,
  predicted:row.explicit?.choice??model(row)}));
}
export function transferComparison(train,holdout){
 const out={};
 for(const [name,keys] of Object.entries(EXPERIMENTS))
  out[name]=summarize(predictRows(train,holdout,keys),100);
 return out;
}
function shuffle(input,seed){
 let s=seed>>>0;
 const rand=()=>{s=(s+0x6D2B79F5)>>>0;let z=s;
  z=Math.imul(z^(z>>>15),z|1);z^=Math.imul(z^(z>>>7),z|61);
  return ((z^(z>>>14))>>>0)/4294967296;};
 const arr=[...input];
 for(let i=arr.length-1;i>0;i--){
  const j=Math.floor(rand()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]];
 }
 return arr;
}
export function groupedFamilyFolds(rows,{folds=5,seed=20261121}={}){
 const groups=new Map();
 for(const row of rows){
  if(!row.family||!row.challenge)throw Error("Challenge and family required");
  const fam=groups.get(row.family);
  if(fam){if(fam.challenge!==row.challenge)throw Error("Family crosses challenge types");
   fam.members.push(row);}
  else groups.set(row.family,{challenge:row.challenge,members:[row]});
 }
 const byType=new Map();
 for(const [id,group] of groups){
  if(!byType.has(group.challenge))byType.set(group.challenge,[]);
  byType.get(group.challenge).push(id);
 }
 const assignment=new Map();
 for(const [type,ids] of byType){
  const shuffled=shuffle(ids,seed^Array.from(type).reduce((x,c)=>x+c.charCodeAt(0),0));
  shuffled.forEach((id,i)=>assignment.set(id,i%folds));
 }
 const bins=Array.from({length:folds},()=>[]);
 for(const row of rows)bins[assignment.get(row.family)].push(row);
 if(bins.some(x=>!x.length))throw Error("Empty family holdout fold");
 for(const [family,group] of groups){
  if(new Set(group.members.map(x=>assignment.get(x.family))).size!==1)
   throw Error("Family leaked across folds: "+family);
 }
 return bins;
}
export function developmentCV(train,holdout,{folds=5,seed=20261121}={}){
 const bins=groupedFamilyFolds(holdout,{folds,seed});
 const results={};
 for(const [name,keys] of Object.entries(EXPERIMENTS)){
  const predicted=[],foldSummaries=[];
  for(let fold=0;fold<bins.length;fold++){
   const test=bins[fold];
   const testFamilies=new Set(test.map(x=>x.family));
   const other=holdout.filter(r=>!testFamilies.has(r.family));
   const fit=[...train,...other];
   const decisions=predictRows(fit,test,keys);
   predicted.push(...decisions);
   foldSummaries.push({fold:fold+1,testCases:test.length,
    testFamilies:testFamilies.size,trainBoundaries:fit.length,
    ...metrics(decisions)});
  }
  if(predicted.length!==holdout.length)throw Error("Cross validation missed holdout case");
  results[name]={...summarize(predicted,100),folds:foldSummaries};
 }
 return results;
}
function print(name,s,errors){
 const m=s.combined;
 console.log("  "+name+": "+m.correct+"/"+m.count+" "+pct(m.accuracy)+
  "; balanced "+pct(m.balancedAccuracy)+
  "; recalls "+LABELS.map(g=>g+" "+pct(m.recall[g])).join(", "));
 for(const e of s.errors.slice(0,errors))
  console.log("    ERROR "+e.id+" "+e.gold+" => "+e.predicted+" "+e.source);
}
async function main(){
 const o=args(process.argv.slice(2));
 const newDataset=generateHoldout();
 const cases=newDataset.cases,rawHoldout=makeHoldoutRows(cases);
 const oldData=await json(o.oldDataset);
 const oldCases=Array.isArray(oldData)?oldData:oldData.cases;
 console.log("Reader semantic-fusion experiment: "+rawHoldout.length+
  " challenge boundaries and 102 original boundaries.");
 if(o.preview){
  for(const row of rawHoldout.filter((r,i)=>i%50===0)){
   const pair=sentencePair(row.text,row.probe);
   console.log("  "+row.id+" "+JSON.stringify(pair));
  }
  console.log("Preview only: no models or cache required.");return;
 }
 const [join,mask,holdoutCache]=await Promise.all([
  json(o.trainJoin),json(o.trainMask),json(o.holdoutScores)
 ]);
 const original=originalProbeRows(oldCases,
  assignExplicitRules(alignModelScores(join,mask,oldCases),
   (source,offset)=>explicitBoundaryConnector(source,{
    punctuationStart:offset,punctuationEnd:offset+1
   })));
 const holdout=attachPriorHoldoutScores(rawHoldout,holdoutCache,cases);
 const combined=[...original,...holdout];
 for(const row of combined){
  const pair=sentencePair(row.source,row.probe);
  row.left=pair.left;row.right=pair.right;
 }
 const fingerprint=signalCacheFingerprint(combined);
 console.log("All "+combined.length+" pairs validated. Semantic cache fingerprint: "+fingerprint);
 const scoring=await obtainSemanticSignals(combined,{
  file:o.semanticScores,fingerprint,readOnly:o.readOnly
 });
 const training=addSemanticFeatures(original);
 const development=addSemanticFeatures(holdout);
 const transfer=transferComparison(training,development);
 const grouped=developmentCV(training,development,{folds:o.folds,seed:o.seed});
 console.log("\nRETROSPECTIVE 102->300 TRANSFER "+
  "(previously observed challenge set; NOT a fresh held-out test):");
 for(const [name,s] of Object.entries(transfer))print(name,s,o.maxErrors);
 console.log("\nDEVELOPMENT 5-FOLD CROSS-VALIDATION "+
  "(150 authored families grouped; 102 original cases always in training):");
 for(const [name,s] of Object.entries(grouped))print(name,s,o.maxErrors);
 const prior=transfer["original-fusion"].combined;
 console.log("\nUnchanged original fusion reference: "+prior.correct+"/"+prior.count+
  " "+pct(prior.accuracy)+". Previous result was 179/300 (59.7%).");
 if(prior.correct!==179||prior.count!==300)
  throw Error("Original fusion reference changed; check model inputs before interpreting.");
 const report={
  description:"Exploratory semantic similarity + directional NLI fusion on developer-authored synthetic corpus",
  version:SEMANTIC_BENCHMARK_VERSION,cacheFingerprint:fingerprint,
  semanticModels:{embedding:EMBEDDING_MODEL,nli:NLI_MODEL},
  scoring,folds:o.folds,seed:o.seed,
  originalTrainingBoundaries:training.length,challengeBoundaries:development.length,
  challengeFamilies:new Set(development.map(x=>x.family)).size,
  caveat:"The 300-case corpus was previously examined and is now development data, NOT independent. Its labels may be disputed. New testing on a separate frozen corpus and ideally human annotation is needed.",
  experiments:Object.fromEntries(Object.entries(EXPERIMENTS).map(([k,v])=>[k,v])),
  retrospectiveTransfer:transfer,groupedDevelopmentCV:grouped
 };
 await mkdir(path.dirname(o.output),{recursive:true});
 await writeFile(o.output,JSON.stringify(report,null,2)+"\n");
 console.log("Saved "+o.output+"; no original GPT2/BERT inference repeated.");
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
 main().catch(e=>{console.error(e?.stack||e);process.exitCode=1;});
