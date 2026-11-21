#!/usr/bin/env node
/**
 * Builds a real GUM train/test source-document split, plus BLIND review items.
 * No fake KEEP labels. No source text is committed. Uses pinned GDTB data.
 *
 * node scripts/build-reader-gum-transfer.mjs
 * node scripts/build-reader-gum-transfer.mjs --offline
 */
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {candidatesFromGdtb,parseGdtbRels,getRels,GUM_COMMIT,GENRES}
 from "./build-reader-gum-pilot.mjs";
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const MANIFEST=path.join(ROOT,"evaluation/reader-authentic-transfer-documents-v1.json");
const OUTPUT=path.join(ROOT,"evaluation/reader-gum-transfer-v1.json");
const REVIEW=path.join(ROOT,"evaluation/reader-gum-keep-review-queue-v1.json");
export const VERSION="reader-gum-transfer-v1";
const sha=v=>createHash("sha256").update(v).digest("hex");
const rank=x=>sha("20261121-gum-transfer|"+x.id+"|"+x.document);
const FULL_SENTENCE=/\.\s*$/u;
const LIMITS={train:12,test:12,review:8};
const OLD=new Set(Object.entries(GENRES).flatMap(([g,ls])=>ls.map(x=>"GUM_"+g+"_"+x)));
const docName=/^GUM_[a-z]+_[a-z0-9]+$/u;
export function validateManifest(data){
 if(!data||data.version!=="reader-authentic-transfer-docs-v1"||
  data.sourceRevision!==GUM_COMMIT||
  !data.genres||typeof data.genres!=="object")throw Error("Pinned manifest mismatch");
 const roles={train:[],test:[],review:[]},seen=new Set();
 const genres=Object.entries(data.genres);
 if(genres.length!==12)throw Error("Expected 12 source genres");
 for(const [genre,partition] of genres){
  for(const [role,expected] of [["train",3],["test",2],["review",1]]){
   const docs=partition?.[role];
   if(!Array.isArray(docs)||docs.length!==expected)
    throw Error("Invalid "+genre+" "+role+" document count");
   for(const name of docs){
    if(!docName.test(name)||!name.startsWith("GUM_"+genre+"_")||
     seen.has(name)||OLD.has(name))
     throw Error("Nonunique, unpinned or previously tested document: "+name);
    seen.add(name);roles[role].push({document:name,genre,role});
   }
  }
 }
 return roles;
}
function goodReviewRow(raw){
 if(raw.rel_type!=="explicit"&&raw.rel_type!=="altlex")return false;
 if(raw.dir!=="1<2"||raw.unit1_sent===raw.unit2_sent)return false;
 const match1=/^(\d+)-(\d+)$/u.exec(raw.s1_toks);
 const match2=/^(\d+)-(\d+)$/u.exec(raw.s2_toks);
 if(!match1||!match2||+match1[2]+1!==+match2[1])return false;
 const left=raw.unit1_sent?.trim().replace(/\s+([,.!?;:])/gu,"$1");
 const right=raw.unit2_sent?.trim().replace(/\s+([,.!?;:])/gu,"$1");
 if(!FULL_SENTENCE.test(left)||left.length<15||right.length<15||
  left.length>450||right.length>450)return false;
 return true;
}
export function makeReviewItems(source,doc,genre,limit=LIMITS.review){
 const rows=parseGdtbRels(source,doc);
 // Existing relation information is hidden from reviewers. We do not assume
 // either explicit or altlex means KEEP; genuine connections are common.
 return rows.filter(goodReviewRow).map(x=>{
  const first=x.unit1_sent.trim().replace(/\s+([,.!?;:])/gu,"$1");
  const second=x.unit2_sent.trim().replace(/\s+([,.!?;:])/gu,"$1");
  return {
   id:"review-"+sha(doc+"|"+x.line+"|"+first+"|"+second).slice(0,16),
   document:doc,genre,sourceLine:x.line,
   first,second,
   label:null,
   instructions:"Blind human classification: KEEP (no meaningful connection), AND (addition or continuity), BUT (contrast), or ABSTAIN. Do not infer intent.",
   // Not a gold label and not training/test data.
   status:"unreviewed"
  };
 }).sort((a,b)=>rank(a).localeCompare(rank(b))).slice(0,limit);
}
export function pickCandidates(candidates,role,limit=LIMITS[role]){
 const byPair=new Map();
 for(const x of candidates){
  const k=x.document+"|"+x.source.toLowerCase();
  if(!byPair.has(k))byPair.set(k,[]);
  byPair.get(k).push(x);
 }
 const kept=[];
 for(const group of byPair.values()){
  if(new Set(group.map(x=>x.gold)).size>1)continue;
  kept.push(group.slice().sort((a,b)=>rank(a).localeCompare(rank(b)))[0]);
 }
 // The newly held-out GUM subset has very few contrasts. Freeze a
 // bounded, explicitly stratified selection BEFORE model inference so BOTH
 // relationship types can be assessed. It is not natural class prevalence.
 const ordered=kept.sort((a,b)=>rank(a).localeCompare(rank(b)));
 const contrast=ordered.filter(x=>x.gold==="but").slice(0,Math.min(4,limit));
 const addition=ordered.filter(x=>x.gold==="and").slice(0,limit-contrast.length);
 return [...contrast,...addition].sort((a,b)=>rank(a).localeCompare(rank(b)));
}
export async function buildTransfer({offline=false,load=getRels,log=console.log}={}){
 const manifest=JSON.parse(await readFile(MANIFEST,"utf8"));
 const partitions=validateManifest(manifest);
 const sets={train:[],test:[]},review=[],checksums={},counts={};
 // Run at modest concurrency to avoid hammering the corpus source.
 const jobs=Object.values(partitions).flat();
 for(let i=0;i<jobs.length;i+=4){
  const chunk=jobs.slice(i,i+4);
  const result=await Promise.all(chunk.map(async entry=>{
   const raw=await load(entry.document,{offline});
   const checksum=sha(raw),{genre,role,document}=entry;
   if(role==="review"){
    const pending=makeReviewItems(raw,document,genre);
    return {entry,checksum,pending,count:pending.length};
   }
   const extracted=candidatesFromGdtb(raw,document,genre);
   const selected=pickCandidates(extracted.candidates,role);
   return {entry,checksum,selected,count:selected.length,
    eligible:extracted.candidates.length};
  }));
  for(const r of result){
   const {document,role}=r.entry;
   checksums[document]=r.checksum;
   counts[document]={role,selected:r.count,eligible:r.eligible??null};
   if(role==="review")review.push(...r.pending);
   else sets[role].push(...r.selected);
  }
  log("Loaded "+Math.min(i+4,jobs.length)+"/"+jobs.length+
   " pinned GUM source documents");
 }
 for(const role of ["train","test"]){
  if(sets[role].length < (role==="train"?100:60))
   throw Error("Insufficient "+role+" authentic relationships: "+sets[role].length);
  for(const cls of ["and","but"])if(sets[role].filter(x=>x.gold===cls).length<5)
   throw Error(role+" has too few "+cls+" examples");
 }
 const documents=new Map(Object.entries(partitions).flatMap(([role,docs])=>
  docs.map(x=>[x.document,role])));
 for(const role of ["train","test"])
  for(const c of sets[role])if(documents.get(c.document)!==role)
   throw Error("Source document partition leakage at "+c.id);
 const serialize=x=>({
  id:x.id,document:x.document,genre:x.genre,family:x.document,
  row:x.row,relation:x.relation,tokenRanges:x.tokenRanges,
  text:x.source,expected_boundaries:[{offset:x.offset,choice:x.gold}]
 });
 const data={
  meta:{
   version:VERSION,sourceRevision:GUM_COMMIT,
   sourceManifest:"reader-authentic-transfer-documents-v1",
   manifestFingerprint:sha(JSON.stringify(manifest)),
   selectionPolicy:"Pinned, SHA256-ordered, max 12 per doc: prioritize up to 4 BUT then fill with AND. Stratified by relation; NOT natural class prevalence.",
   annotation:"GUM GDTB labels mapped provisionally to AND/BUT. KEEP is not automatically inferred.",
   docCounts:{train:partitions.train.length,test:partitions.test.length,
    review:partitions.review.length},
   classCounts:Object.fromEntries(["train","test"].map(role=>[role,
    Object.fromEntries(["and","but"].map(g=>[g,sets[role].filter(x=>x.gold===g).length]))])),
   sourceChecksums:checksums,documents:counts,
   // Include the exact selected ID/text/gold content in the fingerprint to
   // protect source integrity when old cached model scores are reused.
   selectionHash:sha(JSON.stringify(["train","test"].map(role=>
    sets[role].map(x=>[x.id,x.document,x.row,x.source,x.gold]))))
  },
  train:sets.train.map(serialize),
  test:sets.test.map(serialize)
 };
 const reviewData={
  meta:{version:"gum-keep-human-review-queue-v1",
   sourceRevision:GUM_COMMIT,manifestFingerprint:data.meta.manifestFingerprint,
   count:review.length,
   note:"UNLABELLED adjacent authentic sentences from separate review-only documents. The reference relation is deliberately concealed. Neither KEEP nor any other label is inferred. Human reviewers must independently annotate.",
   schema:"Each item requires two independent reviewers; this queue contains NO training or test labels."},
  items:review
 };
 return {data,reviewData};
}
async function main(){
 const args=process.argv.slice(2);
 if(args.includes("--help")||args.includes("-h")){
  console.log("node scripts/build-reader-gum-transfer.mjs [--offline]");
  return;
 }
 if(args.some(x=>x!=="--offline"))throw Error("Unknown option");
 const {data,reviewData}=await buildTransfer({offline:args.includes("--offline")});
 await mkdir(path.dirname(OUTPUT),{recursive:true});
 await Promise.all([writeFile(OUTPUT,JSON.stringify(data,null,2)+"\n"),
  writeFile(REVIEW,JSON.stringify(reviewData,null,2)+"\n")]);
 console.log("GUM transfer: "+data.train.length+" train AND/BUT, "+
  data.test.length+" held-out AND/BUT; "+reviewData.items.length+
  " BLIND, UNLABELLED review suggestions.");
 console.log("  Class distribution: "+JSON.stringify(data.meta.classCounts));
 console.log("  Fingerprint: "+data.meta.selectionHash);
 console.log("  Saved locally: "+OUTPUT);
 console.log("  Human KEEP review queue (unlabelled): "+REVIEW);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
 main().catch(e=>{console.error(e?.stack||e);process.exitCode=1;});
