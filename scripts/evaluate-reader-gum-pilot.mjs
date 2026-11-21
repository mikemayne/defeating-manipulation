#!/usr/bin/env node
/**
 * Authentic-text pilot: 250 human-annotated GUM/GDTB implicit relations.
 *
 * Prerequisite: node scripts/build-reader-gum-pilot.mjs
 *
 * Run: node scripts/evaluate-reader-gum-pilot.mjs --max-errors 5
 * Resume offline: node scripts/evaluate-reader-gum-pilot.mjs --offline
 *
 * Frozen classifier: balanced LINEAR+LEXICAL trained only on prior 402
 * developer-labelled synthetic examples. GUM gold is used for EVALUATION only.
 * No KEEP gold labels are produced by this source. Report coverage honestly.
 */
import {readFile,writeFile,mkdir} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createHash} from "node:crypto";
import {generateHoldout} from "./build-reader-holdout-v1.mjs";
import {makeHoldoutRows,heldoutFeatures} from "./evaluate-reader-holdout-v1.mjs";
import {alignModelScores,assignExplicitRules} from "./evaluate-reader-fusion.mjs";
import {originalProbeRows,attachPriorHoldoutScores,signalCacheFingerprint,
 obtainSemanticSignals,addSemanticFeatures} from "./evaluate-reader-semantic-fusion.mjs";
import {attachLexicalFeatures} from "./evaluate-reader-nonlinear-fusion.mjs";
import {frozenScores,scoreLanguageModels} from "./evaluate-reader-holdout-v2.mjs";
import {VERSION as PILOT_VERSION,GUM_COMMIT}
 from "./build-reader-gum-pilot.mjs";
import {sentencePair} from "../extension/src/reader-semantic-signals.mjs";
import {extractBoundaryProbes,buildBoundaryChoices}
 from "../extension/src/reader-boundary-scorer.mjs";
import {maskedGapPrompt} from "../extension/src/reader-mask-infill.mjs";
import {explicitBoundaryConnector}
 from "../extension/src/reader-connector-normalisation.mjs";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const OPTIONS={
 oldJoin:path.join(ROOT,"evaluation/reader-join-cross-validation.json"),
 oldMask:path.join(ROOT,"evaluation/reader-mask-infill.json"),
 oldDataset:path.join(ROOT,"evaluation/reader-strategy-synthetic-reference.json"),
 oldHoldoutScores:path.join(ROOT,"evaluation/reader-holdout-v1-scores.json"),
 oldSemanticScores:path.join(ROOT,"evaluation/reader-semantic-pair-scores.json"),
 input:path.join(ROOT,"evaluation/reader-gum-pilot-v1.json"),
 lmCache:path.join(ROOT,"evaluation/reader-gum-pilot-lm-scores.json"),
 semanticCache:path.join(ROOT,"evaluation/reader-gum-pilot-semantic-scores.json"),
 output:path.join(ROOT,"evaluation/reader-gum-pilot-results.json"),
 maxErrors:5,preview:false,offline:false
};
function opt(args){
 const o={...OPTIONS};
 const fileArgs=new Map([
  ["--old-join","oldJoin"],["--old-mask","oldMask"],
  ["--old-dataset","oldDataset"],["--old-holdout-scores","oldHoldoutScores"],
  ["--old-semantic-scores","oldSemanticScores"],["--input","input"],
  ["--lm-cache","lmCache"],["--semantic-cache","semanticCache"],
  ["--output","output"]
 ]);
 for(let i=0;i<args.length;i++){
  const a=args[i];
  if(a==="--help"||a==="-h"){
   console.log("node scripts/evaluate-reader-gum-pilot.mjs "+
    "[--preview] [--offline] [--max-errors N] "+
    "[--input FILE] [--lm-cache FILE] [--semantic-cache FILE]");process.exit(0);
  }
  if(a==="--preview"||a==="--offline"){o[a.slice(2)]=true;continue;}
  if(a==="--max-errors"){
   if(++i>=args.length)throw Error("Missing --max-errors value");
   o.maxErrors=Number(args[i]);continue;
  }
  if(!fileArgs.has(a))throw Error("Unknown option "+a);
  if(++i>=args.length)throw Error("Missing file after "+a);
  o[fileArgs.get(a)]=path.resolve(process.cwd(),args[i]);
 }
 if(!Number.isSafeInteger(o.maxErrors)||o.maxErrors<0||o.maxErrors>100)
  throw Error("Invalid error display count");
 return o;
}
async function json(file){return JSON.parse(await readFile(file,"utf8"));}
export function pilotRows(pilot){
 if(pilot?.meta?.version!==PILOT_VERSION||
  pilot.meta.sourceRevision!==GUM_COMMIT||
  !Array.isArray(pilot.cases)||pilot.cases.length!==250)
  throw Error("Unrecognised or incomplete frozen GUM pilot");
 const rows=[];
 for(const c of pilot.cases){
  const expected=c.expected_boundaries;
  if(expected?.length!==1||!["and","but"].includes(expected[0].choice))
   throw Error("Unmapped relation or synthetic KEEP in GUM pilot "+c.id);
  const {offset,choice}=expected[0];
  if(c.text[offset]!==".")throw Error("GUM target punctuation changed "+c.id);
  const probes=extractBoundaryProbes(c.text,{maxPairs:12});
  const probe=probes.find(p=>p.punctuationStart===offset);
  if(!probe)throw Error("Missing target boundary "+c.id);
  const choices=buildBoundaryChoices(c.text,probe);
  const prompt=maskedGapPrompt(c.text,probe);
  if(choices.length!==2||!prompt)throw Error("Unsupported boundary "+c.id);
  const {left,right}=sentencePair(c.text,probe);
  rows.push({
   id:c.id,offset,gold:choice,family:c.document,
   document:c.document,genre:c.genre,domain:c.genre,
   challenge:c.relation,relation:c.relation,
   source:c.text,probe,choices,prompt:prompt.text,left,right,
   explicit:explicitBoundaryConnector(c.text,probe)
  });
 }
 if(new Set(rows.map(x=>x.id)).size!==250)throw Error("Duplicate pilot IDs");
 const originalSource=pilot.cases.map(c=>[c.id,c.document,c.row,c.text,
  c.expected_boundaries[0].choice]);
 const fingerprint=createHash("sha256")
  .update(JSON.stringify(originalSource)).digest("hex");
 if(!pilot.meta.selectionHash||pilot.meta.selectionHash!==fingerprint)
  throw Error("GUM pilot selection fingerprint mismatch");
 return rows;
}
export function calculateMappedMetrics(result){
 const m=result.combined;
 if(m.matrix.keep.keep!==0||m.matrix.keep.and!==0||m.matrix.keep.but!==0)
  throw Error("GUM has no KEEP gold: do not publish three-class accuracy");
 const mapped= m.matrix.and.and + m.matrix.but.but;
 const total=m.count, predictedKeep=m.matrix.and.keep+m.matrix.but.keep;
 const labelTotals={and:Object.values(m.matrix.and).reduce((a,b)=>a+b,0),
  but:Object.values(m.matrix.but).reduce((a,b)=>a+b,0)};
 // Confusion matrix includes KEEP predictions as errors. Report precision
 // for AND/BUT, and F1 only over classes actually present in the gold labels.
 const perClass={};
 for(const label of ["and","but"]){
  const tp=m.matrix[label][label];
  const predicted=m.matrix.and[label]+m.matrix.but[label];
  const precision=predicted?tp/predicted:0;
  const recall=labelTotals[label]?tp/labelTotals[label]:0;
  perClass[label]={support:labelTotals[label],precision,recall,
   f1:precision+recall?2*precision*recall/(precision+recall):0};
 }
 return {
  assessed:total,mappedCorrect:mapped,
  mappedAccuracy:total?mapped/total:null,
  mappedBalancedRecall:(perClass.and.recall+perClass.but.recall)/2,
  mappedMacroF1:(perClass.and.f1+perClass.but.f1)/2,
  predictedKeepCount:predictedKeep,
  predictedKeepRate:total?predictedKeep/total:null,
  perClass,confusion:m.matrix,
  warning:"This is not three-class accuracy. No human-annotated KEEP gold cases exist in this pilot. Mapped AND/BUT labels are a provisional operational crosswalk."
 };
}
async function main(){
 const o=opt(process.argv.slice(2));
 const pilot=await json(o.input);
 const test=pilotRows(pilot);
 console.log("Authentic GUM pilot: "+test.length+" human-annotated implicit relations"+
  " across "+new Set(test.map(x=>x.document)).size+" documents.");
 console.log("Gold: AND "+test.filter(x=>x.gold==="and").length+
  "; BUT "+test.filter(x=>x.gold==="but").length+
  "; KEEP 0 (not annotated by source).");
 if(o.preview){
  for(const genre of new Set(test.map(x=>x.genre))){
   const first=test.find(x=>x.genre===genre);
   console.log("  "+genre+": "+test.filter(x=>x.genre===genre).length+
    " examples; "+first.id+" ("+first.relation+")");
  }
  console.log("Preview only: no LM inference or cache updates.");return;
 }
 const [joined,masked,oldData,priorCache]=await Promise.all([
  json(o.oldJoin),json(o.oldMask),json(o.oldDataset),
  json(o.oldHoldoutScores)
 ]);
 const originalCases=Array.isArray(oldData)?oldData:oldData.cases;
 const original=originalProbeRows(originalCases,
  assignExplicitRules(alignModelScores(joined,masked,originalCases),
   (source,offset)=>explicitBoundaryConnector(source,
    {punctuationStart:offset,punctuationEnd:offset+1})));
 const priorCases=generateHoldout().cases;
 const previous=attachPriorHoldoutScores(makeHoldoutRows(priorCases),
  priorCache,priorCases);
 const train=[...original,...previous];
 if(train.length!==402)throw Error("Original training size changed");
 for(const row of train){
  const pair=sentencePair(row.source,row.probe);
  row.left=pair.left;row.right=pair.right;
 }
 await obtainSemanticSignals(train,{
  file:o.oldSemanticScores,fingerprint:signalCacheFingerprint(train),
  readOnly:true,createScorer:()=>{throw Error("Previous model cache is required");}
 });
 const fitted=attachLexicalFeatures(addSemanticFeatures(train));
 console.log("Training frozen classifier on 402 synthetic development examples only.");
 const {createMaskedGapScorer}=await import("../extension/src/reader-mask-infill.mjs");
 const {createBoundaryLanguageScorer}=await import("../extension/src/reader-language-model.mjs");
 const digest=createHash("sha256").update(JSON.stringify(
  test.map(r=>[r.id,r.offset,r.source]))).digest("hex");
 await scoreLanguageModels(test,{
  file:o.lmCache,digest,offline:o.offline,
  createMask:createMaskedGapScorer,createGPT:createBoundaryLanguageScorer
 });
 const semantic=await obtainSemanticSignals(test,{
  file:o.semanticCache,fingerprint:signalCacheFingerprint(test),
  readOnly:o.offline
 });
 const assessed=attachLexicalFeatures(addSemanticFeatures(test.map(heldoutFeatures)));
 const results=frozenScores(fitted,assessed);
 const measured=calculateMappedMetrics(results);
 console.log("\nREAL-WORLD GUM PILOT — mapped labels only:");
 console.log("  "+measured.mappedCorrect+"/"+measured.assessed+" correct = "+
  (100*measured.mappedAccuracy).toFixed(1)+"% mapped accuracy");
 console.log("  Balanced AND/BUT recall: "+(100*measured.mappedBalancedRecall).toFixed(1)+
  "%; two-class macro F1 "+(100*measured.mappedMacroF1).toFixed(1)+"%");
 console.log("  Predictions of KEEP (unmeasured gold class): "+
  measured.predictedKeepCount+"/"+measured.assessed);
 for(const [label,x] of Object.entries(measured.perClass))
  console.log("  "+label.toUpperCase()+" "+x.support+" gold; precision "+
   (100*x.precision).toFixed(1)+"%; recall "+(100*x.recall).toFixed(1)+
   "%; F1 "+(100*x.f1).toFixed(1)+"%");
 for(const [genre,s] of Object.entries(pilot.meta.summary))
  console.log("  "+genre+" "+s.sampled+" mapped; eligible "+s.eligible+
   "; AND "+s.and+" BUT "+s.but);
 for(const e of results.errors.slice(0,o.maxErrors))
  console.log("  ERROR "+e.id+" "+e.gold+" => "+e.predicted+": "+e.source);
 const report={
  version:PILOT_VERSION,sourceRevision:GUM_COMMIT,
  selectionHash:pilot.meta.selectionHash,sourceSummary:pilot.meta.summary,
  scorer:"Frozen balanced linear + lexical fusion",
  trainSize:402,realWorldCases:assessed.length,
  note:"Human GDTB relations are mapped by rule to AND/BUT. This is a pilot with label-construct mismatch and missing KEEP ground truth. No retraining on pilot labels.",
  semanticScoring:semantic,metrics:measured,results
 };
 await mkdir(path.dirname(o.output),{recursive:true});
 await writeFile(o.output,JSON.stringify(report,null,2)+"\n");
 console.log("Saved "+o.output+" (local only; do not commit source excerpts).");
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
 main().catch(err=>{console.error(err?.stack||err);process.exitCode=1;});
