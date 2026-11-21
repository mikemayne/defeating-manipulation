#!/usr/bin/env node
/**
 * Offline 4-way evaluation of linear vs nonlinear reader fusion, with/without
 * deterministic lexical features. Reuses ALL 402 cached semantic scores and
 * the original GPT2/BERT caches; never downloads or invokes a neural model.
 *
 *  node scripts/evaluate-reader-nonlinear-fusion.mjs --preview
 *  node scripts/evaluate-reader-nonlinear-fusion.mjs --max-errors 5
 *
 * Retrospective 102 -> 300 transfer and 5-fold development CV. The 300-case
 * corpus has already been inspected, so this is NOT a fresh independent test.
 * Both variants of each authored scenario are kept in the same test fold.
 */
import {readFile,writeFile,mkdir} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {generateHoldout} from "./build-reader-holdout-v1.mjs";
import {makeHoldoutRows} from "./evaluate-reader-holdout-v1.mjs";
import {alignModelScores,assignExplicitRules,trainFusion}
 from "./evaluate-reader-fusion.mjs";
import {trainBoostedFusion,BOOSTED_DEFAULTS}
 from "../extension/src/reader-boosted-fusion.mjs";
import {lexicalOverlapFeatures,LEXICAL_FEATURE_NAMES}
 from "../extension/src/reader-lexical-features.mjs";
import {sentencePair} from "../extension/src/reader-semantic-signals.mjs";
import {explicitBoundaryConnector}
 from "../extension/src/reader-connector-normalisation.mjs";
import {originalProbeRows,attachPriorHoldoutScores,signalCacheFingerprint,
 obtainSemanticSignals,addSemanticFeatures,groupedFamilyFolds,EXPERIMENTS}
 from "./evaluate-reader-semantic-fusion.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const LABELS=["keep","and","but"];
const CORE=EXPERIMENTS["fusion+both"];
export const CONFIGURATIONS=Object.freeze({
 "linear":Object.freeze({model:"linear",keys:[...CORE]}),
 "linear+lexical":Object.freeze({model:"linear",keys:[...CORE,...LEXICAL_FEATURE_NAMES]}),
 "boosted":Object.freeze({model:"boosted",keys:[...CORE]}),
 "boosted+lexical":Object.freeze({model:"boosted",keys:[...CORE,...LEXICAL_FEATURE_NAMES]})
});
const defaults={
 trainJoin:path.join(root,"evaluation/reader-join-cross-validation.json"),
 trainMask:path.join(root,"evaluation/reader-mask-infill.json"),
 originalDataset:path.join(root,"evaluation/reader-strategy-synthetic-reference.json"),
 holdoutScores:path.join(root,"evaluation/reader-holdout-v1-scores.json"),
 semanticScores:path.join(root,"evaluation/reader-semantic-pair-scores.json"),
 output:path.join(root,"evaluation/reader-nonlinear-fusion.json"),
 preview:false,folds:5,seed:20261121,maxErrors:5
};
const pct=n=>n==null?"n/a":(100*n).toFixed(1)+"%";
const key=r=>JSON.stringify([r.id,r.offset]);
function parse(argv){
 const o={...defaults};
 const files=new Map([
  ["--train-join","trainJoin"],["--train-mask","trainMask"],
  ["--original-dataset","originalDataset"],["--holdout-scores","holdoutScores"],
  ["--semantic-scores","semanticScores"],["--output","output"]
 ]);
 const ints=new Map([["--folds","folds"],["--seed","seed"],["--max-errors","maxErrors"]]);
 for(let i=0;i<argv.length;i++){
  const arg=argv[i];
  if(arg==="--help"||arg==="-h"){
   console.log("Usage: node scripts/evaluate-reader-nonlinear-fusion.mjs "+
    "[--preview] [--max-errors N] [--folds N] [--seed N] "+
    "[--train-join PATH] [--train-mask PATH] [--holdout-scores PATH] "+
    "[--semantic-scores PATH] [--output PATH]\n"+
    "Offline only. All GPT2, masked BERT, MiniLM, and NLI scores must already be cached.");
   process.exit(0);
  }
  if(arg==="--preview"){o.preview=true;continue;}
  if(!files.has(arg)&&!ints.has(arg))throw Error("Unknown option "+arg);
  if(++i>=argv.length)throw Error("Missing value for "+arg);
  if(files.has(arg))o[files.get(arg)]=path.resolve(process.cwd(),argv[i]);
  else{
   const n=Number(argv[i]);
   if(!Number.isSafeInteger(n))throw Error("Expected integer for "+arg);
   o[ints.get(arg)]=n;
  }
 }
 if(o.folds<2||o.folds>15||o.maxErrors<0||o.maxErrors>100)
  throw Error("Invalid fold/error count");
 return o;
}
async function json(file){return JSON.parse(await readFile(file,"utf8"));}
export function attachLexicalFeatures(rows){
 return rows.map(row=>{
  const {left,right}=row.left&&row.right?
   {left:row.left,right:row.right}:sentencePair(row.source,row.probe);
  if(!Number.isFinite(row.features?.semanticSimilarity))
   throw Error("Semantic similarity missing for "+row.id);
  return {...row,left,right,
   features:{...row.features,
    ...lexicalOverlapFeatures(left,right,row.features.semanticSimilarity)}};
 });
}
export function fitReaderModel(train,config){
 if(!config||!Array.isArray(config.keys)||!["linear","boosted"].includes(config.model))
  throw Error("Unknown reader fusion configuration");
 const fit=train.filter(r=>!r.explicit);
 if(config.model==="linear")return trainFusion(fit,config.keys,{balanced:true});
 return trainBoostedFusion(fit,config.keys);
}
function summary(predictions,maxErrors=20){
 const matrix=Object.fromEntries(LABELS.map(g=>
  [g,Object.fromEntries(LABELS.map(p=>[p,0]))]));
 const byChallenge={},errors=[];
 for(const row of predictions){
  if(!LABELS.includes(row.gold)||!LABELS.includes(row.predicted))
   throw Error("Unknown gold or predicted label");
  matrix[row.gold][row.predicted]++;
  if(!byChallenge[row.challenge])byChallenge[row.challenge]={correct:0,total:0};
  const group=byChallenge[row.challenge];group.total++;
  if(row.predicted===row.gold)group.correct++;
  else errors.push({id:row.id,offset:row.offset,fold:row.fold??null,
   challenge:row.challenge,family:row.family,gold:row.gold,
   predicted:row.predicted,source:row.source});
 }
 const recall={};
 for(const g of LABELS){
  const total=LABELS.reduce((n,p)=>n+matrix[g][p],0);
  recall[g]=total?matrix[g][g]/total:null;
 }
 const count=predictions.length;
 const correct=LABELS.reduce((n,g)=>n+matrix[g][g],0);
 const present=LABELS.filter(g=>recall[g]!==null);
 return {
  combined:{count,correct,accuracy:count?correct/count:null,
   balancedAccuracy:present.reduce((n,g)=>n+recall[g],0)/present.length,
   recall,matrix},
  byChallenge:Object.fromEntries(Object.entries(byChallenge).map(([name,v])=>
   [name,{correct:v.correct,count:v.total,accuracy:v.correct/v.total}])),
  errors:errors.slice(0,maxErrors),
  predictions:predictions.map(r=>({id:r.id,offset:r.offset,fold:r.fold??null,
   family:r.family,challenge:r.challenge,gold:r.gold,predicted:r.predicted}))
 };
}
function predictedRows(model,test,fold=null){
 return test.map(row=>({...row,fold,
  predicted:row.explicit?.choice??model(row)}));
}
export function transferFour(train,test,{maxErrors=20}={}){
 const results={};
 for(const [name,config] of Object.entries(CONFIGURATIONS)){
  const model=fitReaderModel(train,config);
  results[name]=summary(predictedRows(model,test),maxErrors);
 }
 return results;
}
export function developmentFour(original,challenge,{
 folds=5,seed=20261121,maxErrors=20
}={}){
 const partitions=groupedFamilyFolds(challenge,{folds,seed});
 const testKeys=partitions.map(part=>new Set(part.map(key)));
 const originalFamilies=new Set(original.map(r=>r.family));
 for(const partition of partitions)
  if(partition.some(row=>originalFamilies.has(row.family)))
   throw Error("Original and challenge families overlap");
 const results={};
 for(const [name,config] of Object.entries(CONFIGURATIONS)){
  const predictions=[],foldResults=[];
  for(let i=0;i<partitions.length;i++){
   const test=partitions[i],heldOut=testKeys[i];
   const fit=[...original,...challenge.filter(r=>!heldOut.has(key(r)))];
   const model=fitReaderModel(fit,config);
   const batch=predictedRows(model,test,i+1);
   predictions.push(...batch);
   const m=summary(batch,0).combined;
   foldResults.push({fold:i+1,trainBoundaries:fit.length,
    testBoundaries:test.length,testFamilies:new Set(test.map(r=>r.family)).size,
    accuracy:m.accuracy,balancedAccuracy:m.balancedAccuracy});
  }
  if(predictions.length!==challenge.length||
    new Set(predictions.map(key)).size!==challenge.length)
   throw Error("Duplicate/missing grouped CV predictions");
  results[name]={...summary(predictions,maxErrors),folds:foldResults};
 }
 return results;
}
function compare(a,b){
 const first=new Map(a.predictions.map(r=>[key(r),r]));
 let fixed=0,regressed=0,unchanged=0;
 for(const p of b.predictions){
  const prior=first.get(key(p));
  if(!prior||prior.gold!==p.gold)throw Error("Comparison row mismatch");
  if(prior.predicted===p.predicted)unchanged++;
  else if(p.predicted===p.gold)fixed++;
  else if(prior.predicted===prior.gold)regressed++;
  else unchanged++;
 }
 return {fixed,regressed,other:unchanged,net:fixed-regressed};
}
export function compareFour(results){
 const base=results.linear;
 return Object.fromEntries(Object.entries(results).map(([name,result])=>
  [name,compare(base,result)]));
}
function printResults(label,results,maxErrors){
 console.log("\n"+label);
 for(const [name,r] of Object.entries(results)){
  const c=r.combined;
  console.log("  "+name+": "+c.correct+"/"+c.count+" = "+pct(c.accuracy)+
   ", balanced "+pct(c.balancedAccuracy)+
   " | KEEP "+pct(c.recall.keep)+
   " AND "+pct(c.recall.and)+" BUT "+pct(c.recall.but));
  for(const [challenge,value] of Object.entries(r.byChallenge))
   console.log("    "+challenge+": "+value.correct+"/"+value.count+" "+pct(value.accuracy));
  for(const e of r.errors.slice(0,maxErrors))
   console.log("    ERROR "+e.id+" "+e.gold+" => "+e.predicted+": "+e.source);
 }
 console.log("  Compared to linear baseline: "+JSON.stringify(compareFour(results)));
}
async function main(){
 const o=parse(process.argv.slice(2));
 const fresh=generateHoldout(),holdoutRows=makeHoldoutRows(fresh.cases);
 if(o.preview){
  const rows=holdoutRows.filter((_,i)=>i%50===0);
  for(const row of rows){
   const {left,right}=sentencePair(row.text,row.probe);
   console.log("  "+row.id+": "+JSON.stringify({left,right,
    lexical:lexicalOverlapFeatures(left,right,0.4)}));
  }
  console.log("Four configurations: "+Object.keys(CONFIGURATIONS).join(", "));
  console.log("Preview only: zero neural inference, no cache reads or writes.");return;
 }
 const [join,mask,oldData,holdoutCache]=await Promise.all([
  json(o.trainJoin),json(o.trainMask),json(o.originalDataset),
  json(o.holdoutScores)
 ]);
 const oldCases=Array.isArray(oldData)?oldData:oldData.cases;
 const oldJoined=assignExplicitRules(alignModelScores(join,mask,oldCases),
  (source,offset)=>explicitBoundaryConnector(source,{
   punctuationStart:offset,punctuationEnd:offset+1
  }));
 const original=originalProbeRows(oldCases,oldJoined);
 const holdout=attachPriorHoldoutScores(holdoutRows,holdoutCache,fresh.cases);
 const combined=[...original,...holdout];
 for(const row of combined){
  const pair=sentencePair(row.source,row.probe);
  row.left=pair.left;row.right=pair.right;
 }
 const fingerprint=signalCacheFingerprint(combined);
 console.log("Offline nonlinear fusion: "+original.length+" original and "+
  holdout.length+" challenge boundaries. No neural model calls.");
 const replay=await obtainSemanticSignals(combined,{
  file:o.semanticScores,fingerprint,readOnly:true,
  createScorer:()=>{throw Error("Unexpected neural inference");}
 });
 console.log("All "+replay.reused+" existing semantic pairs reused.");
 const train=attachLexicalFeatures(addSemanticFeatures(original));
 const test=attachLexicalFeatures(addSemanticFeatures(holdout));
 const transfer=transferFour(train,test,{maxErrors:Math.max(o.maxErrors,20)});
 const grouped=developmentFour(train,test,{
  folds:o.folds,seed:o.seed,maxErrors:Math.max(o.maxErrors,20)
 });
 // Detect accidental changes to cached inputs or old baseline implementation.
 if(transfer.linear.combined.correct!==224||
    transfer.linear.combined.count!==300)
  throw Error("Expected 224/300 original four-model baseline. Do not compare "+
   "until cached scores and linear fusion implementation have been checked.");
 printResults("RETROSPECTIVE 102 -> 300 (not independent)",transfer,o.maxErrors);
 printResults("GROUPED 5-FOLD DEVELOPMENT CV (150 families, 102 always in training)",
  grouped,o.maxErrors);
 const report={
  description:"Offline experimental four-way comparison, deterministic 32-round shallow multiclass boosted trees",
  corpus:"Previously inspected developer-authored 300-case challenge set",
  caveat:"Not an independent test: model choices and the challenge corpus are already known. Use a fresh frozen and human-reviewed test set before claiming generalization.",
  trainBoundaries:train.length,challengeBoundaries:test.length,
  families:new Set(test.map(r=>r.family)).size,
  semanticFingerprint:fingerprint,semanticCacheReuse:replay.reused,
  boostedHyperparameters:BOOSTED_DEFAULTS,configurations:CONFIGURATIONS,
  folds:o.folds,seed:o.seed,
  retrospectiveTransfer:transfer,
  groupedDevelopmentCV:grouped,
  retrospectiveDeltas:compareFour(transfer),
  developmentDeltas:compareFour(grouped)
 };
 await mkdir(path.dirname(o.output),{recursive:true});
 await writeFile(o.output,JSON.stringify(report,null,2)+"\n");
 console.log("\nSaved "+o.output);
 console.log("No GPT2, BERT, MiniLM or NLI model inference was performed.");
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
 main().catch(error=>{console.error(error?.stack||error);process.exitCode=1;});
