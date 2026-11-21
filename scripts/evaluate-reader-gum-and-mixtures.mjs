#!/usr/bin/env node
/**
 * Measure genuine AND/BUT training mixture, not just a BUT weight effect.
 * The frozen original 308 authentic TRAIN cases are always the validation
 * targets in the exact same 5 document-disjoint folds as prior experiments.
 * The 217-case test and 39 reserved documents are never scored.
 *
 * node scripts/evaluate-reader-gum-and-mixtures.mjs --preview
 * node scripts/evaluate-reader-gum-and-mixtures.mjs
 * node scripts/evaluate-reader-gum-and-mixtures.mjs --offline
 */
import {readFile,writeFile,mkdir} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {trainFusion} from "./evaluate-reader-fusion.mjs";
import {evaluatePredictions} from "./evaluate-reader-gum-ablations.mjs";
import {transferRows,syntheticTraining,scoreBatch}
 from "./evaluate-reader-gum-transfer.mjs";
import {documentFolds,FEATURE_SETS}
 from "./evaluate-reader-gum-but-cv.mjs";
import {verifyAndPool,MIXTURE_SIZES}
 from "./build-reader-gum-and-mixtures.mjs";
import {verifyExpansion}
 from "./build-reader-gum-contrast-expansion.mjs";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const local=n=>path.join(ROOT,"evaluation",n);
export const VERSION="reader-gum-and-mixtures-eval-v1";
export const WEIGHT=1;
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
 report:local("reader-gum-and-mixtures-cv-v1.json")
};
const pct=x=>x==null?"n/a":(100*x).toFixed(1)+"%";
const json=async p=>JSON.parse(await readFile(p,"utf8"));
const classify=r=>r.gold==="but"?
 r.relation?.startsWith("comparison.contrast")?"contrast":
 r.relation?.startsWith("comparison.concession")?"concession":"otherBUT":
 r.relation?.startsWith("expansion.")?"expansion":
 r.relation?.startsWith("temporal.")?"temporal":
 r.relation?.startsWith("contingency.")?"causal":"otherAND";
function opts(args){
 let preview=false,offline=false,maxErrors=5;
 for(let i=0;i<args.length;i++){
  const a=args[i];
  if(a==="-h"||a==="--help"){
   console.log("node scripts/evaluate-reader-gum-and-mixtures.mjs "+
    "[--preview] [--offline] [--max-errors N]\n"+
    "Same original five authentic training folds. AND additions 0/110/220/440; unchanged 110 BUT and weight=1.");
   process.exit(0);
  }
  if(a==="--preview")preview=true;
  else if(a==="--offline")offline=true;
  else if(a==="--max-errors")maxErrors=Number(args[++i]);
  else throw Error("Unknown option "+a);
 }
 if(!Number.isSafeInteger(maxErrors)||maxErrors<0||maxErrors>50)
  throw Error("Invalid --max-errors");
 return {preview,offline,maxErrors};
}
function shape(m){
 return {count:m.count,correct:m.correct,accuracy:m.accuracy,
  balancedRecall:m.balancedAccuracy,recall:m.recall,
  goldSupport:m.goldSupport,predicted:m.predicted,confusion:m.matrix};
}
function categoryRecall(rows,old,now){
 const before=new Map(old.predictions.map(x=>[x.id,x]));
 const after=new Map(now.predictions.map(x=>[x.id,x]));
 const counts={};
 for(const r of rows){
  const k=classify(r);
  if(!counts[k])counts[k]={support:0,baselineCorrect:0,mixtureCorrect:0};
  const item=counts[k];
  item.support++;
  if(before.get(r.id)?.predicted===r.gold)item.baselineCorrect++;
  if(after.get(r.id)?.predicted===r.gold)item.mixtureCorrect++;
 }
 return counts;
}
/** All corrections/regressions reference the SAME 308 validation examples. */
export function compareAndMixturesCV(synthetic,original,extraBut,extraAnd,{
 folds=5,featureSets=FEATURE_SETS,sizes=MIXTURE_SIZES
}={}){
 if(!Array.isArray(synthetic)||synthetic.length!==402||
  !Array.isArray(original)||original.length<100||
  !Array.isArray(extraBut)||!extraBut.length||
  !Array.isArray(extraAnd)||extraAnd.length<Math.max(...sizes))
  throw Error("Expected original training cases and complete extra AND/BUT scores");
 if(JSON.stringify(sizes)!==JSON.stringify(MIXTURE_SIZES))
  throw Error("Mixture sizes must stay frozen at 0/110/220/440");
 const originalIds=new Set(original.map(r=>r.id));
 const occupied=new Set(originalIds);
 for(const [collection,cls] of [[extraBut,"but"],[extraAnd,"and"]]){
  const pairSet=new Set();
  for(const x of collection){
   if(x.gold!==cls||occupied.has(x.id)||!x.document||
    !Number.isFinite(x.features?.gptQuality))
    throw Error("Invalid additional "+cls+" training row "+x.id);
   // Source equality is checked in the builder; ID uniqueness is enforced
   // again here so no repeated example is silently given extra weight.
   const pair=x.document+"|"+x.source?.toLowerCase();
   if(pairSet.has(pair))throw Error("Duplicate source pair in extra "+cls+" rows");
   pairSet.add(pair);occupied.add(x.id);
  }
 }
 const docBins=documentFolds(original,{folds});
 const details={};
 for(const [featureName,features] of Object.entries(featureSets)){
  const states={};
  const baseline=null;
  for(const n of sizes){
   const prediction=[],foldOutput=[];
   for(const fold of docBins){
    const hidden=new Set(fold.documents);
    const visible=original.filter(r=>!hidden.has(r.document));
    const but=extraBut.filter(r=>!hidden.has(r.document));
    const and=extraAnd.slice(0,n).filter(r=>!hidden.has(r.document));
    const fitRows=[...synthetic,...visible,...but,...and]
     .filter(r=>!r.explicit);
    if(fitRows.some(r=>hidden.has(r.document)))
     throw Error("Held-out document entered classifier training");
    const model=trainFusion(fitRows,features,{
     balanced:true,classWeights:{keep:1,and:1,but:WEIGHT}
    });
    const measured=evaluatePredictions(fold.rows,model);
    prediction.push(...measured.predictions);
    foldOutput.push({
     fold:fold.fold,sourceDocuments:fold.documents.slice(),
     validationRows:measured.count,
     addedBUTTraining:but.length,addedANDTraining:and.length,
     originalVisibleTraining:visible.length,
     balancedRecall:measured.balancedAccuracy,recall:measured.recall,
     correct:measured.correct,ANDSupport:measured.goldSupport.and,
     BUTSupport:measured.goldSupport.but
    });
   }
   const byId=new Map(original.map(r=>[r.id,r]));
   if(prediction.length!==original.length||
    new Set(prediction.map(x=>x.id)).size!==original.length)
    throw Error("Missing/duplicate CV predictions for mixture "+n);
   const scored=evaluatePredictions(prediction.map(p=>({
    ...byId.get(p.id),predicted:p.predicted
   })),r=>r.predicted);
   states[n]={metrics:shape(scored),predictions:scored.predictions,folds:foldOutput};
  }
  const initial=states[0],basePred=new Map(initial.predictions.map(x=>[x.id,x]));
  for(const n of sizes){
   const curr=states[n],paired={recovered:0,regressed:0,net:0,
    changedPredictions:0},changes=[];
   for(const p of curr.predictions){
    const old=basePred.get(p.id);
    if(!old||old.gold!==p.gold)throw Error("Paired validation mismatch");
    if(old.predicted!==p.predicted){
     paired.changedPredictions++;
     changes.push({
      id:p.id,genre:p.genre,relation:p.relation,gold:p.gold,
      before:old.predicted,after:p.predicted
     });
    }
    if(old.predicted!==old.gold&&p.predicted===p.gold)paired.recovered++;
    if(old.predicted===old.gold&&p.predicted!==p.gold)paired.regressed++;
   }
   paired.net=paired.recovered-paired.regressed;
   details[featureName+"__AND+"+n]={
    featureSet:featureName,addedBUT:extraBut.length,addedAND:n,
    weight:WEIGHT,metrics:curr.metrics,
    reference:initial.metrics,paired,
    categoryRecall:categoryRecall(original,initial,curr),
    folds:curr.folds,changedRows:changes
   };
  }
 }
 return {
  validationCount:original.length,
  folds:docBins.map(f=>({fold:f.fold,
   documents:f.documents.slice(),count:f.rows.length,
   AND:f.and,BUT:f.but})),
  originalAuthentic:original.length,addedBUT:extraBut.length,
  andPool:extraAnd.length,mixtures:sizes,
  experiments:details
 };
}
async function main(){
 const o=opts(process.argv.slice(2));
 const [base,old,planned,but,and]=await Promise.all([
  json(PATHS.base),json(PATHS.oldManifest),json(PATHS.newManifest),
  json(PATHS.but),json(PATHS.and)
 ]);
 verifyExpansion(but,base,old,planned);
 const verified=verifyAndPool(and,base,old,planned,but);
 const initial=transferRows(base.train),butRows=transferRows(but.cases);
 const andRows=transferRows(and.cases);
 const folds=documentFolds(initial);
 console.log("AUTHENTIC AND MIXTURES — "+andRows.length+" NEW AND, "+
  butRows.length+" fixed BUT, "+initial.length+" fixed validation cases.");
 console.log("Source documents "+verified.documents+" contributing AND; "+
  "original 217-case test and 39 reserved documents untouched.");
 for(const fold of folds)
  console.log("  Fold "+fold.fold+": "+fold.rows.length+
   " original boundaries (AND "+fold.and+", BUT "+fold.but+")");
 if(o.preview){
  console.log("Preview checks complete. No neural inference or score caches read.");
  return;
 }
 const synthetic=await syntheticTraining(PATHS);
 const authentic=(await scoreBatch(initial,{
  lmPath:PATHS.trainLm,semPath:PATHS.trainSem,offline:true,
  hash:base.meta.selectionHash+"|train"
 })).rows;
 const butScored=(await scoreBatch(butRows,{
  lmPath:PATHS.butLm,semPath:PATHS.butSem,offline:true,
  hash:but.meta.selectionHash+"|training-only-contrast"
 })).rows;
 // Only the 440 genuinely new AND sentence pairs need model inference.
 const andScored=(await scoreBatch(andRows,{
  lmPath:PATHS.andLm,semPath:PATHS.andSem,offline:o.offline,
  hash:and.meta.selectionHash+"|training-only-AND-pool"
 })).rows;
 const comparison=compareAndMixturesCV(synthetic,authentic,butScored,andScored);
 // Abort if the already OBSERVED expanded-BUT-only classifier changed.
 for(const [name,expected] of Object.entries({
  "full-fusion__AND+0":187,"no-period-hyphen__AND+0":175
 })){
  const observed=comparison.experiments[name]?.metrics.correct;
  if(observed!==expected)
   throw Error("Historical unchanged-BUT-only baseline mismatch "+name+
    ": expected "+expected+", found "+observed);
 }
 console.log("Original 110-BUT-only CV baselines reproduced (187/308, 175/308).");
 for(const [name,item] of Object.entries(comparison.experiments)){
  const m=item.metrics,p=item.paired;
  console.log("\n"+name+": "+m.correct+"/"+m.count+" "+
   pct(m.accuracy)+" | balanced "+pct(m.balancedRecall)+
   " | AND "+pct(m.recall.and)+", BUT "+pct(m.recall.but)+
   ", KEEP predictions "+m.predicted.keep);
  console.log("  Against 110-BUT-only: recovered "+p.recovered+
   ", regressed "+p.regressed+", net "+p.net);
  for(const [kind,group] of Object.entries(item.categoryRecall)){
   console.log("  "+kind+": "+group.baselineCorrect+"/"+group.support+
    " -> "+group.mixtureCorrect+"/"+group.support);
  }
  for(const c of item.changedRows.slice(0,o.maxErrors))
   console.log("  CHANGED "+c.id+" "+c.gold+" "+c.before+" -> "+
    c.after+" ["+c.relation+"]");
 }
 const report={
  version:VERSION,sourceRevision:but.meta.sourceRevision,
  originalSelectionHash:base.meta.selectionHash,
  butSelectionHash:but.meta.selectionHash,
  andSelectionHash:and.meta.selectionHash,
  restrictions:"Post-hoc training-only CV on original 308 GUM train examples; new AND/BUT are from pre-pinned training sources. Original 217-case test never scored, 39 future documents untouched. No authentic KEEP gold or deployment.",
  comparison
 };
 await mkdir(path.dirname(PATHS.report),{recursive:true});
 await writeFile(PATHS.report,JSON.stringify(report,null,2)+"\n");
 console.log("\nSaved "+PATHS.report+" (gitignored local result).");
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
 main().catch(e=>{console.error(e?.stack||e);process.exitCode=1;});
