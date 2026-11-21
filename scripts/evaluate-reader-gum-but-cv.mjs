#!/usr/bin/env node
/**
 * Development-only BUT-loss-weight experiment on the NEW authentic training
 * partition of GUM. Never reads the previously inspected 217-case test score
 * caches or fits on a held-out document's labels.
 *
 * Usage:
 *   node scripts/evaluate-reader-gum-but-cv.mjs --preview
 *   node scripts/evaluate-reader-gum-but-cv.mjs
 *
 * Requires local GUM transfer TRAINING caches from an earlier transfer run.
 * No neural inference. No model is written to production.
 */
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {createHash} from "node:crypto";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {trainFusion} from "./evaluate-reader-fusion.mjs";
import {evaluatePredictions,ABLATIONS} from "./evaluate-reader-gum-ablations.mjs";
import {syntheticTraining,scoreBatch,verifyTransferCorpus,transferRows}
 from "./evaluate-reader-gum-transfer.mjs";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const local=n=>path.join(ROOT,"evaluation",n);
export const VERSION="reader-gum-training-only-but-cv-v1";
export const BUT_MULTIPLIERS=Object.freeze([1,1.4,2,3]);
export const FEATURE_SETS=Object.freeze({
 "full-fusion":ABLATIONS.baseline,
 "no-period-hyphen":ABLATIONS["minus-bertPeriod-bertHyphen"]
});
const TRAIN=Object.freeze({
 corpus:local("reader-gum-transfer-v1.json"),
 oldJoin:local("reader-join-cross-validation.json"),
 oldMask:local("reader-mask-infill.json"),
 oldDataset:local("reader-strategy-synthetic-reference.json"),
 v1Scores:local("reader-holdout-v1-scores.json"),
 previousSemantic:local("reader-semantic-pair-scores.json"),
 trainLm:local("reader-gum-transfer-train-lm-v1.json"),
 trainSem:local("reader-gum-transfer-train-sem-v1.json"),
 output:local("reader-gum-training-only-but-cv-v1.json")
});
const sha=x=>createHash("sha256").update(String(x)).digest("hex");
const pct=x=>x==null?"n/a":(100*x).toFixed(1)+"%";
const json=async p=>JSON.parse(await readFile(p,"utf8"));
const weights=but=>({keep:1,and:1,but});
const key=x=>String(x.document);

/**
 * Deterministic document-wise, label-stratified folds using ONLY available
 * training partition labels (not the separate 217-case external holdout).
 * Group placement balances BUT support and then total row count.
 */
export function documentFolds(realRows,{folds=5}={}){
 if(!Array.isArray(realRows)||!Number.isSafeInteger(folds)||folds<2||folds>10)
  throw Error("Invalid document-fold configuration");
 const docs=new Map();
 for(const r of realRows){
  if(!r.document||!["and","but"].includes(r.gold))
   throw Error("Authentic CV rows require a document and AND/BUT gold");
  if(!docs.has(key(r)))docs.set(key(r),[]);
  docs.get(key(r)).push(r);
 }
 if(docs.size<folds*2)throw Error("Too few source documents for folds");
 const sorted=[...docs].map(([id,items])=>({
  id,items,but:items.filter(x=>x.gold==="but").length,size:items.length
 })).sort((a,b)=>b.but-a.but||b.size-a.size||
  sha(a.id).localeCompare(sha(b.id)));
 const groups=Array.from({length:folds},(_,i)=>({
  fold:i+1,documents:[],rows:[],but:0,and:0
 }));
 for(const [i,doc] of sorted.entries()){
  // Seed all folds before balancing. NO source document is split.
  const choices=i<folds?[groups[i]]:groups;
  const chosen=[...choices].sort((a,b)=>
   a.but-b.but||
   a.rows.length-b.rows.length||
   a.documents.length-b.documents.length||
   a.fold-b.fold)[0];
  chosen.documents.push(doc.id);
  chosen.rows.push(...doc.items);
  chosen.but+=doc.but;
  chosen.and+=doc.size-doc.but;
 }
 const seen=new Set();
 for(const group of groups){
  if(!group.rows.length)throw Error("Empty authentic validation fold");
  for(const name of group.documents){
   if(seen.has(name))throw Error("A source document was assigned twice");
   seen.add(name);
  }
 }
 if(seen.size!==docs.size)throw Error("A source document was omitted");
 const target=realRows.length,assigned=groups.reduce((s,x)=>s+x.rows.length,0);
 if(target!==assigned)throw Error("Some authentic training cases were dropped");
 return groups;
}
export function evaluateTrainingOnlyCV(synthetic,real,{
 folds=5,featureSets=FEATURE_SETS,multipliers=BUT_MULTIPLIERS
}={}){
 if(!Array.isArray(synthetic)||synthetic.length!==402||
  !Array.isArray(real)||real.length<100)
  throw Error("Expected frozen 402 synthetic cases and authentic TRAIN rows");
 const documents=documentFolds(real,{folds});
 const summaries={};
 const positive=synthetic.filter(x=>!x.explicit);
 if(["keep","and","but"].some(label=>!positive.some(x=>x.gold===label)))
  throw Error("Synthetic training lacks a KEEP/AND/BUT class");
 for(const [featureName,features] of Object.entries(featureSets)){
  for(const multiplier of multipliers){
   if(!Number.isFinite(multiplier)||multiplier<=0||multiplier>10)
    throw Error("Invalid fixed BUT loss multiplier");
   const predictions=[],foldSummary=[];
   for(const fold of documents){
    const hidden=new Set(fold.documents);
    const visible=real.filter(r=>!hidden.has(r.document));
    const combined=[...positive,...visible].filter(r=>!r.explicit);
    if(!combined.length||visible.some(r=>hidden.has(r.document)))
     throw Error("Training/test document leakage");
    const model=trainFusion(combined,features,{
     balanced:true,classWeights:weights(multiplier)
    });
    const measured=evaluatePredictions(fold.rows,model);
    foldSummary.push({
     fold:fold.fold,sourceDocuments:fold.documents.length,
     heldoutDocuments:fold.documents.slice(),testCount:measured.count,
     trainingRealRows:visible.length,
     support:measured.goldSupport,correct:measured.correct,
     accuracy:measured.accuracy,balancedRecall:measured.balancedAccuracy,
     recall:measured.recall
    });
    predictions.push(...measured.predictions);
   }
   const goldRows=new Map(real.map(r=>[r.id,r]));
   if(predictions.length!==real.length||
    new Set(predictions.map(p=>p.id)).size!==real.length)
    throw Error("Cross-validation lost or duplicated training examples");
   const final=evaluatePredictions(predictions.map(p=>({
    ...goldRows.get(p.id),predicted:p.predicted
   })),row=>row.predicted);
   const id=featureName+"__but-x"+multiplier;
   summaries[id]={
    features:featureName,butWeightMultiplier:multiplier,
    pooled:{count:final.count,correct:final.correct,accuracy:final.accuracy,
     balancedRecall:final.balancedAccuracy,recall:final.recall,
     goldSupport:final.goldSupport,predicted:final.predicted,
     matrix:final.matrix},
    folds:foldSummary,
    // No test text and no source content in these diagnostics.
    predictions:predictions.map(p=>({
     id:p.id,document:goldRows.get(p.id).document,
     gold:p.gold,predicted:p.predicted
    }))
   };
  }
 }
 // Tune ONLY on these document-separated training folds. Small fold counts
 // make these estimates noisy; tie-break toward a LESS extreme multiplier.
 const ranked=Object.entries(summaries).sort(([a,x],[b,y])=>
  y.pooled.balancedRecall-x.pooled.balancedRecall||
  y.pooled.recall.but-x.pooled.recall.but||
  x.butWeightMultiplier-y.butWeightMultiplier||
  a.localeCompare(b));
 return {
  folds:documents.map(x=>({
   fold:x.fold,sourceDocuments:x.documents.slice(),
   rows:x.rows.length,AND:x.and,BUT:x.but
  })),
  experiments:summaries,
  bestOnTrainingCV:{
   id:ranked[0][0],featureSet:ranked[0][1].features,
   butWeightMultiplier:ranked[0][1].butWeightMultiplier,
   balancedRecall:ranked[0][1].pooled.balancedRecall,
   note:"TRAINING CV ONLY: not a held-out test result or a production choice."
  }
 };
}
async function main(){
 const args=process.argv.slice(2);
 if(args.includes("--help")||args.includes("-h")){
  console.log("node scripts/evaluate-reader-gum-but-cv.mjs [--preview]\n"+
   "Document-grouped BUT loss-weight training-only CV. No neural inference.");
  return;
 }
 if(args.some(x=>x!=="--preview"))throw Error("Unknown option");
 const corpus=await json(TRAIN.corpus);
 verifyTransferCorpus(corpus);
 const rows=transferRows(corpus.train);
 const foldPreview=documentFolds(rows);
 console.log("AUTHENTIC GUM TRAINING-ONLY BUT CV — "+rows.length+
  " real training examples from "+
  new Set(rows.map(x=>x.document)).size+" contributing documents");
 console.log("Original 217-case held-out test set is NOT scored or fitted here.");
 for(const fold of foldPreview)
  console.log("  Fold "+fold.fold+": "+fold.rows.length+
   " boundaries from "+fold.documents.length+" docs; AND "+
   fold.and+", BUT "+fold.but);
 if(args.includes("--preview")){
  console.log("Preview only; no neural inference or model-score cache required.");
  return;
 }
 const synthetic=await syntheticTraining(TRAIN);
 const scored=await scoreBatch(rows,{
  lmPath:TRAIN.trainLm,semPath:TRAIN.trainSem,offline:true,
  hash:corpus.meta.selectionHash+"|train"
 });
 const results=evaluateTrainingOnlyCV(synthetic,scored.rows);
 console.log("\nDocument-grouped TRAINING CV results (pooled AND/BUT only):");
 for(const [id,x] of Object.entries(results.experiments)){
  const m=x.pooled;
  console.log("  "+id+": "+m.correct+"/"+m.count+" "+pct(m.accuracy)+
   " | balanced "+pct(m.balancedRecall)+
   " | AND "+pct(m.recall.and)+", BUT "+pct(m.recall.but)+
   ", predicted KEEP "+m.predicted.keep);
 }
 console.log("\nBest on training CV (exploratory): "+
  results.bestOnTrainingCV.id+
  " balanced "+pct(results.bestOnTrainingCV.balancedRecall));
 const report={
  version:VERSION,
  sourceSelectionHash:corpus.meta.selectionHash,
  source:"GUM 308 mapped AND/BUT authentic TRAIN cases; original 402 synthetic",
  constraints:"Held-out 217 GUM cases never read. No gold KEEP in authentic CV. Models and weights are diagnostics, not deployed.",
  results
 };
 await mkdir(path.dirname(TRAIN.output),{recursive:true});
 await writeFile(TRAIN.output,JSON.stringify(report,null,2)+"\n");
 console.log("Saved "+TRAIN.output+" (local only).");
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
 main().catch(e=>{console.error(e?.stack||e);process.exitCode=1;});
