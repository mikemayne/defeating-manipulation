#!/usr/bin/env node
/**
 * Completely offline feature ablations for the frozen linear + lexical reader.
 * Re-fits on the previous 402 synthetic cases ONLY. GUM labels and the
 * previously inspected 1000-case synthetic set are EVALUATION ONLY.
 * Configurations are fixed before seeing any ablation results.
 *
 * node scripts/evaluate-reader-gum-ablations.mjs
 * node scripts/evaluate-reader-gum-ablations.mjs --no-v2
 */
import {readFile,writeFile,mkdir} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {generateHoldout} from "./build-reader-holdout-v1.mjs";
import {makeHoldoutRows,heldoutFeatures} from "./evaluate-reader-holdout-v1.mjs";
import {readScenarioSeeds,buildCorpus} from "./build-reader-holdout-v2.mjs";
import {makeV2Rows,corpusHash} from "./evaluate-reader-holdout-v2.mjs";
import {pilotRows} from "./evaluate-reader-gum-pilot.mjs";
import {scoredAuditRows} from "./audit-reader-gum-pilot.mjs";
import {alignModelScores,assignExplicitRules,trainFusion}
 from "./evaluate-reader-fusion.mjs";
import {originalProbeRows,attachPriorHoldoutScores,signalCacheFingerprint,
 obtainSemanticSignals,addSemanticFeatures,groupedFamilyFolds}
 from "./evaluate-reader-semantic-fusion.mjs";
import {attachLexicalFeatures,CONFIGURATIONS}
 from "./evaluate-reader-nonlinear-fusion.mjs";
import {sentencePair} from "../extension/src/reader-semantic-signals.mjs";
import {explicitBoundaryConnector}
 from "../extension/src/reader-connector-normalisation.mjs";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const LOCAL=(file)=>path.join(root,"evaluation",file);
const LABELS=["keep","and","but"];
const CORE=CONFIGURATIONS["linear+lexical"].keys;
const only=fn=>CORE.filter(fn);
export const ABLATIONS=Object.freeze({
 "baseline":Object.freeze([...CORE]),
 "minus-bertPeriod":Object.freeze(only(k=>k!=="bertPeriod")),
 "minus-bertPeriod-bertHyphen":Object.freeze(only(k=>!["bertPeriod","bertHyphen"].includes(k))),
 "minus-all-bert-punctuation":Object.freeze(only(k=>!["bertPeriod","bertHyphen","bertSo"].includes(k))),
 "minus-nli":Object.freeze(only(k=>!k.startsWith("nli"))),
 "gpt-semantic-lexical":Object.freeze(only(k=>k.startsWith("gpt")||k.startsWith("semantic")||k.startsWith("lexical"))),
 "no-bert-and-no-nli":Object.freeze(only(k=>k.startsWith("gpt")||k.startsWith("semantic")||k.startsWith("lexical")))
});
export const ABLATION_VERSION="reader-fusion-ablation-v1";
const KEY=r=>JSON.stringify([r.id,r.offset]);
const PCT=n=>n==null?"n/a":(100*n).toFixed(1)+"%";
const FILES={
 oldJoin:LOCAL("reader-join-cross-validation.json"),
 oldMask:LOCAL("reader-mask-infill.json"),
 oldDataset:LOCAL("reader-strategy-synthetic-reference.json"),
 v1Scores:LOCAL("reader-holdout-v1-scores.json"),
 oldSemantic:LOCAL("reader-semantic-pair-scores.json"),
 gumPilot:LOCAL("reader-gum-pilot-v1.json"),
 gumResults:LOCAL("reader-gum-pilot-results.json"),
 gumLanguage:LOCAL("reader-gum-pilot-lm-scores.json"),
 gumSemantic:LOCAL("reader-gum-pilot-semantic-scores.json"),
 v2Language:LOCAL("reader-holdout-v2-lm-scores.json"),
 v2Semantic:LOCAL("reader-holdout-v2-semantic-scores.json"),
 v2Results:LOCAL("reader-holdout-v2-results.json"),
 output:LOCAL("reader-gum-feature-ablations.json")
};
const numeric=x=>typeof x==="number"&&Number.isFinite(x);
async function json(file){return JSON.parse(await readFile(file,"utf8"));}
export function evaluatePredictions(rows,predict){
 if(!Array.isArray(rows)||!rows.length||typeof predict!=="function")
  throw Error("Rows and classifier required");
 const matrix=Object.fromEntries(LABELS.map(g=>[
  g,Object.fromEntries(LABELS.map(p=>[p,0]))]));
 const predictions=rows.map(r=>{
  const predicted=r.explicit?.choice??predict(r);
  if(!LABELS.includes(predicted)||!LABELS.includes(r.gold))
   throw Error("Invalid predicted/gold label");
  matrix[r.gold][predicted]++;
  return {id:r.id,offset:r.offset,genre:r.genre??r.domain??null,
   relation:r.relation??r.challenge??null,gold:r.gold,predicted};
 });
 const count=predictions.length;
 const correct=LABELS.reduce((s,k)=>s+matrix[k][k],0);
 const support=Object.fromEntries(LABELS.map(k=>
  [k,LABELS.reduce((s,p)=>s+matrix[k][p],0)]));
 const recall=Object.fromEntries(LABELS.map(k=>[
  k,support[k]?matrix[k][k]/support[k]:null
 ]));
 const present=LABELS.filter(k=>support[k]);
 return {count,correct,accuracy:correct/count,
  balancedAccuracy:present.reduce((s,k)=>s+recall[k],0)/present.length,
  recall,matrix,
  predicted:Object.fromEntries(LABELS.map(p=>[
   p,LABELS.reduce((s,k)=>s+matrix[k][p],0)])),
  // A distribution-specific score: with no gold KEEP, neither KEEP
  // precision nor 3-class accuracy can be estimated from GUM.
  goldSupport:support,predictions};
}
export function runConfigurations(train,tests){
 const configs={};
 if(!Array.isArray(train)||train.length<18)
  throw Error("A fit requires sufficient labelled development rows");
 for(const [name,features] of Object.entries(ABLATIONS)){
  const predict=trainFusion(train.filter(r=>!r.explicit),features,{balanced:true});
  configs[name]={features,
   datasets:Object.fromEntries(Object.entries(tests).map(([testName,test])=>[
    testName,evaluatePredictions(test,predict)
   ]))};
 }
 return configs;
}
function verifyBaseline(results,firstRun,syntheticV2){
 const gum=results.baseline.datasets.gum;
 if(gum.count!==250||gum.correct!==firstRun.metrics.mappedCorrect||
  gum.correct!==30||gum.predicted.keep!==firstRun.metrics.predictedKeepCount)
  throw Error("Frozen real-world baseline does not reproduce original 30/250");
 if(syntheticV2){
  const v2=results.baseline.datasets.syntheticV2;
  if(v2.count!==1000||v2.correct!==743)
   throw Error("Frozen synthetic v2 baseline does not reproduce 743/1000");
 }
}
function summarizeGroupedFolds(original,challenge){
 const partitions=groupedFamilyFolds(challenge,{folds:5,seed:20261121});
 return Object.fromEntries(Object.entries(ABLATIONS).map(([name,keys])=>{
  const predictions=[];
  for(let i=0;i<partitions.length;i++){
   const subset=partitions[i];
   const heldOut=new Set(subset.map(KEY));
   const training=[...original,...challenge.filter(r=>!heldOut.has(KEY(r)))];
   const model=trainFusion(training.filter(r=>!r.explicit),keys,{balanced:true});
   predictions.push(...subset.map(r=>({...r,predicted:r.explicit?.choice??model(r)})));
  }
  if(predictions.length!==300||new Set(predictions.map(KEY)).size!==300)
   throw Error("Grouped validation leaked, repeated or dropped v1 cases");
  const by=evaluatePredictions(predictions,r=>r.predicted);
  return [name,{count:by.count,accuracy:by.accuracy,
   balancedAccuracy:by.balancedAccuracy,correct:by.correct,recall:by.recall}];
 }));
}
async function originalTraining(){
 const [join,mask,oldDataset,v1cache]=await Promise.all([
  FILES.oldJoin,FILES.oldMask,FILES.oldDataset,FILES.v1Scores
 ].map(json));
 const originals=Array.isArray(oldDataset)?oldDataset:oldDataset.cases;
 const old=originalProbeRows(originals,
  assignExplicitRules(alignModelScores(join,mask,originals),
   (source,offset)=>explicitBoundaryConnector(source,{
    punctuationStart:offset,punctuationEnd:offset+1})));
 const v1cases=generateHoldout().cases;
 const challenge=attachPriorHoldoutScores(makeHoldoutRows(v1cases),v1cache,v1cases);
 const train=[...old,...challenge];
 for(const r of train){const pair=sentencePair(r.source,r.probe);
  r.left=pair.left;r.right=pair.right;}
 await obtainSemanticSignals(train,{file:FILES.oldSemantic,
  fingerprint:signalCacheFingerprint(train),readOnly:true,
  log:()=>{},createScorer:()=>{throw Error("No model inference permitted");}});
 const featureRows=attachLexicalFeatures(addSemanticFeatures(train));
 return {original:featureRows.slice(0,old.length),
  challenge:featureRows.slice(old.length),all:featureRows};
}
async function gumRows(){
 const [pilot,results,language,semantic]=await Promise.all([
  FILES.gumPilot,FILES.gumResults,FILES.gumLanguage,FILES.gumSemantic
 ].map(json));
 const cases=pilotRows(pilot);
 if(results.selectionHash!==pilot.meta.selectionHash)
  throw Error("GUM frozen selection hash changed");
 if(semantic.corpusFingerprint!==signalCacheFingerprint(cases))
  throw Error("GUM scored semantic cache is from a different text selection");
 return {rows:scoredAuditRows(pilot.cases,cases,results,language,semantic),
  original:results,pilot};
}
async function syntheticV2Rows(){
 const corpus=buildCorpus(await readScenarioSeeds());
 const rows=makeV2Rows(corpus.cases);
 const [lm,sem,report]=await Promise.all([
  FILES.v2Language,FILES.v2Semantic,FILES.v2Results
 ].map(json));
 if(lm.digest!==corpusHash(corpus.cases)||!Array.isArray(lm.predictions)||
  lm.predictions.length!==1000||report.corpusHash!==corpusHash(corpus.cases))
  throw Error("Synthetic v2 cache fingerprint mismatch");
 const byId=new Map(lm.predictions.map(r=>[KEY(r),r]));
 if(byId.size!==1000)throw Error("Duplicate synthetic v2 cache entries");
 for(const row of rows){
  const cached=byId.get(KEY(row));
  if(!cached||cached.source!==row.source||cached.prompt!==row.prompt)
   throw Error("Synthetic v2 language cache mismatch "+row.id);
  row.scores=cached.scores;
 }
 const index=new Map(sem.predictions.map(r=>[KEY(r),r]));
 if(sem.corpusFingerprint!==signalCacheFingerprint(rows)||index.size!==1000)
  throw Error("Synthetic v2 semantic cache mismatch");
 for(const row of rows){
  const cached=index.get(KEY(row));
  if(!cached||cached.source!==row.source||cached.left!==row.left||
   cached.right!==row.right)throw Error("Semantic source mismatch "+row.id);
  row.semantic=cached.signals;
 }
 return attachLexicalFeatures(addSemanticFeatures(rows.map(heldoutFeatures)));
}
async function main(){
 const args=process.argv.slice(2);
 if(args.includes("--help")||args.includes("-h")){
  console.log("node scripts/evaluate-reader-gum-ablations.mjs [--no-v2]\n"+
   "Uses only previously cached 402 training, 250 GUM and optional 1000 synthetic results.");
  return;
 }
 if(args.some(a=>a!=="--no-v2"))throw Error("Unrecognised ablation option");
 const t=await originalTraining(),gum=await gumRows();
 let v2=null;
 if(!args.includes("--no-v2"))v2=await syntheticV2Rows();
 const datasets={gum:gum.rows,...(v2?{syntheticV2:v2}:{})};
 const configurations=runConfigurations(t.all,datasets);
 verifyBaseline(configurations,gum.original,Boolean(v2));
 console.log("READ-ONLY FEATURE ABLATIONS — baseline reproduced (30/250"+
  (v2?", 743/1000":"")+")");
 console.log("No new model inference, no changed GUM labels or source text.");
 for(const [name,result] of Object.entries(configurations)){
  const g=result.datasets.gum;
  console.log("\n"+name+": GUM "+g.correct+"/"+g.count+" = "+PCT(g.accuracy)+
   " | AND "+PCT(g.recall.and)+" BUT "+PCT(g.recall.but)+
   " | predicted KEEP "+g.predicted.keep);
  if(v2){
   const v=result.datasets.syntheticV2;
   console.log("    Synthetic v2: "+v.correct+"/"+v.count+" = "+PCT(v.accuracy)+
    " | KEEP "+PCT(v.recall.keep)+", AND "+PCT(v.recall.and)+
    ", BUT "+PCT(v.recall.but));
  }
 }
 const grouped= summarizeGroupedFolds(t.original,t.challenge);
 console.log("\nPRIOR GROUPED DEVELOPMENT CV (already inspected):");
 for(const [name,r] of Object.entries(grouped))
  console.log("  "+name+" "+r.correct+"/300 = "+PCT(r.accuracy));
 const report={
  version:ABLATION_VERSION,classificationTask:"KEEP/AND/BUT discourse relationship",
  status:"post-hoc diagnostic; NOT an independent validation or calibrated real-world performance",
  source:"GUM mapped AND/BUT, no KEEP gold; author-made synthetic v2 separately",
  trainSource:"102 original + 300 previous labelled synthetic boundaries; balanced linear classifier",
  cacheUse:"No neural inference; original model-score caches only",
  note:"All ablation configurations specified before seeing their individual results. Never select a final model from this inspected GUM pilot without a new independent benchmark.",
  scenarios:configurations,groupedDevelopmentCV:grouped
 };
 await mkdir(path.dirname(FILES.output),{recursive:true});
 await writeFile(FILES.output,JSON.stringify(report,null,2)+"\n");
 console.log("\nSaved "+FILES.output);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
 main().catch(e=>{console.error(e?.stack||e);process.exitCode=1;});
