#!/usr/bin/env node
/**
 * Conservative BUT decision experiment. No retraining threshold on old
 * 217-case GUM test or 39 reserved GUM future documents. Fits only on the
 * previously inspected training data, evaluating unchanged 308 original
 * authentic GUM training examples in five DOCUMENT-disjoint folds.
 *
 * node scripts/evaluate-reader-conservative-but.mjs --preview
 * node scripts/evaluate-reader-conservative-but.mjs
 * node scripts/evaluate-reader-conservative-but.mjs --offline
 *
 * Neural features are read from existing local score caches; NO inference.
 */
import {readFile,writeFile,mkdir} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {trainFusion} from "./evaluate-reader-fusion.mjs";
import {transferRows,syntheticTraining,scoreBatch}
 from "./evaluate-reader-gum-transfer.mjs";
import {documentFolds,FEATURE_SETS}
 from "./evaluate-reader-gum-but-cv.mjs";
import {verifyAndPool,MIXTURE_SIZES}
 from "./build-reader-gum-and-mixtures.mjs";
import {verifyExpansion}
 from "./build-reader-gum-contrast-expansion.mjs";
import {POLICIES,conservativeButDecision,scoreButOutcomes,
 separationMetrics,VERSION as GATE_VERSION}
 from "./reader-conservative-but-decision.mjs";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const local=n=>path.join(ROOT,"evaluation",n);
export const VERSION="reader-conservative-but-cv-v1";
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
 report:local("reader-conservative-but-cv-v1.json")
};
const json=async p=>JSON.parse(await readFile(p,"utf8"));
const pct=n=>n===null?"n/a":(100*n).toFixed(1)+"%";
export const EXPECTED_ORIGINAL_BASELINES=Object.freeze({
 "full-fusion__AND+0":187,
 "full-fusion__AND+110":213,
 "full-fusion__AND+220":228,
 "full-fusion__AND+440":237,
 "no-period-hyphen__AND+0":175,
 "no-period-hyphen__AND+110":202,
 "no-period-hyphen__AND+220":221,
 "no-period-hyphen__AND+440":232
});
function options(argv){
 let preview=false,offline=false;
 for(const a of argv){
  if(a==="--help"||a==="-h"){
   console.log("node scripts/evaluate-reader-conservative-but.mjs"+
    " [--preview] [--offline]\n"+
    "Experiment only: score threshold sweep for high-precision BUT, no new neural inference.");
   process.exit(0);
  }
  if(a==="--preview")preview=true;
  else if(a==="--offline")offline=true;
  else throw Error("Unknown option "+a);
 }
 return {preview,offline};
}
function validateSources(original,but,and){
 if(!Array.isArray(original)||original.length<100||
  !Array.isArray(but)||!but.length||
  !Array.isArray(and)||and.length!==440)
  throw Error("Missing original training or expanded data");
 const all=new Set();
 const paired=new Set();
 for(const [cases,expected] of [[original,null],[but,"but"],[and,"and"]]){
  for(const row of cases){
   if(!row.id||all.has(row.id)||!row.document||
    (expected&&row.gold!==expected))
    throw Error("Duplicate ID, missing document, or invalid addition class");
   all.add(row.id);
   const pair=row.document+"|"+row.source?.toLowerCase();
   if(paired.has(pair))
    throw Error("Repeated sentence pair across authentic training groups");
   paired.add(pair);
  }
 }
}
/**
 * Explicit connector decisions belong to the established reader rule layer,
 * BEFORE an optional score-based BUT gate. Earlier GUM CV uses exactly
 * row.explicit?.choice ?? classifier(row); respect that precedence here.
 */
export function decideWithExplicit(explicitChoice,scores,policy){
 if(explicitChoice!==null&&explicitChoice!==undefined){
  if(!["keep","and","but"].includes(explicitChoice))
   throw Error("Unknown explicit connector decision");
  return {choice:explicitChoice,advisory:null,
   butScore:scores.but,butMargin:scores.but-Math.max(scores.keep,scores.and)};
 }
 return conservativeButDecision(scores,policy);
}
export function evaluateConservativeCV(synthetic,original,but,and,{
 featureSets=FEATURE_SETS,sizes=MIXTURE_SIZES,policies=POLICIES,
 folds=5
}={}){
 if(!Array.isArray(synthetic)||synthetic.length!==402)
  throw Error("Frozen 402-case synthetic train scores required");
 if(JSON.stringify(sizes)!==JSON.stringify(MIXTURE_SIZES)||
  policies.some(p=>!p.id||!Number.isFinite(p.minButScore)||
   !Number.isFinite(p.minButMargin)))
  throw Error("Invalid fixed threshold / mixture protocol");
 validateSources(original,but,and);
 const partitions=documentFolds(original,{folds});
 const outcomes={};
 for(const [featureSet,keys] of Object.entries(featureSets)){
  for(const n of sizes){
   const outOfFold=[];
   const foldReports=[];
   for(const fold of partitions){
    const held=new Set(fold.documents);
    const visible=original.filter(r=>!held.has(r.document));
    const extraBut=but.filter(r=>!held.has(r.document));
    const extraAnd=and.slice(0,n).filter(r=>!held.has(r.document));
    const training=[...synthetic,...visible,...extraBut,...extraAnd]
     .filter(r=>!r.explicit);
    if(training.some(r=>held.has(r.document)))
     throw Error("Heldout document entered classifier training");
    const classifier=trainFusion(training,keys,{balanced:true,
     classWeights:{keep:1,and:1,but:1}});
    for(const row of fold.rows){
     const scores=classifier.probabilities(row);
     // The previous evaluator gives direct connector decisions precedence.
     // Omitting that override changed one historical prediction in the
     // original 308-row CV (188 instead of the verified 187).
     const explicitChoice=row.explicit?.choice??null;
     const originalChoice=explicitChoice??classifier(row);
     const passthrough=decideWithExplicit(explicitChoice,scores,POLICIES[0]);
     if(passthrough.choice!==originalChoice)
      throw Error("Conservative gate changed historical reader decision");
     outOfFold.push({
      id:row.id,document:row.document,relation:row.relation,
      gold:row.gold,scores,oldChoice:originalChoice,
      explicitChoice,butScore:scores.but
     });
    }
    foldReports.push({
     fold:fold.fold,documents:fold.documents.slice(),
     trainingOriginal:visible.length,trainingBUT:extraBut.length,
     trainingAND:extraAnd.length,validation:fold.rows.length,
     andSupport:fold.and,butSupport:fold.but
    });
   }
   if(outOfFold.length!==original.length||
    new Set(outOfFold.map(r=>r.id)).size!==original.length)
    throw Error("Out-of-fold validation rows missing/duplicated");
   const ranked=separationMetrics(outOfFold);
   const experiments={};
   for(const policy of policies){
    const decisions=outOfFold.map(r=>{
     const result=decideWithExplicit(r.explicitChoice,r.scores,policy);
     return {...r,predicted:result.choice,advisory:result.advisory,
      butMargin:result.butMargin};
    });
    const statistics=scoreButOutcomes(decisions);
    experiments[policy.id]={
     policy:{...policy},metrics:statistics,
     // Numeric scores only; no copied third-party text in report.
     changes:decisions.filter(r=>r.predicted!==r.oldChoice)
      .map(r=>({id:r.id,document:r.document,relation:r.relation,
       gold:r.gold,from:r.oldChoice,to:r.predicted,
       advisory:r.advisory,butScore:r.butScore,butMargin:r.butMargin}))
    };
   }
   // The conservative policy may REDUCE BUT predictions but must NEVER
   // create a new BUT that the original argmax did not predict.
   const baseline=experiments.argmax.metrics;
   for(const e of Object.values(experiments)){
    if(e.metrics.predictedBut>baseline.predictedBut||
     e.metrics.predictedKeep!==baseline.predictedKeep||
     e.metrics.goldSupport.and!==baseline.goldSupport.and||
     e.metrics.goldSupport.but!==baseline.goldSupport.but)
     throw Error("Conservative policy changed KEEP or invented BUT");
   }
   outcomes[featureSet+"__AND+"+n]={
    featureSet,addedAND:n,addedBUT:but.length,
    separation:ranked,policies:experiments,
    folds:foldReports
   };
  }
 }
 return {validationCount:original.length,sourceDocuments:new Set(
  original.map(r=>r.document)).size,folds:partitions.map(f=>({
  fold:f.fold,sourceDocuments:f.documents.slice(),AND:f.and,BUT:f.but
 })),outcomes};
}
async function main(){
 const opt=options(process.argv.slice(2));
 const [base,old,planned,extraBut,extraAnd]=await Promise.all([
  json(PATHS.base),json(PATHS.oldManifest),json(PATHS.newManifest),
  json(PATHS.but),json(PATHS.and)
 ]);
 verifyExpansion(extraBut,base,old,planned);
 verifyAndPool(extraAnd,base,old,planned,extraBut);
 const original=transferRows(base.train),but=transferRows(extraBut.cases),
  and=transferRows(extraAnd.cases);
 const groups=documentFolds(original);
 console.log("CONSERVATIVE BUT SCORE GATE — "+original.length+
  " unchanged authentic TRAIN validation pairs in "+groups.length+
  " source-document folds.");
 console.log("Class support: AND "+groups.reduce((s,f)=>s+f.and,0)+
  ", BUT "+groups.reduce((s,f)=>s+f.but,0)+
  ", KEEP 0 (UNTESTED).");
 console.log("Policies: "+POLICIES.map(p=>p.id+"["+
  p.minButScore+","+p.minButMargin+"]").join(" | "));
 console.log("No old 217-case test scores or future 39 reserved docs used.");
 if(opt.preview){
  console.log("Preview passed provenance and fold validation; no model inference.");return;
 }
 const synthetic=await syntheticTraining(PATHS);
 const authentic=(await scoreBatch(original,{
  lmPath:PATHS.trainLm,semPath:PATHS.trainSem,offline:true,
  hash:base.meta.selectionHash+"|train"
 })).rows;
 const scoredBut=(await scoreBatch(but,{
  lmPath:PATHS.butLm,semPath:PATHS.butSem,offline:true,
  hash:extraBut.meta.selectionHash+"|training-only-contrast"
 })).rows;
 const scoredAnd=(await scoreBatch(and,{
  lmPath:PATHS.andLm,semPath:PATHS.andSem,offline:true,
  hash:extraAnd.meta.selectionHash+"|training-only-AND-pool"
 })).rows;
 const outcomes=evaluateConservativeCV(synthetic,authentic,scoredBut,scoredAnd);
 for(const [name,outcome] of Object.entries(outcomes.outcomes)){
  const originalExpected=EXPECTED_ORIGINAL_BASELINES[name];
  const observed=outcome.policies.argmax.metrics.confusion.and.and+
   outcome.policies.argmax.metrics.confusion.but.but;
  if(!Number.isInteger(originalExpected)||observed!==originalExpected)
   throw Error("Historical baseline changed at "+name+
    ": expected "+originalExpected+", observed "+observed);
  console.log("\n"+name+" | model ranking AUROC "+
   outcome.separation.rocAuc.toFixed(3)+
   "; average precision "+outcome.separation.averagePrecision.toFixed(3));
  for(const [policyId,policy] of Object.entries(outcome.policies)){
   const m=policy.metrics;
   console.log("  "+policyId+": BUT precision "+pct(m.butPrecision)+
    " ("+m.trueBut+"/"+m.predictedBut+")"+
    ", recall "+pct(m.butRecall)+", AND recall "+pct(m.andRecall)+
    ", balanced "+pct(m.balancedRecall)+
    ", false BUT "+m.falseBut+
    ", scrutiny advisories "+m.advisoryCount);
  }
 }
 const report={
  version:VERSION,gateVersion:GATE_VERSION,
  originalCorpusHash:base.meta.selectionHash,
  butCorpusHash:extraBut.meta.selectionHash,
  andCorpusHash:extraAnd.meta.selectionHash,
  source:"402 synthetic cases + original GUM training documents + pinned extra AND/BUT training sources; no external holdout evaluation",
  limitations:"All threshold sweeps reuse previously explored 308 genuine AND/BUT GUM training pairs. Softmax scores are NOT confidence-calibrated. Authentic KEEP is absent. Choose no production threshold or real-world accuracy claim until independent evaluation on new documents.",
  outcomes
 };
 await mkdir(path.dirname(PATHS.report),{recursive:true});
 await writeFile(PATHS.report,JSON.stringify(report,null,2)+"\n");
 console.log("\nSaved "+PATHS.report+" (local, gitignored).");
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
 main().catch(e=>{console.error(e?.stack||e);process.exitCode=1;});
