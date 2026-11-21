#!/usr/bin/env node
/**
 * Paired real-world GUM preprocessing experiment.
 *
 * Same 250 authentic labelled sentence pairs, same 402 synthetic training
 * cases, same frozen classifier settings. First run re-scores ONLY the
 * corrected working copy using separate, resumable local LM/semantic caches.
 * The original GUM model scores and original text are strictly read-only.
 *
 * Controlled treatment = deterministic formatting correction ONLY:
 *  maxSpelling=0, correctSpelling=false. Spelling/curated vocabulary changes
 * are excluded so their potential semantic effects cannot confound this test.
 *
 * node scripts/evaluate-reader-gum-preprocessing.mjs --preview
 * node scripts/evaluate-reader-gum-preprocessing.mjs --max-errors 5
 * node scripts/evaluate-reader-gum-preprocessing.mjs --offline
 *
 * Labels: GDTB mapped AND/BUT only; no human-annotated KEEP gold.
 * This is a POST-HOC diagnostic after inspecting the GUM baseline.
 */
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {preprocessText,PREPROCESS_VERSION,
 originalRangeForAnalysis,analysisRangeForOriginal}
 from "../extension/src/text-preprocessing.mjs";
import {extractBoundaryProbes,buildBoundaryChoices}
 from "../extension/src/reader-boundary-scorer.mjs";
import {maskedGapPrompt}
 from "../extension/src/reader-mask-infill.mjs";
import {sentencePair}
 from "../extension/src/reader-semantic-signals.mjs";
import {explicitBoundaryConnector}
 from "../extension/src/reader-connector-normalisation.mjs";
import {pilotRows}
 from "./evaluate-reader-gum-pilot.mjs";
import {scoredAuditRows}
 from "./audit-reader-gum-pilot.mjs";
import {scoreLanguageModels}
 from "./evaluate-reader-holdout-v2.mjs";
import {generateHoldout}
 from "./build-reader-holdout-v1.mjs";
import {makeHoldoutRows,heldoutFeatures}
 from "./evaluate-reader-holdout-v1.mjs";
import {alignModelScores,assignExplicitRules,trainFusion}
 from "./evaluate-reader-fusion.mjs";
import {originalProbeRows,attachPriorHoldoutScores,signalCacheFingerprint,
 obtainSemanticSignals,addSemanticFeatures}
 from "./evaluate-reader-semantic-fusion.mjs";
import {attachLexicalFeatures}
 from "./evaluate-reader-nonlinear-fusion.mjs";
import {ABLATIONS,evaluatePredictions}
 from "./evaluate-reader-gum-ablations.mjs";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const local=n=>path.join(ROOT,"evaluation",n);
export const EXPERIMENT_VERSION="reader-gum-preprocessing-v1";
export const STRATEGIES=Object.freeze({
 "full-fusion":ABLATIONS.baseline,
 "without-period-and-hyphen":ABLATIONS["minus-bertPeriod-bertHyphen"],
 "without-bert-punctuation":ABLATIONS["minus-all-bert-punctuation"]
});
const defaults={
 pilot:local("reader-gum-pilot-v1.json"),
 originalResults:local("reader-gum-pilot-results.json"),
 originalLm:local("reader-gum-pilot-lm-scores.json"),
 originalSemantic:local("reader-gum-pilot-semantic-scores.json"),
 oldJoin:local("reader-join-cross-validation.json"),
 oldMask:local("reader-mask-infill.json"),
 oldDataset:local("reader-strategy-synthetic-reference.json"),
 v1Scores:local("reader-holdout-v1-scores.json"),
 oldSemantic:local("reader-semantic-pair-scores.json"),
 normalizedLm:local("reader-gum-preprocessed-lm-v1.json"),
 normalizedSemantic:local("reader-gum-preprocessed-semantic-v1.json"),
 output:local("reader-gum-preprocessing-comparison-v1.json"),
 maxErrors:5,offline:false,preview:false
};
const PERCENT=x=>(100*x).toFixed(1)+"%";
const key=r=>JSON.stringify([r.id,r.offset]);
const sha=x=>createHash("sha256").update(x).digest("hex");
async function json(file){return JSON.parse(await readFile(file,"utf8"));}
function args(argv){
 const o={...defaults};
 const paths=new Map(Object.keys(defaults).filter(k=>!["maxErrors","offline","preview"].includes(k))
  .map(k=>["--"+k.replace(/[A-Z]/g,x=>"-"+x.toLowerCase()),k]));
 for(let i=0;i<argv.length;i++){
  const a=argv[i];
  if(a==="--help"||a==="-h"){
   console.log("node scripts/evaluate-reader-gum-preprocessing.mjs "+
    "[--preview] [--offline] [--max-errors N]\n"+
    "Preview checks 250 normalized boundaries; scoring requires existing GUM and training caches.\n"+
    "No spelling substitutions: deterministic formatting-only correction.");
   process.exit(0);
  }
  if(a==="--preview"||a==="--offline"){o[a.slice(2)]=true;continue;}
  if(a==="--max-errors"){
   if(++i>=argv.length)throw Error("Missing --max-errors");
   o.maxErrors=Number(argv[i]);continue;
  }
  if(!paths.has(a))throw Error("Unknown argument "+a);
  if(++i>=argv.length)throw Error("Missing path for "+a);
  o[paths.get(a)]=path.resolve(process.cwd(),argv[i]);
 }
 if(!Number.isSafeInteger(o.maxErrors)||o.maxErrors<0||o.maxErrors>100)
  throw Error("Invalid --max-errors value");
 return o;
}

/** The only authorised change is formatting, never inferred word choice. */
export function normaliseGumRows(rows){
 if(!Array.isArray(rows)||!rows.length)throw Error("GUM rows required");
 const observed=[],normalized=[],changed={};
 const IDs=new Set();
 for(const row of rows){
  if(IDs.has(row.id))throw Error("Duplicate original GUM ID "+row.id);
  IDs.add(row.id);
  if(row.source[row.offset]!==".")
   throw Error("Original GUM boundary is not a full stop "+row.id);
  const prep=preprocessText(row.source,{
   spellchecker:null,correctSpelling:false,maxSpelling:0
  });
  const nonformat=prep.edits.filter(e=>e.kind!=="formatting_artifact");
  if(nonformat.length||prep.signals.spellingCandidates||
   prep.signals.nonstandardVocabularyCandidates||
   prep.signals.vocabularyNormalisations)
   throw Error("Not a formatting-only experiment "+row.id);
  const range=analysisRangeForOriginal(prep,row.offset,row.offset+1);
  if(range.end-range.start!==1||prep.analysisText[range.start]!==".")
   throw Error("Normalization moved or erased the target full stop at "+row.id);
  const roundtrip=originalRangeForAnalysis(prep,range.start,range.end);
  if(roundtrip.start!==row.offset||roundtrip.end!==row.offset+1)
   throw Error("Normalized boundary did not map back to original "+row.id);
  const probes=extractBoundaryProbes(prep.analysisText,{maxPairs:12});
  const probe=probes.find(p=>p.punctuationStart===range.start);
  if(!probe||probe.punctuationEnd!==range.end)
   throw Error("Normalized GUM target sentence pair could not be extracted "+row.id);
  const choices=buildBoundaryChoices(prep.analysisText,probe);
  const prompt=maskedGapPrompt(prep.analysisText,probe);
  if(choices.length!==2||!prompt)
   throw Error("Normalized GUM model prompt invalid "+row.id);
  const pair=sentencePair(prep.analysisText,probe);
  const clean={
   id:row.id,offset:range.start,gold:row.gold,
   family:row.family,document:row.document,genre:row.genre,domain:row.domain,
   challenge:row.challenge,relation:row.relation,
   source:prep.analysisText,probe,choices,prompt:prompt.text,
   left:pair.left,right:pair.right,
   explicit:explicitBoundaryConnector(prep.analysisText,probe)
  };
  // Explicit-connector status must not change, otherwise the treatment is
  // testing a rule decision as well as formatting.
  if(clean.explicit?.choice!==row.explicit?.choice)
   throw Error("Formatting changed explicit connector rule "+row.id);
  normalized.push(clean);
  const counts=prep.signals;
  observed.push({
   id:row.id,originalOffset:row.offset,normalizedOffset:range.start,
   originalText:row.source,normalizedText:prep.analysisText,
   changed:row.source!==prep.analysisText,
   formattingEdits:counts.formattingArtifacts,
   totalEdits:counts.correctionsApplied,
   changedPair:row.left!==pair.left||row.right!==pair.right,
   flags:prep.flags.map(f=>({kind:f.kind,original:f.original,
    start:f.start,end:f.end,replacement:f.replacement??null}))
  });
  for(const flag of prep.flags)changed[flag.kind]=(changed[flag.kind]||0)+1;
 }
 if(new Set(normalized.map(key)).size!==rows.length)
  throw Error("Duplicate normalized GUM row ID / offset");
 const summary={
  total:rows.length,
  changed:observed.filter(r=>r.changed).length,
  unchanged:observed.filter(r=>!r.changed).length,
  changedPairs:observed.filter(r=>r.changedPair).length,
  totalFormattingEdits:observed.reduce((s,r)=>s+r.formattingEdits,0),
  flagsByKind:changed,
  inputVersion:PREPROCESS_VERSION,
  policy:"formatting-only (maxSpelling=0, correctSpelling=false)"
 };
 return {normalized,observed,summary};
}
function digest(rows,pilot){
 // Include preprocessing version and frozen pilot selection. Old LM score
 // caches are NOT permitted: the source/offset/prompt inputs have changed.
 return sha(JSON.stringify([EXPERIMENT_VERSION,PREPROCESS_VERSION,
  pilot.meta.selectionHash,rows.map(r=>[r.id,r.offset,r.source,r.prompt])]));
}
export function summarizePairs(original,clean,changes){
 const old=new Map(original.predictions.map(p=>[p.id,p]));
 const records=[];
 for(const prediction of clean.predictions){
  const p=old.get(prediction.id);
  const changed=changes.get(prediction.id);
  if(!p||p.gold!==prediction.gold||!changed)
   throw Error("Paired GUM result mismatch at "+prediction.id);
  const oldCorrect=p.predicted===p.gold,newCorrect=prediction.predicted===p.gold;
  records.push({
   id:p.id,genre:p.genre,relation:p.relation,gold:p.gold,
   before:p.predicted,after:prediction.predicted,
   changedText:changed.changed,changedPair:changed.changedPair,
   formattingEdits:changed.formattingEdits,
   recovered:!oldCorrect&&newCorrect,
   regressed:oldCorrect&&!newCorrect,
   stable:oldCorrect===newCorrect
  });
 }
 if(records.length!==250||new Set(records.map(r=>r.id)).size!==250)
  throw Error("Paired GUM analysis requires all 250 cases");
 const rec=records.filter(r=>r.recovered).length;
 const reg=records.filter(r=>r.regressed).length;
 const groups={};
 for(const category of ["changed","unchanged"]){
  const subset=records.filter(r=>r.changedText===(category==="changed"));
  groups[category]={
   total:subset.length,improved:subset.filter(x=>x.recovered).length,
   worsened:subset.filter(x=>x.regressed).length,
   changedPrediction:subset.filter(x=>x.before!==x.after).length
  };
 }
 return {fixed:rec,regressed:reg,net:rec-reg,groups,records};
}
export function compareStrategies(train,originalRows,normalizedRows,changes){
 const output={};
 for(const [name,keys] of Object.entries(STRATEGIES)){
  const predict=trainFusion(train.filter(r=>!r.explicit),keys,{balanced:true});
  const before=evaluatePredictions(originalRows,predict);
  const after=evaluatePredictions(normalizedRows,predict);
  output[name]={features:keys,original:before,normalized:after,
   paired:summarizePairs(before,after,changes)};
 }
 return output;
}
function features(rows){
 return attachLexicalFeatures(addSemanticFeatures(rows.map(heldoutFeatures)));
}
async function originalTraining(o){
 const [joined,masked,dataset,v1]=await Promise.all([
  o.oldJoin,o.oldMask,o.oldDataset,o.v1Scores
 ].map(json));
 const cases=Array.isArray(dataset)?dataset:dataset.cases;
 const original=originalProbeRows(cases,
  assignExplicitRules(alignModelScores(joined,masked,cases),
  (source,offset)=>explicitBoundaryConnector(source,{
   punctuationStart:offset,punctuationEnd:offset+1
  })));
 const v1Cases=generateHoldout().cases;
 const old=attachPriorHoldoutScores(makeHoldoutRows(v1Cases),v1,v1Cases);
 const train=[...original,...old];
 if(train.length!==402)throw Error("Expected 402 previous synthetic training cases");
 for(const row of train){
  const {left,right}=sentencePair(row.source,row.probe);
  row.left=left;row.right=right;
 }
 await obtainSemanticSignals(train,{
  file:o.oldSemantic,fingerprint:signalCacheFingerprint(train),
  readOnly:true,log:()=>{},
  createScorer:()=>{throw Error("No neural inference on training allowed");}
 });
 return attachLexicalFeatures(addSemanticFeatures(train));
}
function enrichAndCheck(rows,language,semantic){
 const lm=new Map((language.predictions||[]).map(r=>[key(r),r]));
 const sm=new Map((semantic.predictions||[]).map(r=>[key(r),r]));
 if(lm.size!==rows.length||sm.size!==rows.length)
  throw Error("Normalized cache has missing or duplicated rows");
 for(const row of rows){
  const a=lm.get(key(row)),b=sm.get(key(row));
  if(!a||!b||a.source!==row.source||a.prompt!==row.prompt||
    b.source!==row.source||b.left!==row.left||b.right!==row.right)
   throw Error("Normalized score provenance mismatch at "+row.id);
  row.scores=a.scores;row.semantic=b.signals;
 }
 return features(rows);
}
async function main(){
 const o=args(process.argv.slice(2));
 const pilot=await json(o.pilot);
 const raw=pilotRows(pilot);
 const {normalized,observed,summary}=normaliseGumRows(raw);
 console.log("GUM FORMATTING EXPERIMENT — "+raw.length+" frozen human-annotated boundaries");
 console.log("  Preprocessor "+PREPROCESS_VERSION+": "+
  summary.changed+" texts changed; "+summary.totalFormattingEdits+
  " formatting edits; "+summary.changedPairs+" sentence pairs changed");
 console.log("  Unchanged: "+summary.unchanged+"; flag counts "+
  JSON.stringify(summary.flagsByKind));
 if(o.preview){
  console.log("Preview only: 250/250 offsets and model prompts verified.");
  console.log("No inference, cache reads (except pilot), or output writes.");
  return;
 }
 const [train,oldResults,oldLm,oldSem]=await Promise.all([
  originalTraining(o),json(o.originalResults),json(o.originalLm),
  json(o.originalSemantic)
 ]);
 if(pilot.meta.selectionHash!==oldResults.selectionHash||
    oldSem.corpusFingerprint!==signalCacheFingerprint(raw))
   throw Error("Original GUM selection/semantic cache does not match frozen source");
 const originalFeatures=scoredAuditRows(pilot.cases,raw,oldResults,oldLm,oldSem);
 // Freeze and verify original baselines BEFORE scoring the cleaned text.
 const oldPredictions=new Map();
 for(const [name,keys] of Object.entries(STRATEGIES)){
  const fit=trainFusion(train.filter(r=>!r.explicit),keys,{balanced:true});
  oldPredictions.set(name,evaluatePredictions(originalFeatures,fit));
 }
 if(oldPredictions.get("full-fusion").correct!==30||
    oldPredictions.get("without-period-and-hyphen").correct!==102||
    oldPredictions.get("without-bert-punctuation").correct!==101)
   throw Error("Raw-text baseline changed: expected 30/250, 102/250, 101/250");
 console.log("Original raw GUM baselines reproduced: 30/250, 102/250, 101/250");
 const lmDigest=digest(normalized,pilot);
 const {createMaskedGapScorer}=await import("../extension/src/reader-mask-infill.mjs");
 const {createBoundaryLanguageScorer}=await import("../extension/src/reader-language-model.mjs");
 await scoreLanguageModels(normalized,{
  file:o.normalizedLm,digest:lmDigest,offline:o.offline,
  createMask:createMaskedGapScorer,createGPT:createBoundaryLanguageScorer
 });
 const semantic=await obtainSemanticSignals(normalized,{
  file:o.normalizedSemantic,fingerprint:signalCacheFingerprint(normalized),
  readOnly:o.offline
 });
 const [lmCache,semCache]=await Promise.all([
  json(o.normalizedLm),json(o.normalizedSemantic)
 ]);
 if(lmCache.digest!==lmDigest||
    semCache.corpusFingerprint!==signalCacheFingerprint(normalized))
   throw Error("Normalized cache fingerprint mismatch");
 const cleaned=enrichAndCheck(normalized,lmCache,semCache);
 const changes=new Map(observed.map(r=>[r.id,r]));
 const comparisons=compareStrategies(train,originalFeatures,cleaned,changes);
 for(const [name,comparison] of Object.entries(comparisons)){
  const old=comparison.original,now=comparison.normalized,p=comparison.paired;
  if(old.correct!==oldPredictions.get(name).correct)
   throw Error("Original accuracy changed during experiment");
  console.log("\n"+name);
  console.log("  Original: "+old.correct+"/"+old.count+" "+PERCENT(old.accuracy)+
   " | AND "+PERCENT(old.recall.and)+", BUT "+PERCENT(old.recall.but)+
   "; KEEP predictions "+old.predicted.keep);
  console.log("  Cleaned:  "+now.correct+"/"+now.count+" "+PERCENT(now.accuracy)+
   " | AND "+PERCENT(now.recall.and)+", BUT "+PERCENT(now.recall.but)+
   "; KEEP predictions "+now.predicted.keep);
  console.log("  Paired: fixed "+p.fixed+", regressed "+p.regressed+
   ", net "+p.net);
  for(const [group,x] of Object.entries(p.groups))
   console.log("  "+group+": "+x.total+" cases, fixed "+x.improved+
    ", regressed "+x.worsened+", predictions changed "+x.changedPrediction);
  const examples=p.records.filter(x=>x.before!==x.after).slice(0,o.maxErrors);
  for(const ex of examples)console.log("   "+ex.id+" "+
   ex.gold+": "+ex.before+" -> "+ex.after+
   " (format edits "+ex.formattingEdits+")");
 }
 const report={
  version:EXPERIMENT_VERSION,
  kind:"Post-hoc, paired formatting-only experiment on previously inspected GUM samples",
  pilotSelectionHash:pilot.meta.selectionHash,
  preprocessingVersion:PREPROCESS_VERSION,preprocessing:summary,
  inputDigest:lmDigest,
  limitations:"No KEEP gold; provisional AND/BUT mapping. Only formatting is changed, not spelling or author vocabulary. Reusing inspected GUM is diagnostic and does not validate generalisation.",
  frozenTrainingCases:402,
  neuralScoring:semantic,
  comparisons,
  cases:observed
 };
 await mkdir(path.dirname(o.output),{recursive:true});
 await writeFile(o.output,JSON.stringify(report,null,2)+"\n");
 console.log("\nSaved "+o.output+" (gitignored local diagnostic report).");
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
 main().catch(e=>{console.error(e?.stack||e);process.exitCode=1;});
