#!/usr/bin/env node
/**
 * GUM/GDTB authentic-text evaluation pilot v1: metadata + source links only
 * are versioned; downloaded licensed excerpts stay local and are gitignored.
 *
 * node scripts/build-reader-gum-pilot.mjs
 * node scripts/build-reader-gum-pilot.mjs --offline
 *
 * 250 examples = 25 from each of 10 text genres, with at most 14 per document.
 * Selection follows a fixed SHA-256 ordering, favouring the rarer BUT class
 * within each genre; this is a STRATIFIED PILOT, not natural class prevalence.
 * Gold labels were created by GDTB annotators; KEEP is NOT inferred.
 *
 * GDTB: https://github.com/amir-zeldes/gum
 */
import {readFile,writeFile,mkdir} from "node:fs/promises";
import path from "node:path";
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";
import {extractBoundaryProbes,buildBoundaryChoices}
 from "../extension/src/reader-boundary-scorer.mjs";
import {maskedGapPrompt} from "../extension/src/reader-mask-infill.mjs";
import {sentencePair} from "../extension/src/reader-semantic-signals.mjs";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
export const GUM_COMMIT="1d999e5a0327ecb83015007774f6a9be23ecbc41";
export const VERSION="reader-gum-pilot-v1";
export const SOURCE_PREFIX="rst/gdtb/disrpt/";
const CACHE_DIR=path.join(ROOT,"evaluation/reader-gum-source-cache",GUM_COMMIT);
const OUTPUT=path.join(ROOT,"evaluation/reader-gum-pilot-v1.json");
export const GENRES=Object.freeze({
 news:["election","warming","nasa","soccer","hackers","homeopathic"],
 essay:["food","tools","walking","distraction","evolved","privatization"],
 academic:["games","lighting","census","art","salinity","replication"],
 interview:["ants","cyclone","chomsky","gaming","libertarian"],
 fiction:["falling","garden","error","time","teeth"],
 speech:["data","remarks","newzealand","open","inauguration"],
 bio:["chao","goode","marbles","higuchi"],
 textbook:["chemistry","history","spacetime"],
 voyage:["athens","oakland"],
 podcast:["llms","library","blackholes","collaboration"]
});
const GENRE_TARGET=25,MAX_PER_DOCUMENT=14;
const CLASSES=["keep","and","but"];
const finite=Number.isFinite;
function digest(value){return createHash("sha256").update(value).digest("hex");}
function parseRange(text){
 const m=/^(\d+)-(\d+)$/u.exec(text||"");
 return m?{start:Number(m[1]),end:Number(m[2])}:null;
}
export function mapGdtbLabel(relation,type){
 if(type!=="implicit")return {choice:null,reason:"not_implicit"};
 const sense=String(relation||"").toLowerCase();
 if(/^comparison\.(contrast|concession)(?:\.|$)/u.test(sense))
  return {choice:"but",reason:"contrast_or_concession"};
 if(/^(expansion\.(conjunction|level-of-detail|instantiation|equivalence)|contingency\.cause|temporal\.(asynchronous|synchronous))(?:\.|$)/u.test(sense))
  return {choice:"and",reason:"addition_cause_or_sequence"};
 return {choice:null,reason:"unmapped_sense"};
}
export function parseGdtbRels(content,document){
 if(typeof content!=="string"||!document)throw Error("Rels text/document required");
 const [header,...lines]=content.replace(/^\uFEFF/u,"").trim().split(/\r?\n/u);
 const columns=header.split("\t");
 const required=["doc","s1_toks","s2_toks","unit1_sent","unit2_sent",
  "unit1_toks","unit2_toks","dir","rel_type","orig_label"];
 for(const col of required)if(!columns.includes(col))
  throw Error("Missing GDTB .rels field "+col+" in "+document);
 return lines.filter(Boolean).map((line,i)=>{
  const values=line.split("\t");
  if(values.length!==columns.length)throw Error("Bad TSV line in "+document+":"+(i+2));
  const raw=Object.fromEntries(columns.map((name,j)=>[name,values[j]]));
  if(raw.doc!==document)throw Error("Document mismatch "+raw.doc+" vs "+document);
  return {...raw,line:i+2};
 });
}
export function candidatesFromGdtb(content,document,genre){
 const parsed=parseGdtbRels(content,document);
 const candidates=[],stats={
  annotations:parsed.length,implicitCrossSentence:0,validBoundaries:0,
  mapped:0,unmapped:0,excluded:0
 };
 for(const raw of parsed){
  if(raw.rel_type!=="implicit"||
   raw.unit1_sent.trim()===raw.unit2_sent.trim())continue;
  stats.implicitCrossSentence++;
  const s1=parseRange(raw.s1_toks),s2=parseRange(raw.s2_toks);
  // Require consecutive, forward-ordered FULL sentences, not just any two
  // discourse units the corpus annotates as connected.
  if(raw.dir!=="1<2"||!s1||!s2||s1.end+1!==s2.start) {
   stats.excluded++;continue;
  }
  const first=raw.unit1_sent.trim().replace(/\s+([,.!?;:])/gu,"$1");
  const second=raw.unit2_sent.trim().replace(/\s+([,.!?;:])/gu,"$1");
  if(!first.endsWith(".")||second.length<15||first.length<15||
    first.length>450||second.length>450||
    /^(?:and|but|however|nevertheless|yet|therefore|so|meanwhile)\b/iu.test(second)){
   stats.excluded++;continue;
  }
  const source=first+" "+second,offset=first.length-1;
  const probes=extractBoundaryProbes(source,{maxPairs:12});
  const probe=probes.find(p=>p.punctuationStart===offset);
  if(!probe||buildBoundaryChoices(source,probe).length!==2||
   !maskedGapPrompt(source,probe)){
   stats.excluded++;continue;
  }
  stats.validBoundaries++;
  const mapped=mapGdtbLabel(raw.orig_label,raw.rel_type);
  if(!mapped.choice){stats.unmapped++;continue;}
  stats.mapped++;
  candidates.push({
   id:"gum-"+digest(document+"|"+raw.s1_toks+"|"+raw.s2_toks+"|"+raw.orig_label).slice(0,16),
   document,genre,family:document,
   row:raw.line,tokenRanges:[raw.s1_toks,raw.s2_toks],
   relation:raw.orig_label,mappingReason:mapped.reason,
   source,left:first,right:second,offset,gold:mapped.choice,
   annotationType:raw.rel_type
  });
 }
 return {candidates,stats};
}
function rank(c){return digest(VERSION+"|"+c.document+"|"+c.row+"|"+c.id);}
export function selectPilot(grouped,{perGenre=GENRE_TARGET,perDoc=MAX_PER_DOCUMENT}={}){
 const selected=[],summary={};
 for(const genre of Object.keys(GENRES)){
  const input=grouped[genre];
  if(!Array.isArray(input))throw Error("Missing source genre "+genre);
  // Same pair may be annotated more than once. Conflicting senses are
  // excluded instead of arbitrarily assigning one gold label.
  const pairs=new Map();
  for(const x of input){
   const id=x.document+"|"+x.source.toLowerCase();
   if(!pairs.has(id))pairs.set(id,[]);
   pairs.get(id).push(x);
  }
  let unique=[];
  for(const rows of pairs.values()){
   if(new Set(rows.map(r=>r.gold)).size>1)continue;
   unique.push(rows.slice().sort((a,b)=>rank(a).localeCompare(rank(b)))[0]);
  }
  // First select credible BUT examples (rare in natural writing) then fill
  // remaining spots with AND, enforcing a per-document cap.
  unique.sort((a,b)=>(a.gold==="but"?0:1)-(b.gold==="but"?0:1)||
   rank(a).localeCompare(rank(b)));
  const chosen=[],counts=new Map();
  for(const x of unique){
   if(chosen.length===perGenre)break;
   if((counts.get(x.document)||0)>=perDoc)continue;
   chosen.push(x);
   counts.set(x.document,(counts.get(x.document)||0)+1);
  }
  if(chosen.length!==perGenre)
   throw Error("Insufficient valid annotated pairs in "+genre+
    ": need "+perGenre+", found "+chosen.length);
  summary[genre]={sampled:chosen.length,eligible:unique.length,
   and:chosen.filter(r=>r.gold==="and").length,
   but:chosen.filter(r=>r.gold==="but").length,documents:counts.size};
  selected.push(...chosen);
 }
 if(new Set(selected.map(x=>x.id)).size!==selected.length)
  throw Error("Duplicate pilot IDs");
 return {selected,summary};
}
export async function getRels(filename,{offline=false,fetcher=fetch}={}){
 const local=path.join(CACHE_DIR,filename+".rels");
 try{return await readFile(local,"utf8");}
 catch(e){if(e.code!=="ENOENT")throw e;}
 if(offline)throw Error("Missing "+local+" in offline mode");
 const url="https://raw.githubusercontent.com/amir-zeldes/gum/"+
  GUM_COMMIT+"/"+SOURCE_PREFIX+filename+".rels";
 const response=await fetcher(url);
 if(!response.ok)throw Error("GUM request failed "+response.status+" "+filename);
 const content=await response.text();
 if(content.length<100)throw Error("Suspiciously short source "+filename);
 await mkdir(CACHE_DIR,{recursive:true});
 await writeFile(local,content);
 return content;
}
export async function buildGumPilot({offline=false,load=getRels,log=console.log}={}){
 const grouped={},origins={};
 for(const [genre,documents] of Object.entries(GENRES)){
  grouped[genre]=[];origins[genre]={};
  for(const suffix of documents){
   const document="GUM_"+genre+"_"+suffix;
   const raw=await load(document,{offline});
   const {candidates,stats}=candidatesFromGdtb(raw,document,genre);
   grouped[genre].push(...candidates);
   origins[genre][document]={sha256:digest(raw),stats};
  }
  log("GUM "+genre+": "+grouped[genre].length+" candidate boundaries");
 }
 const {selected,summary}=selectPilot(grouped);
 const digestCorpus=digest(JSON.stringify(selected.map(r=>[
  r.id,r.document,r.row,r.source,r.gold
 ])));
 return {
  meta:{
   version:VERSION,source:"GUM GDTB annotated discourse corpus",
   repository:"https://github.com/amir-zeldes/gum",
   sourceRevision:GUM_COMMIT,
   selectionHash:digestCorpus,
   sampleType:"STRATIFIED by genre; BUT oversampled within each genre; not natural prevalence",
   goldProvenance:"Original GDTB human annotations mapped via a documented conservative rule",
   labelMapping:"Comparison.Contrast/Concession => BUT; Expansion.Conjunction/Level-of-detail/Instantiation/Equivalence, Contingency.Cause, Temporal => AND; remaining relations ABSTAIN",
   keepClass:"NOT EVALUATED: implicit discourse dataset does not supply labelled KEEP negatives",
   limitations:"Automatically mapped labels have not been independently adjudicated for this project's AND/BUT definitions; candidate source texts may have copyright and licence restrictions",
   selection:{perGenre:GENRE_TARGET,maxPerDocument:MAX_PER_DOCUMENT},
   summary,originChecksums:origins
  },
  cases:selected.map(({id,document,genre,family,row,tokenRanges,relation,
   mappingReason,source,offset,gold,annotationType})=>({
   id,document,genre,family,row,tokenRanges,relation,mappingReason,
   text:source,expected_boundaries:[{offset,choice:gold}],
   annotationType
  }))
 };
}
async function main(){
 const offline=process.argv.includes("--offline");
 if(process.argv.slice(2).some(x=>!["--offline","--help","-h"].includes(x)))
  throw Error("Unrecognised option");
 if(process.argv.includes("--help")||process.argv.includes("-h")){
  console.log("node scripts/build-reader-gum-pilot.mjs [--offline]");return;
 }
 const data=await buildGumPilot({offline});
 await mkdir(path.dirname(OUTPUT),{recursive:true});
 await writeFile(OUTPUT,JSON.stringify(data,null,2)+"\n");
 const counts=Object.fromEntries(CLASSES.map(k=>[
  k,data.cases.filter(c=>c.expected_boundaries[0].choice===k).length]));
 console.log("GUM pilot: "+data.cases.length+" real annotated relationships, "+
  new Set(data.cases.map(x=>x.document)).size+" source documents");
 console.log("Class labels: "+JSON.stringify(counts));
 console.log("Selection fingerprint: "+data.meta.selectionHash);
 console.log("Saved "+OUTPUT+". Source text stays local; DO NOT commit raw corpus.");
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
 main().catch(err=>{console.error(err?.stack||err);process.exitCode=1;});
