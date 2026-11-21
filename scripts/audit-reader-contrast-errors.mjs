#!/usr/bin/env node
/**
 * Audit confident reader contrast errors on the original 308 authentic GUM
 * TRAIN rows; never touch the original 217-case transfer test or the 39
 * untouched future source documents. Human-readable excerpts stay LOCAL.
 *
 * node scripts/audit-reader-contrast-errors.mjs --preview
 * node scripts/audit-reader-contrast-errors.mjs --offline --top 12
 */
import {readFile,writeFile,mkdir} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {trainFusion} from "./evaluate-reader-fusion.mjs";
import {transferRows,syntheticTraining,scoreBatch}
 from "./evaluate-reader-gum-transfer.mjs";
import {documentFolds,FEATURE_SETS}
 from "./evaluate-reader-gum-but-cv.mjs";
import {MIXTURE_SIZES,verifyAndPool}
 from "./build-reader-gum-and-mixtures.mjs";
import {verifyExpansion}
 from "./build-reader-gum-contrast-expansion.mjs";
import {POLICIES,scoreButOutcomes}
 from "./reader-conservative-but-decision.mjs";
import {decideWithExplicit,EXPECTED_ORIGINAL_BASELINES}
 from "./evaluate-reader-conservative-but.mjs";

export const VERSION="reader-contrast-error-audit-v1";
export const SCENARIOS=Object.freeze([
 Object.freeze({id:"full-fusion__AND+0__strict",
  features:"full-fusion",additionalAnd:0,policy:"strict",
  expectedArgmaxCorrect:187}),
 Object.freeze({id:"full-fusion__AND+440__strict",
  features:"full-fusion",additionalAnd:440,policy:"strict",
  expectedArgmaxCorrect:237}),
 Object.freeze({id:"no-period-hyphen__AND+220__moderate",
  features:"no-period-hyphen",additionalAnd:220,policy:"moderate",
  expectedArgmaxCorrect:221})
]);
export const CATEGORIES=Object.freeze([
 "false_but","missed_but","correct_but","rescued_false_but","lost_true_but"
]);
export const FEATURE_KEYS=Object.freeze([
 "gptContrast","bertContrast","bertPeriod","bertHyphen",
 "semanticSimilarity","nliForwardContradiction","nliForwardEntailment",
 "nliReverseContradiction","nliReverseEntailment",
 "lexicalJaccard","lexicalContainment","lexicalSemanticMismatch"
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
 output:local("reader-contrast-error-audit-v1.json"),
 markdown:local("reader-contrast-error-audit-v1.md"),
 review:local("reader-contrast-error-review-v1.tsv")
};
const json=async p=>JSON.parse(await readFile(p,"utf8"));
const tidy=x=>String(x??"").replace(/\s+/gu," ").trim();
const rate=x=>(100*x).toFixed(1)+"%";
const round=x=>typeof x==="number"?Number(x.toFixed(4)):null;
const policyByName=Object.fromEntries(POLICIES.map(p=>[p.id,p]));
const lexemes=Object.freeze({
 negation:/\b(?:not|never|no|nothing|neither|nor|without|cannot|can't|didn't|doesn't|isn't|wasn't|won't|failed|failure)\b/iu,
 adverse:/\b(?:bad|worse|worst|poor|ineffective|failed|failure|lost|loss|harm|damage|difficult|decline|declined|less|reduced|died|death|injured|expensive)\b/iu,
 favorable:/\b(?:good|better|best|effective|success|successful|recovered|improved|grew|growth|won|win|benefit|positive|quickly)\b/iu,
 surprise:/\b(?:unexpectedly|surprisingly|surprise|despite|although|though|even though|contrary|nonetheless|nevertheless|however|yet|but|instead)\b/iu,
 expectation:/\b(?:expected|expect|should|supposed|would|likely|unlikely|usually|normally|typically|predict|anticipated|assumed)\b/iu,
 temporal:/\b(?:after|before|then|later|earlier|subsequently|previously|eventually|meanwhile|next|finally|first)\b/iu,
 causal:/\b(?:because|therefore|thus|consequently|result|caused|due to|since)\b/iu,
 numerical:/\b\d+(?:\.\d+)?%?\b/u
});
/** Surface cues are hypotheses for review, not semantic ground truth. */
export function surfaceIndicators(left,right,features={}){
 const all=tidy(left)+" "+tidy(right);
 const indicators={};
 for(const [name,rx] of Object.entries(lexemes))
  indicators[name]=rx.test(all);
 indicators.negationRight=lexemes.negation.test(right);
 indicators.surpriseRight=lexemes.surprise.test(right);
 indicators.expectationRight=lexemes.expectation.test(right);
 indicators.lowLexicalOverlap=Number.isFinite(features.lexicalJaccard)?
  features.lexicalJaccard<0.1:null;
 return indicators;
}
function reducedFeatures(features){
 return Object.fromEntries(FEATURE_KEYS.map(k=>[
  k,Number.isFinite(features?.[k])?round(features[k]):null
 ]));
}
function foldReport(rows){
 const labels=rows.map(r=>({gold:r.gold,predicted:r.decision,
  advisory:r.advisory}));
 const measured=scoreButOutcomes(labels);
 return {
  count:measured.count,
  correct:measured.confusion.and.and+measured.confusion.but.but,
  metrics:measured
 };
}
function errorCategories(row){
 const out=[];
 if(row.gold==="and"&&row.decision==="but")out.push("false_but");
 if(row.gold==="but"&&row.decision!=="but")out.push("missed_but");
 if(row.gold==="but"&&row.decision==="but")out.push("correct_but");
 if(row.gold==="and"&&row.argmax==="but"&&row.decision==="and")
  out.push("rescued_false_but");
 if(row.gold==="but"&&row.argmax==="but"&&row.decision==="and")
  out.push("lost_true_but");
 return out;
}
export function rankErrorRows(rows,category,limit=12){
 if(!CATEGORIES.includes(category)||!Number.isSafeInteger(limit)||
  limit<1||limit>100)throw Error("Invalid audit category or limit");
 const selected=rows.filter(r=>r.categories.includes(category) &&
  r.explicitChoice===null);
 const descending=["false_but","correct_but","lost_true_but",
  "rescued_false_but"].includes(category);
 return selected.sort((a,b)=>descending?
  b.margin-a.margin||b.scores.but-a.scores.but||a.id.localeCompare(b.id):
  b.scores.and-a.scores.and||a.margin-b.margin||a.id.localeCompare(b.id)
 ).slice(0,limit);
}
export function cueBreakdown(rows){
 const categoryStats={};
 for(const category of CATEGORIES){
  const selected=rows.filter(r=>r.categories.includes(category));
  const cueCounts={};
  for(const name of Object.keys(lexemes).concat([
   "negationRight","surpriseRight","expectationRight","lowLexicalOverlap"
  ])){
   cueCounts[name]={
    positive:selected.filter(r=>r.cues[name]===true).length,
    observed:selected.filter(r=>r.cues[name]!==null).length
   };
  }
  categoryStats[category]={count:selected.length,cues:cueCounts};
 }
 return categoryStats;
}
/**
 * Evaluate already frozen models in document-grouped folds. This is an error
 * audit, not threshold tuning. Original 308 gold cases are read ONLY for
 * diagnostics and never included in their own fold's classifier training.
 */
export function auditContrastErrors(synthetic,original,extraBut,extraAnd,{
 scenarios=SCENARIOS,top=12,folds=5
}={}){
 if(!Array.isArray(synthetic)||synthetic.length!==402||
  !Array.isArray(original)||original.length<100||
  !Array.isArray(extraBut)||extraBut.length<1||
  !Array.isArray(extraAnd)||extraAnd.length<440)
  throw Error("Missing frozen synthetic and genuine training data");
 if(!Number.isSafeInteger(top)||top<1||top>100)
  throw Error("Invalid audit sample size");
 const groups=documentFolds(original,{folds});
 const outcomes={};
 for(const scenario of scenarios){
  if(!scenario.id||!FEATURE_SETS[scenario.features]||
   !MIXTURE_SIZES.includes(scenario.additionalAnd)||
   !policyByName[scenario.policy])
   throw Error("Invalid audit scenario");
  const keys=FEATURE_SETS[scenario.features];
  const policy=policyByName[scenario.policy];
  const evaluated=[];
  for(const group of groups){
   const withheld=new Set(group.documents);
   const real=original.filter(r=>!withheld.has(r.document));
   const but=extraBut.filter(r=>!withheld.has(r.document));
   const and=extraAnd.slice(0,scenario.additionalAnd)
    .filter(r=>!withheld.has(r.document));
   const fitted=[...synthetic,...real,...but,...and].filter(r=>!r.explicit);
   if(fitted.some(r=>withheld.has(r.document)))
    throw Error("Document-level data leakage in audit");
   const model=trainFusion(fitted,keys,{
    balanced:true,classWeights:{keep:1,and:1,but:1}
   });
   for(const r of group.rows){
    const scores=model.probabilities(r);
    const explicitChoice=r.explicit?.choice??null;
    const argmax=explicitChoice??model(r);
    const gated=decideWithExplicit(explicitChoice,scores,policy);
    const baseline=decideWithExplicit(explicitChoice,scores,POLICIES[0]);
    if(baseline.choice!==argmax)
     throw Error("Reader baseline mismatch on "+r.id);
    const record={
     id:r.id,document:r.document,fold:group.fold,
     gold:r.gold,relation:r.relation,explicitChoice,
     left:tidy(r.left),right:tidy(r.right),
     argmax,decision:gated.choice,advisory:gated.advisory,
     scores:Object.fromEntries(Object.entries(scores).map(([k,v])=>[k,round(v)])),
     margin:round(scores.but-Math.max(scores.and,scores.keep)),
     features:reducedFeatures(r.features),
     cues:surfaceIndicators(r.left,r.right,r.features)
    };
    record.categories=errorCategories(record);
    evaluated.push(record);
   }
  }
  if(evaluated.length!==original.length||
   new Set(evaluated.map(r=>r.id)).size!==original.length)
   throw Error("Lost/duplicated authentic validation item");
  const baseline=scoreButOutcomes(evaluated.map(r=>({
   gold:r.gold,predicted:r.argmax,advisory:null
  })));
  const result=foldReport(evaluated);
  // Historic accuracy means ALL classes, including any KEEP predictions.
  const baselineCorrect=baseline.confusion.and.and+baseline.confusion.but.but;
  if(Number.isInteger(scenario.expectedArgmaxCorrect)&&
   baselineCorrect!==scenario.expectedArgmaxCorrect)
   throw Error("Historical original GUM CV regression "+scenario.id+
    ": expected "+scenario.expectedArgmaxCorrect+", observed "+baselineCorrect);
  outcomes[scenario.id]={
   scenario:{...scenario},
   argmax:{correct:baselineCorrect,...baseline},
   gated:result,
   groupedCues:cueBreakdown(evaluated),
   cases:Object.fromEntries(CATEGORIES.map(cat=>[
    cat,rankErrorRows(evaluated,cat,top)
   ])),
   totalCategoryCounts:Object.fromEntries(CATEGORIES.map(cat=>[
    cat,evaluated.filter(r=>r.categories.includes(cat)).length
   ])),
   explicitOverrides:evaluated.filter(r=>r.explicitChoice!==null).length
  };
 }
 return {version:VERSION,validationCount:original.length,
  originalDocuments:new Set(original.map(r=>r.document)).size,
  top,scenarioCount:scenarios.length,
  folds:groups.map(g=>({fold:g.fold,documents:g.documents,
   validation:g.rows.length,AND:g.and,BUT:g.but})),
  outcomes};
}
const safeCell=x=>tidy(x).replace(/\|/gu,"\\|");
function markdownReport(result){
 const out=[
 "# Contrast relationship — high-confidence error audit",
 "",
 "Local GUM-derived text. For private review only; do not commit or republish excerpts.",
 "",
 "The GDTB labels are single discourse annotations, NOT proof that an alternative",
 "AND/BUT reading is impossible. Manual review is required before changing labels.",
 "",
 "The original 308 already-explored training cases are analysed in document-heldout",
 "folds; previously inspected 217-case transfer test and 39 reserved future",
 "documents are NOT used. Scores are softmax model outputs, not confidence calibration.",
 ""
 ];
 for(const [id,assessment] of Object.entries(result.outcomes)){
  const m=assessment.gated.metrics,b=assessment.argmax;
  out.push("## "+id,"",
   "Argmax "+b.correct+"/"+b.count+
   "; conservative BUT precision "+(m.butPrecision===null?"N/A":rate(m.butPrecision))+
   " ("+m.trueBut+"/"+m.predictedBut+"), AND recall "+
   rate(m.andRecall)+", BUT recall "+rate(m.butRecall)+
   "; false BUT "+m.falseBut+".","",
   "Counts: "+Object.entries(assessment.totalCategoryCounts)
    .map(([k,v])=>k+"="+v).join("; ")+".",""
  );
  for(const category of CATEGORIES){
   const records=assessment.cases[category];
   out.push("### "+category+" — "+records.length+" examples","","");
   if(!records.length){out.push("No cases at the requested cutoff.","");continue;}
   for(const r of records){
    out.push("**"+r.id+"** — GDTB "+r.relation+"; gold "+r.gold+
     "; argmax "+r.argmax+"; gate "+r.decision+"; fold "+r.fold+
     "; BUT score "+r.scores.but+", margin "+r.margin+".",
     "",
     "> "+tidy(r.left),"",
     "> "+tidy(r.right),"",
     "Observed cues: "+Object.entries(r.cues).filter(([,v])=>v===true)
      .map(([name])=>name).join(", ")+" (word-level clues only).","",
     "Model signals: "+Object.entries(r.features).filter(([,v])=>v!==null)
      .map(([k,v])=>k+"="+v).join("; ")+".",""
    );
   }
  }
 }
 out.push("## Review guidance","",
  "For each pair ask: Does AND work? Does BUT work? Both? Neither? Does the",
  "second sentence contradict a claim, or merely violate an expectation?",
  "Does a negative/emotive word independently justify BUT? Is the gold sense",
  "compatible with the two-sentence context, or ambiguous? Mark uncertainty",
  "instead of inventing a resolved gold label.","");
 return out.join("\n");
}
function tsv(rows){
 const header=[
  "scenario","case_id","fold","relation","original_gold","model_argmax",
  "conservative_decision","but_score","but_margin","sentence_1","sentence_2",
  "and_plausible","but_plausible","expectation_violation","explicit_contradiction",
  "interpretation","notes"
 ];
 // TSV may be opened in Excel/Sheets. Prevent sentence text starting
 // with formula operators from being interpreted as spreadsheet formulas.
 const value=x=>{
  const cleaned=tidy(x).replace(/\t/gu," ").replace(/\r?\n/gu," ");
  return /^[=+\-@]/u.test(cleaned)?"'"+cleaned:cleaned;
 };
 return [header.join("\t"),...rows.map(r=>header.map(name=>value(r[name])).join("\t"))].join("\n")+"\n";
}
export function reviewSheet(result){
 const unique=new Map();
 for(const [scenario,assessment] of Object.entries(result.outcomes)){
  for(const category of ["false_but","missed_but","lost_true_but"]){
   for(const r of assessment.cases[category]){
    const key=scenario+"|"+r.id;
    if(unique.has(key))continue;
    unique.set(key,{
     scenario,case_id:r.id,fold:r.fold,relation:r.relation,
     original_gold:r.gold,model_argmax:r.argmax,
     conservative_decision:r.decision,
     but_score:r.scores.but,but_margin:r.margin,
     sentence_1:r.left,sentence_2:r.right,
     and_plausible:"",but_plausible:"",expectation_violation:"",
     explicit_contradiction:"",interpretation:"",notes:""
    });
   }
  }
 }
 return tsv([...unique.values()]);
}
function parse(argv){
 let preview=false,offline=false,top=12;
 for(let i=0;i<argv.length;i++){
  const a=argv[i];
  if(a==="--help"||a==="-h"){
   console.log("node scripts/audit-reader-contrast-errors.mjs "+
    "[--preview] [--offline] [--top N]");
   process.exit(0);
  }
  if(a==="--preview")preview=true;
  else if(a==="--offline")offline=true;
  else if(a==="--top")top=Number(argv[++i]);
  else throw Error("Unrecognized option "+a);
 }
 if(!Number.isSafeInteger(top)||top<1||top>100)
  throw Error("Invalid --top count");
 return {preview,offline,top};
}
async function main(){
 const options=parse(process.argv.slice(2));
 const [base,old,planned,butCorpus,andCorpus]=await Promise.all([
  json(PATHS.base),json(PATHS.oldManifest),json(PATHS.newManifest),
  json(PATHS.but),json(PATHS.and)
 ]);
 verifyExpansion(butCorpus,base,old,planned);
 verifyAndPool(andCorpus,base,old,planned,butCorpus);
 const original=transferRows(base.train),but=transferRows(butCorpus.cases),
  and=transferRows(andCorpus.cases);
 console.log("READER CONTRAST ERROR AUDIT — "+original.length+
  " original authentic training cases. Three fixed scenarios; same five "+
  "document-separated validation folds.");
 console.log("No previously inspected transfer test or future reserved documents used.");
 if(options.preview){
  console.log("Source fingerprints and partition guardrails verified; no scores loaded.");
  return;
 }
 const synthetic=await syntheticTraining(PATHS);
 const genuine=(await scoreBatch(original,{
  lmPath:PATHS.trainLm,semPath:PATHS.trainSem,offline:true,
  hash:base.meta.selectionHash+"|train"
 })).rows;
 const scoredBut=(await scoreBatch(but,{
  lmPath:PATHS.butLm,semPath:PATHS.butSem,offline:true,
  hash:butCorpus.meta.selectionHash+"|training-only-contrast"
 })).rows;
 const scoredAnd=(await scoreBatch(and,{
  lmPath:PATHS.andLm,semPath:PATHS.andSem,offline:true,
  hash:andCorpus.meta.selectionHash+"|training-only-AND-pool"
 })).rows;
 const report=auditContrastErrors(synthetic,genuine,scoredBut,scoredAnd,{
  top:options.top
 });
 report.provenance={
  baselineSelectionHash:base.meta.selectionHash,
  butSelectionHash:butCorpus.meta.selectionHash,
  andSelectionHash:andCorpus.meta.selectionHash,
  labels:"Original human GDTB annotated AND/BUT. No gold KEEP.",
  limitations:"Diagnostic on previously explored training folds. Surface cues are hypotheses, not explanation, and labels may allow legitimate alternatives."
 };
 await mkdir(path.dirname(PATHS.output),{recursive:true});
 await Promise.all([
  writeFile(PATHS.output,JSON.stringify(report,null,2)+"\n"),
  writeFile(PATHS.markdown,markdownReport(report)+"\n"),
  writeFile(PATHS.review,reviewSheet(report))
 ]);
 for(const [id,item] of Object.entries(report.outcomes)){
  const m=item.gated.metrics;
  console.log("\n"+id+": strict/gated precision "+
   (m.butPrecision===null?"n/a":rate(m.butPrecision))+
   "; correct BUT "+m.trueBut+", false BUT "+m.falseBut+
   ", missed BUT "+(42-m.trueBut)+".");
  console.log("  Top false BUT:");
  for(const r of item.cases.false_but.slice(0,3))
   console.log("    "+r.id+" score="+r.scores.but+" margin="+r.margin+
    " | "+tidy(r.left)+" / "+tidy(r.right));
  console.log("  Top missed BUT:");
  for(const r of item.cases.missed_but.slice(0,3))
   console.log("    "+r.id+" score="+r.scores.but+" margin="+r.margin+
    " | "+tidy(r.left)+" / "+tidy(r.right));
 }
 console.log("\nSaved local audit:");
 console.log("  "+PATHS.markdown);
 console.log("  "+PATHS.review);
 console.log("  "+PATHS.output);
 console.log("Do not commit or publish text copied from GUM sources.");
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
 main().catch(e=>{console.error(e?.stack||e);process.exitCode=1;});
