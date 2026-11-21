#!/usr/bin/env node
/**
 * Source-free diagnostics for two narrow structural sentence-relation cues.
 * Uses ONLY the already-inspected authentic TRAIN partition (308 cases),
 * the original 402 synthetic training cases and genuine TRAIN additions.
 *
 * node scripts/evaluate-reader-structural-contrast.mjs --preview
 * node scripts/evaluate-reader-structural-contrast.mjs --offline
 *
 * This is a POST-HOC development result, NOT fresh independent validation.
 * Output contains only numbers and cue names; no third-party text or IDs.
 */
import {readFile,writeFile,mkdir} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {trainFusion} from "./evaluate-reader-fusion.mjs";
import {transferRows,syntheticTraining,scoreBatch}
 from "./evaluate-reader-gum-transfer.mjs";
import {FEATURE_SETS,documentFolds}
 from "./evaluate-reader-gum-but-cv.mjs";
import {verifyAndPool,MIXTURE_SIZES}
 from "./build-reader-gum-and-mixtures.mjs";
import {verifyExpansion}
 from "./build-reader-gum-contrast-expansion.mjs";
import {EXPECTED_ORIGINAL_BASELINES}
 from "./evaluate-reader-conservative-but.mjs";
import {structuralContrastEvidence}
 from "../extension/src/reader-structural-contrast.mjs";

export const VERSION="reader-structural-contrast-v1";
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
 output:local("reader-structural-contrast-results-v1.json")
};
const read=p=>readFile(p,"utf8").then(JSON.parse);
const KINDS=[
 "different_subject_category_polarity",
 "finding_qualified_by_unknown_explanation"
];
const empty=()=>({correct:0,wrong:0,count:0});
export function numericComparison(rows){
 if(!Array.isArray(rows)||!rows.length)
  throw Error("Numeric comparisons require frozen predictions");
 const byKind=Object.fromEntries(KINDS.map(x=>[x,{
  total:0,byGold:{and:0,but:0},newBUT:0,unchangedBUT:0,
  helped:0,hurt:0
 }]));
 const result={cases:rows.length,baseline:empty(),withCues:empty(),
  switchedToBut:0,byKind};
 for(const r of rows){
  if(!["and","but"].includes(r.gold)||
   !["and","but","keep"].includes(r.oldChoice)||
   !["and","but","keep"].includes(r.newChoice)||
   (r.cue!==null&&!KINDS.includes(r.cue)))
   throw Error("Invalid frozen label or structural cue");
  result.baseline.count++;result.withCues.count++;
  const before=r.oldChoice===r.gold,after=r.newChoice===r.gold;
  result.baseline[before?"correct":"wrong"]++;
  result.withCues[after?"correct":"wrong"]++;
  if(r.oldChoice!==r.newChoice){
   if(r.newChoice!=="but"||!r.cue)
    throw Error("Structural cue must only promote BUT");
   result.switchedToBut++;
  }
  if(r.cue){
   const g=byKind[r.cue];g.total++;g.byGold[r.gold]++;
   if(r.newChoice!==r.oldChoice)g.newBUT++;
   else if(r.newChoice==="but")g.unchangedBUT++;
   if(!before&&after)g.helped++;
   if(before&&!after)g.hurt++;
  }
 }
 return result;
}
export function structuralCV(synthetic,original,additionalBut,additionalAnd){
 if(synthetic.length!==402||original.length!==308||
  additionalBut.length!==110||additionalAnd.length!==440)
  throw Error("Frozen dataset sizes required for source-only audit");
 const partitions=documentFolds(original),results={};
 for(const [name,keys] of Object.entries(FEATURE_SETS)){
  for(const extraAnd of MIXTURE_SIZES){
   const evaluated=[];
   for(const fold of partitions){
    const hidden=new Set(fold.documents);
    const training=[
     ...synthetic,
     ...original.filter(r=>!hidden.has(r.document)),
     ...additionalBut.filter(r=>!hidden.has(r.document)),
     ...additionalAnd.slice(0,extraAnd).filter(r=>!hidden.has(r.document))
    ].filter(r=>!r.explicit);
    if(training.some(r=>hidden.has(r.document)))
     throw Error("Source-document validation leakage");
    const fitted=trainFusion(training,keys,{balanced:true,
     classWeights:{keep:1,and:1,but:1}});
    for(const row of fold.rows){
     const oldChoice=row.explicit?.choice??fitted(row);
     const cue=row.explicit?null:structuralContrastEvidence(
      row.left,row.right);
     const reason=cue?.contrastCandidate?cue.kind:null;
     evaluated.push({gold:row.gold,oldChoice,
      newChoice:reason?"but":oldChoice,cue:reason});
    }
   }
   const aggregate=numericComparison(evaluated);
   const scenario=name+"__AND+"+extraAnd;
   const expected=EXPECTED_ORIGINAL_BASELINES[scenario];
   if(aggregate.baseline.correct!==expected)
    throw Error("Historical GUM baseline changed for "+scenario);
   results[scenario]=aggregate;
  }
 }
 return {
  version:VERSION,sourcePartition:"original 308 authentic TRAIN cases",
  originalGumCount:original.length,
  historicalEvidence:"Post-hoc inspected GDTB mappings; AND/BUT may both "+
   "be plausible. An exact human judgement is available for only a few "+
   "previously discussed cases. Not an independent quality estimate.",
  evaluatedOriginalOnly:true,
  scenarios:results
 };
}
async function main(){
 const args=process.argv.slice(2);
 if(args.includes("--help")||args.includes("-h")){
  console.log("node scripts/evaluate-reader-structural-contrast.mjs "+
   "[--preview] [--offline]");
  return;
 }
 if(args.some(x=>!["--preview","--offline"].includes(x)))
  throw Error("Unknown options");
 const [base,old,manifest,but,and]=await Promise.all([
  read(PATHS.base),read(PATHS.oldManifest),read(PATHS.newManifest),
  read(PATHS.but),read(PATHS.and)
 ]);
 verifyExpansion(but,base,old,manifest);
 verifyAndPool(and,base,old,manifest,but);
 if(args.includes("--preview")){
  console.log("Verified 308 authentic TRAIN cases and pinned additions; "+
   "no held-out test or future-reserved documents consulted.");
  return;
 }
 const synthetic=await syntheticTraining(PATHS);
 const original=(await scoreBatch(transferRows(base.train),{
  lmPath:PATHS.trainLm,semPath:PATHS.trainSem,offline:true,
  hash:base.meta.selectionHash+"|train"
 })).rows;
 const extraBut=(await scoreBatch(transferRows(but.cases),{
  lmPath:PATHS.butLm,semPath:PATHS.butSem,offline:true,
  hash:but.meta.selectionHash+"|training-only-contrast"
 })).rows;
 const extraAnd=(await scoreBatch(transferRows(and.cases),{
  lmPath:PATHS.andLm,semPath:PATHS.andSem,offline:true,
  hash:and.meta.selectionHash+"|training-only-AND-pool"
 })).rows;
 const result=structuralCV(synthetic,original,extraBut,extraAnd);
 await mkdir(path.dirname(PATHS.output),{recursive:true});
 await writeFile(PATHS.output,JSON.stringify(result,null,2)+"\n");
 for(const [name,scenario] of Object.entries(result.scenarios)){
  console.log(name+": "+scenario.baseline.correct+" -> "+
   scenario.withCues.correct+" correct / 308; "+
   scenario.switchedToBut+" new BUT predictions; "+
   "cue hits "+Object.values(scenario.byKind).map(x=>x.total).join("+"));
 }
 console.log("Numeric-only report written to "+PATHS.output);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
 main().catch(e=>{console.error(e?.stack||e);process.exitCode=1;});
