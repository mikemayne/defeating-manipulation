#!/usr/bin/env node
/**
 * Genuine-text end-to-end implied-conclusion diagnostic.
 *
 * Downloads UNMODIFIED, untokenized #text paragraph lines from pinned GUM
 * CoNLL-U training docs, runs the SAME in-browser FLAN-T5 and MNLI models,
 * and summarizes ONLY source-free counts. No public text committed or logged.
 *
 * Usage:
 *   node scripts/evaluate-implicit-real-gum.mjs --help
 *   node scripts/evaluate-implicit-real-gum.mjs --sample-only
 *   node scripts/evaluate-implicit-real-gum.mjs --run
 *
 * Not a labelled accuracy benchmark. The GUM corpus has no human reference
 * labels for this project's inferred rhetorical conclusions; unlabelled
 * observations are strictly separated from authored control cases.
 */
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {extractArgumentStatements}
 from "../extension/src/argument-clauses.mjs";
import {findImplicitConclusionQuestions,reconstructImplicitConclusions,
 checkImpliedConclusions} from "../extension/src/implicit-conclusion-reconstruction.mjs";
import {combineArgumentEvidence}
 from "../extension/src/argument-analysis.mjs";
import {summarizeImplicitConclusionCases}
 from "../extension/src/implicit-conclusion-lab.mjs";
import {identifyImplicitLinks,scoreImplicitLinks}
 from "./implicit-gum-argument-links.mjs";

export const VERSION="implicit-gum-real-e2e-v1";
export const GUM_SHA="1d999e5a0327ecb83015007774f6a9be23ecbc41";
export const TARGET=180;
export const SEED="implicit-gum-rhetorical-e2e-v1";
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const MANIFEST=path.join(ROOT,"evaluation/reader-authentic-transfer-documents-v1.json");
const CONTENT_URL="https://raw.githubusercontent.com/amir-zeldes/gum/"+
 GUM_SHA+"/dep/";
const sha=x=>createHash("sha256").update(String(x)).digest("hex");
const readonly=x=>x.replace(/\s+/gu," ").trim();

/** GUM's conllu # text preserves word spacing and punctuation. */
export function extractConlluParagraphs(content,document,genre){
 if(typeof content!=="string"||!content.includes("# newdoc id = "+document)||
  !/^[a-z]+$/u.test(genre))
  throw Error("Invalid GUM CoNLL-U document");
 const paragraphs=[];let sentences=[],header=false;
 function flush(){
  if(!sentences.length)return;
  const text=readonly(sentences.join(" "));
  sentences=[];
  if(header||text.length<85||text.length>2400||
   text.includes("___")||/<[^>]{2,}>/u.test(text)||
   text.split(/\s+/u).length<15)return;
  paragraphs.push({document,genre,text,
   id:sha(VERSION+"|"+document+"|"+paragraphs.length+"|"+text)
    .slice(0,20)});
 }
 for(const line of content.split(/\r?\n/u)){
  if(line==="# newpar"){flush();header=false;continue;}
  if(line.startsWith("# newpar_block = ")){
   header=/\b(?:head|caption|byline|list)\b/iu.test(line);continue;
  }
  if(line.startsWith("# text = ")){
   const sentence=line.slice(9).trim();
   if(sentence&&sentence!=="_"&&!/^[_\s]+$/u.test(sentence))
    sentences.push(sentence);
  }
 }
 flush();
 return paragraphs;
}
export function selectGumTrainingDocs(manifest){
 if(manifest?.version!=="reader-authentic-transfer-docs-v1"||
  manifest.sourceRevision!==GUM_SHA||!manifest.genres)
  throw Error("Pinned GUM training-doc manifest mismatch");
 const out=[];
 for(const [genre,partition] of Object.entries(manifest.genres)){
  if(!Array.isArray(partition.train)||partition.train.length!==3)
   throw Error("Unexpected training partition");
  // No Reddit raw text in public GUM; it deliberately contains underscores.
  if(genre==="reddit")continue;
  for(const document of partition.train){
   if(!new RegExp("^GUM_"+genre+"_[a-z0-9]+$","u").test(document)||
    partition.test?.includes(document)||partition.review?.includes(document))
    throw Error("Disallowed GUM source document");
   out.push({document,genre});
  }
 }
 if(out.length!==33||new Set(out.map(d=>d.document)).size!==33)
  throw Error("Expected 33 source-disjoint, non-Reddit GUM TRAIN documents");
 return out;
}
export async function loadCorpus(manifest,{fetcher=fetch,onProgress=()=>{}}={}){
 const docs=selectGumTrainingDocs(manifest),rows=[];
 for(let i=0;i<docs.length;i+=4){
  const batch=docs.slice(i,i+4);
  const got=await Promise.all(batch.map(async ({document,genre})=>{
   const resp=await fetcher(CONTENT_URL+encodeURIComponent(document)+".conllu");
   if(!resp.ok)throw Error("GUM download status "+resp.status+
    " for hashed document "+sha(document).slice(0,10));
   return extractConlluParagraphs(await resp.text(),document,genre);
  }));
  for(const pieces of got)rows.push(...pieces);
  onProgress({downloadedDocs:Math.min(i+4,docs.length),totalDocs:docs.length});
 }
 return rows;
}
function gate(row){
 const statements=extractArgumentStatements(row.text);
 return findImplicitConclusionQuestions(row.text,statements);
}
/**
 * Fixed sample balanced across genre, with all eligible rhetorical cases
 * preferred, then genuine neutral/other paragraphs as controls.
 * Importantly the gate is a model CANDIDATE FILTER, not a gold label.
 */
export function chooseGumSample(rows,{target=TARGET}={}){
 if(!Array.isArray(rows)||rows.length<target||
  !Number.isSafeInteger(target)||target<100||target>200)
  throw Error("Need 100–200 authentic paragraphs");
 const seen=new Set(),all=[];
 for(const row of rows){
  if(!row||!row.id||!row.document||!row.genre||
   typeof row.text!=="string"||seen.has(row.id))
   throw Error("Duplicate/malformed GUM paragraph");
  seen.add(row.id);
  const candidateCount=gate(row).length;
  all.push({...row,candidateCount});
 }
 const positive=all.filter(r=>r.candidateCount>0);
 const negative=all.filter(r=>r.candidateCount===0);
 const counts=new Map(),genres=new Map(),picked=[];
 function roundRobin(pool,limit){
  const candidates=[...pool].sort((a,b)=>
   (counts.get(a.document)||0)-(counts.get(b.document)||0)||
   (genres.get(a.genre)||0)-(genres.get(b.genre)||0)||
   sha(SEED+"|"+a.id).localeCompare(sha(SEED+"|"+b.id)));
  for(const row of candidates){
   if(picked.length>=limit)break;
   if((counts.get(row.document)||0)>=15||(genres.get(row.genre)||0)>=30)
    continue;
   picked.push(row);
   counts.set(row.document,(counts.get(row.document)||0)+1);
   genres.set(row.genre,(genres.get(row.genre)||0)+1);
  }
 }
 // Use candidate-enriched sample; avoid the trivial 0-eligible evaluation.
 roundRobin(positive,Math.min(target,60));
 roundRobin(negative,target);
 if(picked.length<target)roundRobin(
  all.filter(x=>!picked.some(p=>p.id===x.id)),target);
 if(picked.length!==target)throw Error("Too few diverse eligible paragraphs");
 picked.sort((a,b)=>sha(SEED+"|order|"+a.id)
  .localeCompare(sha(SEED+"|order|"+b.id)));
 return {
  version:VERSION,rawAvailable:rows.length,rawCandidates:positive.length,
  selected:target,selectedCandidates:picked.filter(x=>x.candidateCount>0).length,
  genres:[...genres.keys()].sort(),documents:counts.size,
  rows:picked
 };
}
// Each control is entirely invented, not copied from a public source.
export const AUTHORED=Object.freeze([
 {id:"author-p01",expected_implicit:true,text:"The committee missed three deadlines. And we are supposed to trust its new timetable after that?"},
 {id:"author-p02",expected_implicit:true,text:"The audit exposed missing invoices. Why should we believe the spending figures after that failure?"},
 {id:"author-p03",expected_implicit:true,text:"The bridge inspection reported cracks. How can we trust the safety assurances given what the report found?"},
 {id:"author-p04",expected_implicit:true,text:"The supplier promised a refund but delayed it twice. Why should anyone trust this supplier after that?"},
 {id:"author-p05",expected_implicit:true,text:"The survey omitted half the respondents. And we are supposed to accept these findings given what was omitted?"},
 {id:"author-p06",expected_implicit:true,text:"The schedule has changed repeatedly. Who would believe the published times after all these changes?"},
 {id:"author-p07",expected_implicit:true,text:"The device failed its quality check. How can we believe the reliability claims after that failure?"},
 {id:"author-p08",expected_implicit:true,text:"The report's sample was tiny. Why should we accept the conclusion given that weak sample?"},
 {id:"author-n01",expected_implicit:false,text:"Can you tell me when the committee meets next week?"},
 {id:"author-n02",expected_implicit:false,text:"The audit documented the spending for three departments."},
 {id:"author-n03",expected_implicit:false,text:"What time is the bridge inspection scheduled for?"},
 {id:"author-n04",expected_implicit:false,text:"The supplier promised a refund and sent it promptly."},
 {id:"author-n05",expected_implicit:false,text:"Will you trust the weather report tomorrow?"},
 {id:"author-n06",expected_implicit:false,text:"The survey asked eight hundred residents about local transport."},
 {id:"author-n07",expected_implicit:false,text:"Can anyone tell me what the timetable says?"},
 {id:"author-n08",expected_implicit:false,text:"The committee revised the plan because the figures changed."}
]);
export async function evaluateRows(rows,generate,checker,{onStatus=()=>{},captureSafeExamples=false}={}){
 if(typeof generate!=="function"||typeof checker!=="function")
  throw Error("Generator and checker callbacks required");
 const outputs=[],byGenre={};
 const start=Date.now();
 for(let i=0;i<rows.length;i++){
  const row=rows[i];
  const statements=extractArgumentStatements(row.text);
  const candidates=findImplicitConclusionQuestions(row.text,statements);
  const attempts=[];
  const proposals=await reconstructImplicitConclusions(
   row.text,statements,generate,{onAttempt:a=>attempts.push(a)});
  const checked=await checkImpliedConclusions(proposals,checker);
  const statuses=checked.map(p=>p.supportStatus);
  outputs.push({
   expected_implicit:row.expected_implicit??null,
   predicted_implicit:checked.length>0,
   candidates:[], // count only, no source snippets in report
   eligibleCount:candidates.length,
   attempts:attempts.map(a=>({status:a.status})),
   conclusions:checked.map(p=>({supportStatus:p.supportStatus}))
  });
  const genre=row.genre||"authored";
  const stats=byGenre[genre]??={paragraphs:0,eligible:0,accepted:0,
   rejected:0,none:0,errors:0,checked:0};
  stats.paragraphs++;
  stats.eligible+=candidates.length;
  for(const a of attempts){
   if(a.status==="accepted")stats.accepted++;
   else if(a.status==="rejected")stats.rejected++;
   else if(a.status==="none")stats.none++;
   else if(a.status==="model_error")stats.errors++;
  }
  stats.checked+=checked.filter(p=>p.context).length;
  if(captureSafeExamples){
   onStatus({id:row.id,
    status:attempts.map(a=>a.status).join(",")||"skipped",
    suggested:checked.map(p=>p.impliedConclusion),
    check:statuses});
  }
  if(i>0&&i%25===0)onStatus({completed:i+1,total:rows.length});
 }
 // The existing lab helper counts candidates by length. We pass dummy
 // opaque markers only; actual text never enters metrics.
 const measured=summarizeImplicitConclusionCases(outputs.map(o=>({
  ...o,candidates:Array(o.eligibleCount).fill({}),conclusions:o.conclusions
 })));
 const totals=Object.fromEntries(["no_explicit_premise",
  "unsupported_conclusion","supported_conclusion","inconclusive",
  "model_unavailable"].map(k=>[k,outputs.flatMap(x=>x.conclusions)
   .filter(v=>v.supportStatus===k).length]));
 return {cases:rows.length,seconds:Number(((Date.now()-start)/1000).toFixed(1)),
  byGenre,totals,
  summary:measured,authoredOnly:rows.every(x=>x.id.startsWith("author-"))};
}
async function run({sampleOnly=false,run=false}={}){
 const manifest=JSON.parse(await readFile(MANIFEST,"utf8"));
 const source=await loadCorpus(manifest,{onProgress:m=>{
  if(m.downloadedDocs%12===0||m.downloadedDocs===m.totalDocs)
   console.log("GUM training docs fetched: "+m.downloadedDocs+"/"+m.totalDocs);
 }});
 const sample=chooseGumSample(source);
 console.log("REAL GUM selection (no text output): "+
  JSON.stringify({sourceParagraphs:sample.rawAvailable,
   sourceCandidateParagraphs:sample.rawCandidates,
   selected:sample.selected,candidateEnriched:sample.selectedCandidates,
   genres:sample.genres.length,sourceDocs:sample.documents,
   selectionHash:sha(JSON.stringify(sample.rows.map(r=>r.id)))}));
 const structural=identifyImplicitLinks(sample.rows);
 console.log("REAL GUM DECLARATIVE-LINK CANDIDATES (no source text): "+
  JSON.stringify({
   paragraphs:structural.paragraphs,
   explicitCandidates:structural.explicitCandidates,
   inferredCandidates:structural.implicitCandidates,
   paragraphsWithInferred:structural.withImplicit,
   genres:Object.fromEntries(Object.entries(structural.byGenre)
    .map(([g,v])=>[g,v.withInferred]))
  }));
 if(sampleOnly)return;
 if(!run)throw Error("Choose --run or --sample-only");
 // Deliberately lazy: sample-only, unit tests and CLI --help run without
 // downloading or even importing the Transformers.js runtime.
 const [{generateImpliedConclusion},{createNliScorer}]=await Promise.all([
  import("../extension/src/implicit-conclusion-model.mjs"),
  import("../extension/src/nli-inference.mjs")
 ]);
 const safe=await evaluateRows(AUTHORED,generateImpliedConclusion,
  async(p,c)=>({label:"not_scored_in_authored_controls"}),{
   captureSafeExamples:true,
   onStatus:x=>console.log("AUTHORED "+JSON.stringify(x))
  });
 console.log("AUTHORED CONTROL SUMMARY: "+JSON.stringify({
  cases:safe.cases,summary:safe.summary,byGenre:safe.byGenre
 }));
 let scorePromise;
 const check=async(premise,conclusion)=>{
  if(!scorePromise)scorePromise=createNliScorer();
  const score=await scorePromise;
  const nli=await score(premise,conclusion);
  return combineArgumentEvidence([
   {kind:"combined",text:premise,forward:nli,reverse:null}
  ],conclusion);
 };
 // Declarative inference is separate from rhetorical-question rewriting.
 // The same actual MNLI model is scored on original source premise and
 // hypothesis; do not count inferred text as its own supporting evidence.
 const scorePair=async(premise,hypothesis)=>{
  if(!scorePromise)scorePromise=createNliScorer();
  const score=await scorePromise;
  return score(premise,hypothesis);
 };
 const linkReport=await scoreImplicitLinks(structural,scorePair,{
  maxParagraphs:40,
  onStatus:m=>console.log("DECLARATIVE PROGRESS "+JSON.stringify(m))
 });
 console.log("REAL GUM DECLARATIVE INFERENCE RESULT (no source text): "+
  JSON.stringify(linkReport));
 const result=await evaluateRows(sample.rows,generateImpliedConclusion,check,{
  onStatus:m=>console.log("GUM PROGRESS "+JSON.stringify(m))
 });
 console.log("REAL UNLABELLED GUM RESULT (no source text): "+
  JSON.stringify({
   version:VERSION,source:GUM_SHA,sourceDocs:sample.documents,
   selected:sample.selected,eligible:result.summary.eligibleQuestions,
   seconds:result.seconds,summary:result.summary,
   supportStatuses:result.totals,byGenre:result.byGenre,
   claim:"No human labels of implied conclusions exist in this sample; "+
    "precision/recall/semantic correctness are NOT measured."
  }));
}
async function main(){
 const args=process.argv.slice(2);
 if(args.includes("--help")||args.includes("-h")){
  console.log("node scripts/evaluate-implicit-real-gum.mjs "+
   "[--sample-only | --run]\nNo public posts or paragraph text "+
   "are logged, committed, uploaded or stored.");
  return;
 }
 if(args.length!==1||!["--sample-only","--run"].includes(args[0]))
  throw Error("Choose exactly one of --sample-only or --run");
 await run({sampleOnly:args[0]==="--sample-only",
  run:args[0]==="--run"});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
 main().catch(err=>{console.error(err?.stack||err);process.exitCode=1;});
