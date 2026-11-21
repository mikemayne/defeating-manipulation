#!/usr/bin/env node
/**
 * Read-only, no-inference audit of the already-scored authentic GUM pilot.
 *
 * Investigates:
 *   1. Source provenance, annotation offsets, sentence-vs-argument scope.
 *   2. Performance by ORIGINAL GDTB sense, genre, and source-span coverage.
 *   3. Model-feature shifts from 402 synthetic development examples, and
 *      whether KEEP / BUT predictions co-occur with particular signals.
 *   4. Example-level audit queue (NO labels changed, no thresholds tuned).
 *
 * A broad relation between sentences can be a valid AND even when no causal
 * relation exists. Do not relabel GDTB expansion.conjunction as KEEP.
 *
 * Usage:
 *   node scripts/audit-reader-gum-pilot.mjs --top 15
 *   node scripts/audit-reader-gum-pilot.mjs --top 0
 *
 * All third-party text and diagnostics remain in gitignored local files.
 */
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {GUM_COMMIT,VERSION as GUM_VERSION,parseGdtbRels,mapGdtbLabel}
 from "./build-reader-gum-pilot.mjs";
import {pilotRows} from "./evaluate-reader-gum-pilot.mjs";
import {heldoutFeatures,makeHoldoutRows} from "./evaluate-reader-holdout-v1.mjs";
import {generateHoldout} from "./build-reader-holdout-v1.mjs";
import {alignModelScores,assignExplicitRules} from "./evaluate-reader-fusion.mjs";
import {originalProbeRows,attachPriorHoldoutScores,signalCacheFingerprint,
  obtainSemanticSignals,addSemanticFeatures}
 from "./evaluate-reader-semantic-fusion.mjs";
import {attachLexicalFeatures,CONFIGURATIONS}
 from "./evaluate-reader-nonlinear-fusion.mjs";
import {sentencePair} from "../extension/src/reader-semantic-signals.mjs";
import {explicitBoundaryConnector} from "../extension/src/reader-connector-normalisation.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
export const AUDIT_VERSION="reader-gum-audit-v1";
const defaults={
 pilot:path.join(root,"evaluation/reader-gum-pilot-v1.json"),
 results:path.join(root,"evaluation/reader-gum-pilot-results.json"),
 sourceDir:path.join(root,"evaluation/reader-gum-source-cache",GUM_COMMIT),
 language:path.join(root,"evaluation/reader-gum-pilot-lm-scores.json"),
 semantic:path.join(root,"evaluation/reader-gum-pilot-semantic-scores.json"),
 oldJoin:path.join(root,"evaluation/reader-join-cross-validation.json"),
 oldMask:path.join(root,"evaluation/reader-mask-infill.json"),
 oldDataset:path.join(root,"evaluation/reader-strategy-synthetic-reference.json"),
 v1Scores:path.join(root,"evaluation/reader-holdout-v1-scores.json"),
 oldSemantic:path.join(root,"evaluation/reader-semantic-pair-scores.json"),
 output:path.join(root,"evaluation/reader-gum-pilot-audit.json"),
 top:12,sourceOnly:false
};
export const SIGNALS=Object.freeze([
 "semanticSimilarity","lexicalJaccard","lexicalContainment",
 "lexicalSemanticMismatch","gptQuality","gptContrast","bertContrast",
 "bertHyphen","bertPeriod","bertSo",
 "nliForwardContradiction","nliForwardEntailment",
 "nliReverseContradiction","nliReverseEntailment"
]);
const KEY=r=>JSON.stringify([r.id,r.offset]);
const SHA=s=>createHash("sha256").update(s).digest("hex");
const pct=x=>x==null?"n/a":(100*x).toFixed(1)+"%";
const mean=arr=>arr.reduce((a,b)=>a+b,0)/arr.length;
const median=arr=>{
 if(!arr.length)return null;
 const a=[...arr].sort((x,y)=>x-y);
 return a.length%2?a[Math.floor(a.length/2)]:0.5*(a[a.length/2-1]+a[a.length/2]);
};
async function json(file){return JSON.parse(await readFile(file,"utf8"));}
function getArgs(argv){
 const o={...defaults};const files=new Map(
  Object.keys(defaults).filter(x=>!["top","sourceOnly"].includes(x)).map(x=>["--"+x.replace(/[A-Z]/g,m=>"-"+m.toLowerCase()),x]));
 for(let i=0;i<argv.length;i++){
  const a=argv[i];
  if(a==="--help"||a==="-h"){
   console.log("node scripts/audit-reader-gum-pilot.mjs [--source-only] [--top N]"+
    " [--pilot PATH] [--results PATH] [--output PATH]\n"+
    "No model inference; requires existing pilot scores and pinned original GUM files.");process.exit(0);
  }
  if(a==="--source-only"){o.sourceOnly=true;continue;}
  if(a==="--top"){
   if(++i>=argv.length)throw Error("Missing --top value");
   o.top=Number(argv[i]);continue;
  }
  if(!files.has(a))throw Error("Unknown audit argument "+a);
  if(++i>=argv.length)throw Error("Missing value for "+a);
  o[files.get(a)]=path.resolve(process.cwd(),argv[i]);
 }
 if(!Number.isSafeInteger(o.top)||o.top<0||o.top>200)throw Error("Invalid --top");
 return o;
}
export function range(text){
 const m=/^(\d+)-(\d+)$/u.exec(String(text||""));
 return m?{start:+m[1],end:+m[2]}:null;
}
function isWhole(unit,sentence){
 const a=range(unit),b=range(sentence);
 return a&&b&&a.start===b.start&&a.end===b.end;
}
function coverage(unit,sentence){
 const a=range(unit),b=range(sentence);
 if(!a||!b||a.start<b.start||a.end>b.end||a.start>a.end)
  throw Error("Annotated unit outside its host sentence");
 return (a.end-a.start+1)/(b.end-b.start+1);
}
export function spanAudit(source,caseData){
 if(!source||!caseData)throw Error("Source row and pilot case required");
 if(source.doc!==caseData.document||source.line!==caseData.row||
  source.orig_label!==caseData.relation||
  source.rel_type!=="implicit")
  throw Error("GUM source provenance/label mismatch: "+caseData.id);
 const expected=caseData.expected_boundaries?.[0];
 const mapped=mapGdtbLabel(source.orig_label,source.rel_type).choice;
 if(mapped!==expected?.choice)
  throw Error("Frozen GUM label mapping changed: "+caseData.id);
 const left=source.unit1_sent.trim().replace(/\s+([,.!?;:])/gu,"$1");
 const right=source.unit2_sent.trim().replace(/\s+([,.!?;:])/gu,"$1");
 if(left+" "+right!==caseData.text||
  caseData.text[expected.offset]!==".")
  throw Error("Frozen sentence text changed from original GUM row: "+caseData.id);
 if(source.s1_toks!==caseData.tokenRanges?.[0]||
  source.s2_toks!==caseData.tokenRanges?.[1])
  throw Error("GUM sentence-token ranges changed: "+caseData.id);
 const first=coverage(source.unit1_toks,source.s1_toks);
 const second=coverage(source.unit2_toks,source.s2_toks);
 const whole1=Boolean(isWhole(source.unit1_toks,source.s1_toks));
 const whole2=Boolean(isWhole(source.unit2_toks,source.s2_toks));
 return {
  kind:whole1&&whole2?"both_whole":whole1?"second_partial":whole2?"first_partial":"both_partial",
  firstUnitFraction:first,secondUnitFraction:second,
  exactSentenceArguments:whole1&&whole2,
  unit1Toks:source.unit1_toks,unit2Toks:source.unit2_toks,
  sentence1Toks:source.s1_toks,sentence2Toks:source.s2_toks,
  // The real gold annotation refers to u1_raw/u2_raw; include these in
  // local diagnostic records to inspect what humans annotated.
  originalArgument1:source.u1_raw,originalArgument2:source.u2_raw
 };
}
export function distribution(rows,field){
 const values=rows.map(x=>x.features?.[field]).filter(Number.isFinite);
 if(values.length!==rows.length)throw Error("Incomplete feature "+field);
 return {count:values.length,mean:mean(values),median:median(values),
  min:Math.min(...values),max:Math.max(...values)};
}
export function tabulate(rows,groupBy){
 const groups=new Map();
 for(const r of rows){
  const k=groupBy(r);
  if(!groups.has(k))groups.set(k,[]);
  groups.get(k).push(r);
 }
 return Object.fromEntries([...groups].sort((a,b)=>String(a[0]).localeCompare(String(b[0])))
  .map(([name,items])=>{
   const predicted={keep:0,and:0,but:0};
   for(const item of items)predicted[item.predicted]++;
   const correct=items.filter(r=>r.gold===r.predicted).length;
   const gold={keep:0,and:0,but:0};
   for(const item of items)gold[item.gold]++;
   return [name,{count:items.length,correct,accuracy:correct/items.length,gold,predicted,
    keepPredictionRate:predicted.keep/items.length}];
  }));
}
function indexItems(list,name){
 if(!Array.isArray(list))throw Error("Missing "+name+" predictions");
 const byId=new Map();
 for(const row of list){const k=KEY(row);
  if(byId.has(k))throw Error("Duplicate "+name+" score "+k);
  byId.set(k,row);}
 return byId;
}
export function scoredAuditRows(cases,rows,results,language,semantic){
 const rs=indexItems(results?.results?.predictions,"results");
 const ls=indexItems(language?.predictions,"language");
 const ss=indexItems(semantic?.predictions,"semantic");
 if(rs.size!==rows.length||ls.size!==rows.length||ss.size!==rows.length)
  throw Error("A score/result cache does not contain the full frozen pilot");
 const keyed=new Map(cases.map(r=>[r.id,r]));
 return rows.map(row=>{
  const original=keyed.get(row.id),pred=rs.get(KEY(row));
  const lm=ls.get(KEY(row)),sem=ss.get(KEY(row));
  if(!pred||!lm||!sem||!original||
   pred.gold!==row.gold||pred.challenge!==row.relation||
   !["keep","and","but"].includes(pred.predicted)||
   lm.source!==row.source||lm.prompt!==row.prompt||
   sem.source!==row.source||sem.left!==row.left||sem.right!==row.right)
    throw Error("Score or result provenance mismatch at "+row.id);
  const enriched=attachLexicalFeatures(addSemanticFeatures([
   {...heldoutFeatures({...row,scores:lm.scores}),semantic:sem.signals}
  ]))[0];
  return {...enriched,predicted:pred.predicted};
 });
}
export function analyzeAudit(scored,synthetic,spanById){
 if(scored.length!==250||synthetic.length!==402)
  throw Error("Expected complete 250 pilot and 402 previous training rows");
 for(const row of scored)if(!spanById.has(row.id))
  throw Error("Missing original argument span "+row.id);
 const observed=scored.map(r=>({...r,span:spanById.get(r.id)}));
 const features=Object.fromEntries(SIGNALS.map(name=>[
  name,{synthetic:distribution(synthetic,name),realWorld:distribution(observed,name),
   byGold:Object.fromEntries(["and","but"].map(g=>[
    g,distribution(observed.filter(x=>x.gold===g),name)
   ])),
   byPrediction:Object.fromEntries(["keep","and","but"].map(g=>{
    const subset=observed.filter(x=>x.predicted===g);
    return [g,subset.length?distribution(subset,name):null];
   }))}
 ]));
 const scoredSubset=observed.filter(x=>x.span.exactSentenceArguments);
 const totalCorrect=observed.filter(x=>x.gold===x.predicted).length;
 return {
  version:AUDIT_VERSION,
  originalResult:{correct:totalCorrect,total:observed.length,
   accuracy:totalCorrect/observed.length,
   keepPredictions:observed.filter(x=>x.predicted==="keep").length},
  spanCoverage:{
   counts:tabulate(observed,r=>r.span.kind),
   wholeSentenceCount:scoredSubset.length,
   partialSentenceCount:observed.length-scoredSubset.length,
   wholeSentencePerformance:scoredSubset.length?tabulate(scoredSubset,()=> "whole"):null
  },
  byOriginalRelation:tabulate(observed,r=>r.relation),
  byGenre:tabulate(observed,r=>r.genre),
  byGold:tabulate(observed,r=>r.gold),
  byPrediction:tabulate(observed,r=>r.predicted),
  signals:features,
  cases:observed.map(r=>({
   id:r.id,source:r.source,document:r.document,genre:r.genre,
   relation:r.relation,gold:r.gold,predicted:r.predicted,
   correct:r.gold===r.predicted,span:r.span,
   scores:Object.fromEntries(SIGNALS.map(k=>[k,r.features[k]]))
  }))
 };
}
function printGroups(title,groups){
 console.log("\n"+title);
 for(const [name,r] of Object.entries(groups))
  console.log("  "+name+": "+r.correct+"/"+r.count+" ("+pct(r.accuracy)+
   "); predicted KEEP "+r.predicted.keep+
   ", AND "+r.predicted.and+", BUT "+r.predicted.but);
}
async function main(){
 const o=getArgs(process.argv.slice(2));
 const pilot=await json(o.pilot);
 if(pilot.meta.version!==GUM_VERSION)
  throw Error("Not the frozen GUM pilot");
 const pilotData=pilotRows(pilot);
 const spanById=new Map(),loaded=new Map();
 for(const item of pilot.cases){
  if(!loaded.has(item.document)){
   const filename=path.join(o.sourceDir,item.document+".rels");
   const raw=await readFile(filename,"utf8");
   const expected=pilot.meta.originChecksums?.[item.genre]?.[item.document]?.sha256;
   if(expected!==SHA(raw))throw Error("Original GUM source checksum mismatch: "+item.document);
   loaded.set(item.document,parseGdtbRels(raw,item.document));
  }
  const line=loaded.get(item.document).find(r=>r.line===item.row);
  if(!line)throw Error("GUM original line no longer present: "+item.id);
  spanById.set(item.id,spanAudit(line,item));
 }
 if(o.sourceOnly){
  const counts={both_whole:0,first_partial:0,second_partial:0,both_partial:0};
  const byRelation={};
  for(const c of pilot.cases){
   const span=spanById.get(c.id);counts[span.kind]++;
   const key=c.relation;
   if(!byRelation[key])byRelation[key]={total:0,whole:0};
   byRelation[key].total++;
   if(span.exactSentenceArguments)byRelation[key].whole++;
  }
  console.log("SOURCE-ONLY GUM SPAN AUDIT — 250 original annotations verified");
  console.log("  Whole/partial scopes: "+JSON.stringify(counts));
  console.log("  By original relation: "+JSON.stringify(byRelation));
  console.log("  Original classifier accuracy unchanged; no prediction files read.");
  return;
 }
 const [results,lm,sem,joined,masked,oldData,v1Cache]=await Promise.all([
  o.results,o.language,o.semantic,
  o.oldJoin,o.oldMask,o.oldDataset,o.v1Scores
 ].map(json));
 if(results.version!==GUM_VERSION||pilot.meta.selectionHash!==results.selectionHash)
  throw Error("Results do not match the original frozen GUM selection");
 if(sem.corpusFingerprint!==signalCacheFingerprint(pilotData))
  throw Error("GUM semantic cache fingerprint changed");
 const scored=scoredAuditRows(pilot.cases,pilotData,results,lm,sem);
 const previousCases=Array.isArray(oldData)?oldData:oldData.cases;
 const oldRows=originalProbeRows(previousCases,
  assignExplicitRules(alignModelScores(joined,masked,previousCases),
   (source,offset)=>explicitBoundaryConnector(source,{
    punctuationStart:offset,punctuationEnd:offset+1
   })));
 const v1=generateHoldout().cases;
 const newer=attachPriorHoldoutScores(makeHoldoutRows(v1),v1Cache,v1);
 const train=[...oldRows,...newer];
 for(const r of train){const pair=sentencePair(r.source,r.probe);
  r.left=pair.left;r.right=pair.right;}
 await obtainSemanticSignals(train,{file:o.oldSemantic,
  fingerprint:signalCacheFingerprint(train),readOnly:true,
  createScorer:()=>{throw Error("Inference not permitted in audit");},log:()=>{}});
 const synthetic=attachLexicalFeatures(addSemanticFeatures(train));
 const audit=analyzeAudit(scored,synthetic,spanById);
 const baseline=results.metrics;
 if(audit.originalResult.correct!==baseline.mappedCorrect||
  audit.originalResult.keepPredictions!==baseline.predictedKeepCount||
  audit.originalResult.total!==baseline.assessed)
   throw Error("Audit changed original result; do not interpret diagnostics");
 const report={
  ...audit,
  sample:{source:"GUM GDTB",revision:GUM_COMMIT,
   selectionHash:pilot.meta.selectionHash,genres:10,
   note:"Source GDTB annotation vs sentence scope compared without changing any gold label"},
  methodology:"No refitting, no modified labels, no neural inference. Group slices are descriptive only, not new held-out accuracy claims.",
  caution:"No gold KEEP; grouped samples have dependent observations; strict whole-unit subset is descriptive, not independently selected. Real-source annotations may not map exactly to reading an inserted AND/BUT."
 };
 console.log("GUM READ-ONLY AUDIT — "+report.originalResult.correct+"/250 "+
  pct(report.originalResult.accuracy)+
  "; KEEP predictions "+report.originalResult.keepPredictions);
 printGroups("Full-sentence versus original argument-span coverage",audit.spanCoverage.counts);
 printGroups("By original GDTB annotation",audit.byOriginalRelation);
 printGroups("By genre",audit.byGenre);
 console.log("\nFeature distributions: synthetic versus GUM");
 for(const k of SIGNALS){
  const a=audit.signals[k];
  console.log("  "+k+": synthetic median "+a.synthetic.median.toFixed(3)+
   ", GUM median "+a.realWorld.median.toFixed(3)+
   "; GUM predicted KEEP median "+
   (a.byPrediction.keep?.median.toFixed(3)??"n/a"));
 }
 const queue=report.cases.filter(x=>!x.correct)
  .sort((a,b)=>
   Number(b.span.exactSentenceArguments)-Number(a.span.exactSentenceArguments)||
   String(a.relation).localeCompare(String(b.relation))||
   a.id.localeCompare(b.id)).slice(0,o.top);
 if(queue.length)console.log("\nUNMODIFIED ERROR REVIEW QUEUE");
 for(const x of queue){
  console.log("  "+x.id+" "+x.relation+" "+x.gold+" -> "+x.predicted+
   " ["+x.span.kind+"]");
  console.log("   SENTENCES: "+x.source);
  if(!x.span.exactSentenceArguments)
   console.log("   ANNOTATED SPANS: "+x.span.originalArgument1+" | "+
    x.span.originalArgument2);
 }
 await mkdir(path.dirname(o.output),{recursive:true});
 await writeFile(o.output,JSON.stringify(report,null,2)+"\n");
 console.log("\nSaved local audit: "+o.output);
 console.log("No inference, model changes or relabelling performed.");
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
 main().catch(e=>{console.error(e?.stack||e);process.exitCode=1;});
