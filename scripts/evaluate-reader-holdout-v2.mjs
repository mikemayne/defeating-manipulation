#!/usr/bin/env node
/**
 * Frozen 1000-case synthetic stress test. Fits the already-selected
 * LINEAR+LEXICAL classifier on the prior 102+300 development examples only.
 * New v2 gold labels are used ONLY for scoring predictions.
 *
 * node scripts/build-reader-holdout-v2.mjs
 * node scripts/evaluate-reader-holdout-v2.mjs --preview
 * node scripts/evaluate-reader-holdout-v2.mjs --max-errors 5
 * node scripts/evaluate-reader-holdout-v2.mjs --offline
 */
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {readScenarioSeeds,buildCorpus,VERSION} from "./build-reader-holdout-v2.mjs";
import {generateHoldout} from "./build-reader-holdout-v1.mjs";
import {makeHoldoutRows,heldoutFeatures} from "./evaluate-reader-holdout-v1.mjs";
import {alignModelScores,assignExplicitRules,trainFusion} from "./evaluate-reader-fusion.mjs";
import {originalProbeRows,attachPriorHoldoutScores,signalCacheFingerprint,
 obtainSemanticSignals,addSemanticFeatures} from "./evaluate-reader-semantic-fusion.mjs";
import {attachLexicalFeatures,CONFIGURATIONS} from "./evaluate-reader-nonlinear-fusion.mjs";
import {sentencePair} from "../extension/src/reader-semantic-signals.mjs";
import {extractBoundaryProbes,buildBoundaryChoices} from "../extension/src/reader-boundary-scorer.mjs";
import {explicitBoundaryConnector} from "../extension/src/reader-connector-normalisation.mjs";
import {maskedGapPrompt,MASK_MODEL,MASK_TEMPLATE_VERSION} from "../extension/src/reader-mask-infill.mjs";
// Keep this constant available to offline CI without loading the ONNX runtime.
const BOUNDARY_LM="Xenova/distilgpt2";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const LABELS=["keep","and","but"];
export const CACHE_VERSION="reader-holdout-v2-lm-v1";
const defaults={
 oldJoin:path.join(root,"evaluation/reader-join-cross-validation.json"),
 oldMask:path.join(root,"evaluation/reader-mask-infill.json"),
 oldData:path.join(root,"evaluation/reader-strategy-synthetic-reference.json"),
 v1Scores:path.join(root,"evaluation/reader-holdout-v1-scores.json"),
 previousSemantic:path.join(root,"evaluation/reader-semantic-pair-scores.json"),
 lmScores:path.join(root,"evaluation/reader-holdout-v2-lm-scores.json"),
 semanticScores:path.join(root,"evaluation/reader-holdout-v2-semantic-scores.json"),
 output:path.join(root,"evaluation/reader-holdout-v2-results.json"),
 maxErrors:5,preview:false,offline:false
};
const finite=Number.isFinite;
const pct=n=>n==null?"n/a":(100*n).toFixed(1)+"%";
const keyOf=row=>JSON.stringify([row.id,row.offset]);
export function parseOptions(args){
 const o={...defaults};
 const files=new Map(Object.entries({
  "--old-join":"oldJoin","--old-mask":"oldMask","--old-data":"oldData",
  "--v1-scores":"v1Scores","--previous-semantic":"previousSemantic",
  "--lm-scores":"lmScores","--semantic-scores":"semanticScores","--output":"output"
 }));
 for(let i=0;i<args.length;i++){
  const a=args[i];
  if(a==="--help"||a==="-h"){
   console.log("Usage: node scripts/evaluate-reader-holdout-v2.mjs "+
    "[--preview] [--offline] [--max-errors N] [--lm-scores PATH] "+
    "[--semantic-scores PATH] [--output PATH]");process.exit(0);
  }
  if(a==="--preview"||a==="--offline"){o[a.slice(2)]=true;continue;}
  if(a==="--max-errors"){
   if(++i>=args.length)throw Error("Missing --max-errors value");
   o.maxErrors=Number(args[i]);continue;
  }
  if(!files.has(a))throw Error("Unknown option "+a);
  if(++i>=args.length)throw Error("Missing file path for "+a);
  o[files.get(a)]=path.resolve(process.cwd(),args[i]);
 }
 if(!Number.isSafeInteger(o.maxErrors)||o.maxErrors<0||o.maxErrors>200)
  throw Error("Invalid error count");
 return o;
}
async function json(file){return JSON.parse(await readFile(file,"utf8"));}
export function makeV2Rows(cases){
 if(cases.length!==1000)throw Error("Expected exactly 1000 frozen cases");
 const ids=new Set(),rows=[];
 for(const item of cases){
  if(ids.has(item.id))throw Error("Duplicate case "+item.id);
  ids.add(item.id);
  if(item.expected_boundaries?.length!==1)throw Error("One labelled boundary required");
  const {offset,choice}=item.expected_boundaries[0];
  if(!LABELS.includes(choice)||item.text[offset]!==".")
   throw Error("Invalid target choice/offset "+item.id);
  const probes=extractBoundaryProbes(item.text,{maxPairs:12});
  const probe=probes.find(p=>p.punctuationStart===offset);
  if(!probe)throw Error("Missing punctuation probe "+item.id+" @"+offset);
  const choices=buildBoundaryChoices(item.text,probe);
  const prompt=maskedGapPrompt(item.text,probe);
  if(choices.length!==2||choices[0].id!=="and"||choices[1].id!=="but"||!prompt)
   throw Error("Invalid model probe "+item.id);
  const pair=sentencePair(item.text,probe);
  rows.push({id:item.id,offset,gold:choice,family:item.family,
   challenge:item.challenge,domain:item.domain,source:item.text,
   probe,choices,prompt:prompt.text,left:pair.left,right:pair.right,
   explicit:explicitBoundaryConnector(item.text,probe)});
 }
 return rows;
}
export function corpusHash(cases){
 return createHash("sha256").update(JSON.stringify(cases)).digest("hex");
}
function validCached(entry,row,digest){
 if(!entry||entry.version!==CACHE_VERSION||entry.digest!==digest||
    entry.id!==row.id||entry.offset!==row.offset||
    entry.source!==row.source||entry.prompt!==row.prompt||
    entry.maskModel!==MASK_MODEL||entry.maskVersion!==MASK_TEMPLATE_VERSION||
    entry.gptModel!==BOUNDARY_LM)return false;
 const s=entry.scores;
 return [s?.gptAnd,s?.gptBut,s?.mask?.and,s?.mask?.but,
  s?.mask?.["-"],s?.mask?.["."],s?.mask?.so].every(finite);
}
async function writeScores(file,rows,byId,digest){
 await mkdir(path.dirname(file),{recursive:true});
 await writeFile(file,JSON.stringify({
  version:CACHE_VERSION,digest,maskModel:MASK_MODEL,gptModel:BOUNDARY_LM,
  predictions:rows.map(row=>byId.get(keyOf(row))).filter(Boolean)
 },null,2)+"\n");
}
export async function scoreLanguageModels(rows,{file,digest,offline=false,
 createMask,createGPT,log=console.log}={}){
 const byId=new Map();let previous;
 try{previous=await json(file);}catch(e){if(e.code!=="ENOENT")throw e;}
 if(previous){
  if(previous.version!==CACHE_VERSION||previous.digest!==digest||
     previous.maskModel!==MASK_MODEL||previous.gptModel!==BOUNDARY_LM)
   throw Error("Frozen v2 LM cache version or digest mismatch");
  for(const entry of previous.predictions||[]){
   const k=keyOf(entry);
   if(byId.has(k))throw Error("Duplicate LM cache entry "+k);
   byId.set(k,entry);
  }
 }
 const wanted=new Set(rows.map(keyOf));
 if(wanted.size!==rows.length)throw Error("Duplicate target rows");
 for(const k of byId.keys())if(!wanted.has(k))throw Error("Extra cached score "+k);
 let newCount=0,reused=0,mask=null,gpt=null;
 for(const row of rows){
  const k=keyOf(row),prior=byId.get(k);
  if(validCached(prior,row,digest)){row.scores=prior.scores;reused++;continue;}
  if(offline)throw Error("Missing/invalid LM score for "+row.id+" in offline mode");
  if(!createMask||!createGPT)throw Error("Model factories required");
  if(!mask)mask=await createMask({onStatus:log});
  if(!gpt)gpt=await createGPT({onStatus:log});
  const masked=await mask.score(row.source,row.probe);
  if(!masked||masked.text!==row.prompt)throw Error("Changed masked prompt for "+row.id);
  const gptAnd=await gpt(row.choices[0].prefix,row.choices[0].completion);
  const gptBut=await gpt(row.choices[1].prefix,row.choices[1].completion);
  const scores={gptAnd,gptBut,mask:masked.scores};
  if(![gptAnd,gptBut,scores.mask?.and,scores.mask?.but,scores.mask?.["-"],
    scores.mask?.["."],scores.mask?.so].every(finite))
   throw Error("Nonfinite LM score for "+row.id);
  row.scores=scores;
  byId.set(k,{version:CACHE_VERSION,digest,id:row.id,offset:row.offset,
   source:row.source,prompt:row.prompt,
   maskModel:MASK_MODEL,maskVersion:MASK_TEMPLATE_VERSION,gptModel:BOUNDARY_LM,scores});
  newCount++;
  if(newCount%10===0){
   await writeScores(file,rows,byId,digest);
   log("v2 LM scoring: "+newCount+" new, "+reused+" cached (checkpoint saved)");
  }
 }
 if(newCount)await writeScores(file,rows,byId,digest);
 log("v2 LM scoring complete: "+newCount+" new, "+reused+" cached");
 return {newCount,reused};
}
export function frozenScores(train,test){
 const keys=CONFIGURATIONS["linear+lexical"].keys;
 const fit=train.filter(r=>!r.explicit);
 const model=trainFusion(fit,keys,{balanced:true});
 const rows=test.map(row=>({...row,predicted:row.explicit?.choice??model(row)}));
 const matrix=Object.fromEntries(LABELS.map(g=>
  [g,Object.fromEntries(LABELS.map(p=>[p,0]))]));
 const groups={};
 for(const row of rows){
  matrix[row.gold][row.predicted]++;
  const c=row.challenge;
  if(!groups[c])groups[c]={count:0,correct:0};
  groups[c].count++;
  if(row.gold===row.predicted)groups[c].correct++;
 }
 const recall=Object.fromEntries(LABELS.map(g=>{
  const n=Object.values(matrix[g]).reduce((a,b)=>a+b,0);
  return [g,n?matrix[g][g]/n:null];
 }));
 const correct=LABELS.reduce((sum,g)=>sum+matrix[g][g],0);
 const present=LABELS.filter(g=>recall[g]!==null);
 return {combined:{correct,count:rows.length,accuracy:correct/rows.length,
   balancedAccuracy:present.reduce((s,g)=>s+recall[g],0)/present.length,
   matrix,recall},
  byChallenge:Object.fromEntries(Object.entries(groups)
   .map(([name,g])=>[name,{...g,accuracy:g.correct/g.count}])),
  predictions:rows.map(r=>({id:r.id,offset:r.offset,family:r.family,
   domain:r.domain,challenge:r.challenge,gold:r.gold,predicted:r.predicted})),
  errors:rows.filter(r=>r.gold!==r.predicted).map(r=>({
   id:r.id,family:r.family,domain:r.domain,challenge:r.challenge,
   gold:r.gold,predicted:r.predicted,source:r.source}))};
}
async function main(){
 const o=parseOptions(process.argv.slice(2));
 const corpus=buildCorpus(await readScenarioSeeds());
 const test=makeV2Rows(corpus.cases);
 const hash=corpusHash(corpus.cases);
 console.log("Frozen "+VERSION+": "+test.length+" boundaries, "+
  new Set(test.map(r=>r.family)).size+" scenario families; SHA-256 "+hash);
 if(o.preview){
  for(let i=0;i<test.length;i+=100){
   const row=test[i];
   console.log("  "+row.id+" "+row.challenge+" "+JSON.stringify({
    left:row.left,right:row.right}));
  }
  console.log("Preview only: no neural inference or file writes.");return;
 }
 const [joined,masked,oldData,v1scores]=await Promise.all([
  json(o.oldJoin),json(o.oldMask),json(o.oldData),json(o.v1Scores)
 ]);
 const oldCases=Array.isArray(oldData)?oldData:oldData.cases;
 const oldRows=originalProbeRows(oldCases,
  assignExplicitRules(alignModelScores(joined,masked,oldCases),
   (source,offset)=>explicitBoundaryConnector(source,{
    punctuationStart:offset,punctuationEnd:offset+1})));
 const v1=generateHoldout().cases;
 const v1Rows=attachPriorHoldoutScores(makeHoldoutRows(v1),v1scores,v1);
 const training=[...oldRows,...v1Rows];
 if(training.length!==402)throw Error("Expected 402 prior development boundaries");
 for(const row of training){
  const pair=sentencePair(row.source,row.probe);
  row.left=pair.left;row.right=pair.right;
 }
 await obtainSemanticSignals(training,{file:o.previousSemantic,
  fingerprint:signalCacheFingerprint(training),readOnly:true,
  createScorer:()=>{throw Error("No training inference allowed");}});
 const fitRows=attachLexicalFeatures(addSemanticFeatures(training));
 console.log("Training frozen linear+lexical fusion on the previous "+
  fitRows.length+" examples ONLY.");
 const {createBoundaryLanguageScorer}=await import("../extension/src/reader-language-model.mjs");
 const {createMaskedGapScorer}=await import("../extension/src/reader-mask-infill.mjs");
 await scoreLanguageModels(test,{file:o.lmScores,digest:hash,offline:o.offline,
  createGPT:createBoundaryLanguageScorer,createMask:createMaskedGapScorer});
 const replay=await obtainSemanticSignals(test,{
  file:o.semanticScores,fingerprint:signalCacheFingerprint(test),
  readOnly:o.offline
 });
 console.log("v2 semantic scoring: "+replay.newCount+" new, "+replay.reused+" cached");
 const assessed=attachLexicalFeatures(addSemanticFeatures(test.map(heldoutFeatures)));
 const results=frozenScores(fitRows,assessed);
 const c=results.combined;
 console.log("LINEAR+LEXICAL: "+c.correct+"/"+c.count+" = "+
  pct(c.accuracy)+"; balanced "+pct(c.balancedAccuracy));
 for(const label of LABELS)
  console.log("  "+label.toUpperCase()+": "+pct(c.recall[label])+
   " "+JSON.stringify(c.matrix[label]));
 for(const [name,g] of Object.entries(results.byChallenge))
  console.log("  "+name+": "+g.correct+"/"+g.count+" = "+pct(g.accuracy));
 for(const e of results.errors.slice(0,o.maxErrors))
  console.log("  ERROR "+e.id+" "+e.gold+" => "+e.predicted+": "+e.source);
 const report={
  description:"First v2 synthetic stress test of frozen linear+lexical fusion",
  corpusVersion:VERSION,corpusHash:hash,
  trainingBoundaries:fitRows.length,holdoutBoundaries:assessed.length,
  scenarioFamilies:new Set(test.map(r=>r.family)).size,
  model:"linear+lexical",
  training:"Previous 102+300 labelled cases; no v2 gold used during fitting",
  caveat:"Author-made synthetic data, 100 scenario families and no independent annotations. Not representative real-world performance. After inspection, v2 becomes development data.",
  results
 };
 await mkdir(path.dirname(o.output),{recursive:true});
 await writeFile(o.output,JSON.stringify(report,null,2)+"\n");
 console.log("Saved "+o.output);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
 main().catch(e=>{console.error(e?.stack||e);process.exitCode=1;});
