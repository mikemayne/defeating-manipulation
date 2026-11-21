#!/usr/bin/env node
/**
 * Training-only contrast expansion comparison on UNCHANGED document-CV
 * validation boundaries (the original 308 authentic GUM training rows).
 * Fit original 402 synthetic + 308 original authentic training, versus
 * those same rows plus new-only real BUT examples from separately frozen
 * training documents. Original 217-case test never scored.
 *
 * node scripts/evaluate-reader-gum-contrast-expansion.mjs --preview
 * node scripts/evaluate-reader-gum-contrast-expansion.mjs
 * node scripts/evaluate-reader-gum-contrast-expansion.mjs --offline
 */
import {readFile,writeFile,mkdir} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {trainFusion} from "./evaluate-reader-fusion.mjs";
import {evaluatePredictions} from "./evaluate-reader-gum-ablations.mjs";
import {transferRows,syntheticTraining,scoreBatch,verifyTransferCorpus}
 from "./evaluate-reader-gum-transfer.mjs";
import {documentFolds,evaluateTrainingOnlyCV,FEATURE_SETS}
 from "./evaluate-reader-gum-but-cv.mjs";
import {verifyExpansion}
 from "./build-reader-gum-contrast-expansion.mjs";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const local=x=>path.join(ROOT,"evaluation",x);
export const VERSION="reader-gum-contrast-expansion-evaluation-v1";
export const WEIGHTS=Object.freeze([1,1.4,2]);
const PATHS={
 original:local("reader-gum-transfer-v1.json"),
 oldManifest:local("reader-authentic-transfer-documents-v1.json"),
 expansionManifest:local("reader-gum-contrast-expanded-documents-v1.json"),
 expansion:local("reader-gum-contrast-expansion-v1.json"),
 oldJoin:local("reader-join-cross-validation.json"),
 oldMask:local("reader-mask-infill.json"),
 oldDataset:local("reader-strategy-synthetic-reference.json"),
 v1Scores:local("reader-holdout-v1-scores.json"),
 previousSemantic:local("reader-semantic-pair-scores.json"),
 trainLm:local("reader-gum-transfer-train-lm-v1.json"),
 trainSem:local("reader-gum-transfer-train-sem-v1.json"),
 extraLm:local("reader-gum-contrast-expansion-lm-v1.json"),
 extraSem:local("reader-gum-contrast-expansion-sem-v1.json"),
 report:local("reader-gum-contrast-expansion-cv-v1.json")
};
const pct=x=>x==null?"n/a":(100*x).toFixed(1)+"%";
async function json(p){return JSON.parse(await readFile(p,"utf8"));}
const classWeights=but=>({keep:1,and:1,but});
function options(argv){
 let preview=false,offline=false,maxErrors=4;
 for(let i=0;i<argv.length;i++){
  const a=argv[i];
  if(a==="-h"||a==="--help"){
   console.log("node scripts/evaluate-reader-gum-contrast-expansion.mjs"+
    " [--preview] [--offline] [--max-errors N]\n"+
    "Compares identical document-heldout TRAIN cases with new authentic BUT training. Original test untouched.");
   process.exit(0);
  }
  if(a==="--preview")preview=true;
  else if(a==="--offline")offline=true;
  else if(a==="--max-errors"){
   maxErrors=Number(argv[++i]);
  }else throw Error("Invalid option "+a);
 }
 if(!Number.isSafeInteger(maxErrors)||maxErrors<0||maxErrors>50)
  throw Error("Invalid error count");
 return {preview,offline,maxErrors};
}
const cat=r=>r.relation?.startsWith("comparison.contrast")?"contrast":
 r.relation?.startsWith("comparison.concession")?"concession":"other";
export function compareExpansionCV(synthetic,original,expanded,{
 folds=5,featureSets=FEATURE_SETS,weights=WEIGHTS
}={}){
 if(synthetic.length!==402||original.length<100||expanded.length<1)
  throw Error("Missing base synthetic/authentic or extra contrast training cases");
 const oldDocs=new Set(original.map(r=>r.document));
 const extraIds=new Set(),baseIds=new Set(original.map(r=>r.id));
 for(const r of expanded){
  if(r.gold!=="but"||baseIds.has(r.id)||extraIds.has(r.id)||
   !/^comparison\.(contrast|concession)(?:\.|$)/u.test(r.relation))
   throw Error("Invalid/duplicate extra BUT example "+r.id);
  extraIds.add(r.id);
 }
 const docBins=documentFolds(original,{folds});
 const originalCount=original.length;
 const result={};
 for(const [name,features] of Object.entries(featureSets)){
  for(const weight of weights){
   const basePredictions=[],newPredictions=[];
   const foldsReport=[];
   for(const fold of docBins){
    const withheld=new Set(fold.documents);
    const visible=original.filter(r=>!withheld.has(r.document));
    const extras=expanded.filter(r=>!withheld.has(r.document));
    const baseFit=[...synthetic,...visible].filter(r=>!r.explicit);
    const expandedFit=[...baseFit,...extras.filter(r=>!r.explicit)];
    if(extras.some(r=>withheld.has(r.document))||
     visible.some(r=>withheld.has(r.document)))
     throw Error("Document leakage into a CV fold");
    const opts={balanced:true,classWeights:classWeights(weight)};
    const baseline=trainFusion(baseFit,features,opts);
    const augmented=trainFusion(expandedFit,features,opts);
    const oldMeasured=evaluatePredictions(fold.rows,baseline);
    const newMeasured=evaluatePredictions(fold.rows,augmented);
    basePredictions.push(...oldMeasured.predictions);
    newPredictions.push(...newMeasured.predictions);
    foldsReport.push({
     fold:fold.fold,heldoutDocuments:fold.documents,
     validationRows:fold.rows.length,
     baseTrainingRows:visible.length,
     extraTrainingRows:extras.length,
     goldSupport:oldMeasured.goldSupport,
     originalBalanced:oldMeasured.balancedAccuracy,
     expandedBalanced:newMeasured.balancedAccuracy,
     originalRecall:oldMeasured.recall,expandedRecall:newMeasured.recall
    });
   }
   const rows=new Map(original.map(r=>[r.id,r]));
   const oldMap=new Map(basePredictions.map(p=>[p.id,p]));
   if(oldMap.size!==originalCount||
    new Set(newPredictions.map(p=>p.id)).size!==originalCount)
    throw Error("Cross-validation predictions lost or duplicated");
   const evaluate=preds=>evaluatePredictions(preds.map(p=>({
    ...rows.get(p.id),prediction:p.predicted
   })),r=>r.prediction);
   const before=evaluate(basePredictions),after=evaluate(newPredictions);
   let recovered=0,regressed=0,changed=0;
   const subtype={contrast:{support:0,originalCorrect:0,expandedCorrect:0},
    concession:{support:0,originalCorrect:0,expandedCorrect:0}};
   const changedRows=[];
   for(const p of newPredictions){
    const b=oldMap.get(p.id),row=rows.get(p.id);
    if(!b||!row||p.gold!==b.gold)throw Error("Invalid matched case "+p.id);
    if(p.predicted!==b.predicted){
     changed++;
     changedRows.push({
      id:p.id,document:row.document,relation:row.relation,gold:p.gold,
      before:b.predicted,after:p.predicted
     });
    }
    if(b.predicted!==b.gold&&p.predicted===p.gold)recovered++;
    if(b.predicted===b.gold&&p.predicted!==p.gold)regressed++;
    const subtypeKey=cat(row);
    if(row.gold==="but"&&subtypeKey in subtype){
     subtype[subtypeKey].support++;
     if(b.predicted==="but")subtype[subtypeKey].originalCorrect++;
     if(p.predicted==="but")subtype[subtypeKey].expandedCorrect++;
    }
   }
   result[name+"__but-x"+weight]={
    features:name,butMultiplier:weight,
    baseline:{
     count:before.count,correct:before.correct,accuracy:before.accuracy,
     balancedRecall:before.balancedAccuracy,recall:before.recall,
     goldSupport:before.goldSupport,predicted:before.predicted,
     confusion:before.matrix
    },
    expanded:{
     count:after.count,correct:after.correct,accuracy:after.accuracy,
     balancedRecall:after.balancedAccuracy,recall:after.recall,
     goldSupport:after.goldSupport,predicted:after.predicted,
     confusion:after.matrix
    },
    paired:{recovered,regressed,net:recovered-regressed,
     changedPredictions:changed},
    BUTSubtypes:subtype,
    folds:foldsReport,
    changedRows
   };
  }
 }
 return {validationCount:originalCount,
  unchangedValidationDocuments:docBins.map(f=>({
   fold:f.fold,documents:f.documents,rows:f.rows.length,
   AND:f.and,BUT:f.but
  })),
  newContrastTrainingCount:expanded.length,
  newSourceDocuments:new Set(expanded.map(r=>r.document)).size,
  experiments:result
 };
}
async function main(){
 const o=options(process.argv.slice(2));
 const [base,oldManifest,manifest,extra]=await Promise.all([
  json(PATHS.original),json(PATHS.oldManifest),
  json(PATHS.expansionManifest),json(PATHS.expansion)
 ]);
 verifyTransferCorpus(base);
 const v=verifyExpansion(extra,base,oldManifest,manifest);
 const original=transferRows(base.train),supplement=transferRows(extra.cases);
 const folds=documentFolds(original);
 console.log("TRAINING-ONLY AUTHENTIC CONTRAST EXPANSION — "+
  original.length+" ORIGINAL validation cases; "+supplement.length+
  " new GUM BUT training cases from "+v.newDocuments+
  " new source documents.");
 console.log("Original authentic BUT "+
  original.filter(x=>x.gold==="but").length+
  " + "+supplement.length+" extra annotated BUT. "+
  "No old 217-case GUM test scores loaded.");
 for(const fold of folds)
  console.log("  Fold "+fold.fold+": "+fold.rows.length+
   " unchanged validation cases (AND "+fold.and+", BUT "+fold.but+")");
 if(o.preview){
  console.log("Preview checked provenance, unchanged folds and disjoint source roles.");
  console.log("No model inference or score cache reads.");return;
 }
 if(!supplement.length)throw Error("No new authentic BUT examples to evaluate");
 const synthetic=await syntheticTraining(PATHS);
 const originalFeatures=(await scoreBatch(original,{
  lmPath:PATHS.trainLm,semPath:PATHS.trainSem,offline:true,
  hash:base.meta.selectionHash+"|train"
 })).rows;
 // Only the additional samples trigger new model inference and scoring.
 const newFeatures=(await scoreBatch(supplement,{
  lmPath:PATHS.extraLm,semPath:PATHS.extraSem,offline:o.offline,
  hash:extra.meta.selectionHash+"|training-only-contrast"
 })).rows;
 const stats=compareExpansionCV(synthetic,originalFeatures,newFeatures);
 // Verify the old benchmark is reproduced on identical CV boundaries.
 const expected={
  "full-fusion__but-x1":234,
  "full-fusion__but-x1.4":217,
  "full-fusion__but-x2":196,
  "no-period-hyphen__but-x1":219,
  "no-period-hyphen__but-x1.4":196,
  "no-period-hyphen__but-x2":165
 };
 for(const [name,count] of Object.entries(expected))
  if(stats.experiments[name]?.baseline.correct!==count)
   throw Error("Original training-only CV baseline changed at "+name+
    ": expected "+count+", found "+stats.experiments[name]?.baseline.correct);
 console.log("All six previously observed training-CV baselines reproduced.");
 for(const [name,r] of Object.entries(stats.experiments)){
  const b=r.baseline,a=r.expanded,p=r.paired;
  console.log("\n"+name);
  console.log("  Original: "+b.correct+"/"+b.count+
   " "+pct(b.accuracy)+" | balanced "+pct(b.balancedRecall)+
   " | AND "+pct(b.recall.and)+", BUT "+pct(b.recall.but)+
   ", predicted KEEP "+b.predicted.keep);
  console.log("  Expanded: "+a.correct+"/"+a.count+
   " "+pct(a.accuracy)+" | balanced "+pct(a.balancedRecall)+
   " | AND "+pct(a.recall.and)+", BUT "+pct(a.recall.but)+
   ", predicted KEEP "+a.predicted.keep);
  console.log("  Paired recovered "+p.recovered+
   ", regressed "+p.regressed+", net "+p.net);
  for(const [label,item] of Object.entries(r.BUTSubtypes))
   console.log("  "+label+" BUT: "+item.originalCorrect+"/"+item.support+
    " -> "+item.expandedCorrect+"/"+item.support);
  for(const change of r.changedRows.slice(0,o.maxErrors))
   console.log("  CHANGE "+change.id+" ["+change.relation+"] "+
    change.gold+" "+change.before+" -> "+change.after);
 }
 const report={
  version:VERSION,
  originalDatasetFingerprint:base.meta.selectionHash,
  contrastExpansionFingerprint:extra.meta.selectionHash,
  originalTrainRows:original.length,
  originalBUT:original.filter(x=>x.gold==="but").length,
  expandedBUT:supplement.length,
  constraints:"Training-only post-hoc diagnostic, fixed document folds, original 217-case test never scored. Source documents disjoint. No authentic KEEP gold, no deployment or tuning of the implicit conclusion phase.",
  stats
 };
 await mkdir(path.dirname(PATHS.report),{recursive:true});
 await writeFile(PATHS.report,JSON.stringify(report,null,2)+"\n");
 console.log("Saved "+PATHS.report+" (local; gitignored).");
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
 main().catch(e=>{console.error(e?.stack||e);process.exitCode=1;});
