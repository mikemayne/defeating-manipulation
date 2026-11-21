#!/usr/bin/env node
/**
 * Deterministic, versioned pool of up to 440 NEW authentic AND training
 * examples from the ALREADY-PINNED 118 expansion training documents.
 * No use of the 217-case test, original pilot, KEEP review, or 39 future
 * reserved documents. Original 308 train and 110 BUT addition unchanged.
 *
 * node scripts/build-reader-gum-and-mixtures.mjs [--offline]
 */
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {createHash} from "node:crypto";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {candidatesFromGdtb,getRels,GUM_COMMIT}
 from "./build-reader-gum-pilot.mjs";
import {verifyExpansion,verifyExpansionManifest}
 from "./build-reader-gum-contrast-expansion.mjs";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const local=n=>path.join(ROOT,"evaluation",n);
const PATHS={
 baseline:local("reader-gum-transfer-v1.json"),
 originalManifest:local("reader-authentic-transfer-documents-v1.json"),
 expansionManifest:local("reader-gum-contrast-expanded-documents-v1.json"),
 butExpansion:local("reader-gum-contrast-expansion-v1.json"),
 output:local("reader-gum-and-mixtures-v1.json")
};
export const VERSION="reader-gum-and-mixtures-v1";
export const MIXTURE_SIZES=Object.freeze([0,110,220,440]);
export const LIMIT_PER_DOC=32;
const sha=x=>createHash("sha256").update(x).digest("hex");
const sentenceKey=x=>x.text.toLowerCase();
const sourceKey=x=>x.source.toLowerCase();
const ranks=x=>sha("reader-gum-and-pool-v1|"+x.document+"|"+x.id+"|"+x.row);
const contents=async p=>JSON.parse(await readFile(p,"utf8"));
const andSense=/^(?:expansion\.(?:conjunction|level-of-detail|instantiation|equivalence)|contingency\.cause|temporal\.(?:asynchronous|synchronous))(?:\.|$)/u;
const record=x=>({
 id:x.id,document:x.document,genre:x.genre,family:x.document,
 row:x.row,relation:x.relation,tokenRanges:x.tokenRanges,
 text:x.source,expected_boundaries:[{offset:x.offset,choice:x.gold}]
});
const hashCases=cases=>sha(JSON.stringify(cases.map(c=>[
 c.id,c.document,c.row,c.relation,c.text,c.expected_boundaries[0]
])));

/** Conflicts are discarded rather than silently choosing one of two labels. */
export function eligibleAnd(candidates,excluded,limit=LIMIT_PER_DOC){
 if(!Array.isArray(candidates)||!Number.isSafeInteger(limit)||
  limit<1||limit>500)throw Error("Invalid source candidates or per-document cap");
 const grouped=new Map();
 for(const x of candidates){
  const key=sourceKey(x);
  if(!grouped.has(key))grouped.set(key,[]);
  grouped.get(key).push(x);
 }
 const out=[];
 for(const [key,items] of grouped){
  if(new Set(items.map(x=>x.gold)).size!==1||items[0].gold!=="and"||
   excluded.has(key))continue;
  const x=[...items].sort((a,b)=>ranks(a).localeCompare(ranks(b)))[0];
  if(!andSense.test(x.relation)||excluded.has(x.id))continue;
  out.push(x);
 }
 return out.sort((a,b)=>ranks(a).localeCompare(ranks(b))).slice(0,limit);
}

/**
 * Balanced deterministic document rotation rather than selecting the first
 * 440 rows from a handful of genres. All four sizes are NESTED prefixes.
 */
export function documentRoundRobin(byDocument,limit=440){
 if(!(byDocument instanceof Map)||!Number.isSafeInteger(limit)||limit<1)
  throw Error("Invalid round-robin selection");
 const queues=[...byDocument.entries()].map(([document,items])=>({
  document,
  items:[...items].sort((a,b)=>ranks(a).localeCompare(ranks(b))),
  cursor:0
 })).sort((a,b)=>sha("doc-pool-v1|"+a.document).localeCompare(
  sha("doc-pool-v1|"+b.document)));
 const picked=[];
 for(let round=0;picked.length<limit;round++){
  let progress=false;
  for(const q of queues){
   if(q.cursor>=q.items.length)continue;
   picked.push(q.items[q.cursor++]);progress=true;
   if(picked.length===limit)break;
  }
  if(!progress)break;
 }
 return picked;
}
export function verifyAndPool(pool,base,originalManifest,newManifest,but){
 const permitted=verifyExpansionManifest(newManifest,base,originalManifest);
 verifyExpansion(but,base,originalManifest,newManifest);
 if(pool?.meta?.version!==VERSION||
  pool.meta.sourceRevision!==GUM_COMMIT||
  pool.meta.baselineSelectionHash!==base.meta.selectionHash||
  pool.meta.butExpansionSelectionHash!==but.meta.selectionHash||
  pool.meta.expansionManifestHash!==sha(JSON.stringify(newManifest))||
  !Array.isArray(pool.cases)||
  pool.cases.length!==MIXTURE_SIZES.at(-1)||
  pool.meta.selectionHash!==hashCases(pool.cases))
  throw Error("AND pool fingerprint, provenance or length mismatch");
 const usedIds=new Set([...base.train,...but.cases].map(x=>x.id));
 const usedPairs=new Set([...base.train,...but.cases].map(sentenceKey));
 const sourceByDoc=pool.meta.sourceChecksums;
 if(!sourceByDoc||typeof sourceByDoc!=="object")throw Error("No AND source checksums");
 const relations={},docs=new Set();
 for(const row of pool.cases){
  const point=row.expected_boundaries?.[0],name=row.document;
  if(!permitted.newDocs.has(name)||permitted.reserved.has(name)||
   !point||row.expected_boundaries.length!==1||
   point.choice!=="and"||row.text?.[point.offset]!=="."||
   !andSense.test(row.relation)||
   usedIds.has(row.id)||usedPairs.has(sentenceKey(row))||
   sourceByDoc[name]!==but.meta.newDocumentChecksums?.[name])
   throw Error("Leaked/duplicate/non-AND example or source mismatch "+row.id);
  usedIds.add(row.id);usedPairs.add(sentenceKey(row));docs.add(name);
  const type=row.relation.split(".")[0];
  relations[type]=(relations[type]||0)+1;
 }
 if(JSON.stringify(relations)!==JSON.stringify(pool.meta.familyCounts))
  throw Error("AND relation-family counts mismatch");
 if(pool.meta.contributingDocuments!==docs.size)
  throw Error("AND document count mismatch");
 return {poolSize:pool.cases.length,documents:docs.size,families:relations};
}
export async function buildAndPool({baseline,originalManifest,manifest,
 butExpansion,load=getRels,offline=false,log=console.log,
 maxPerDocument=LIMIT_PER_DOC}={}){
 const [base,old,planned,but]=await Promise.all([
  baseline??contents(PATHS.baseline),
  originalManifest??contents(PATHS.originalManifest),
  manifest??contents(PATHS.expansionManifest),
  butExpansion??contents(PATHS.butExpansion)
 ]);
 const permitted=verifyExpansionManifest(planned,base,old);
 verifyExpansion(but,base,old,planned);
 const excluded=new Set([...base.train,...but.cases].map(sentenceKey));
 for(const x of [...base.train,...but.cases])excluded.add(x.id);
 const queues=new Map(),checksums={},available={};
 const docs=planned.newTrainDocuments;
 for(let i=0;i<docs.length;i+=6){
  const batch=await Promise.all(docs.slice(i,i+6).map(async name=>{
   if(!permitted.newDocs.has(name)||permitted.reserved.has(name))
    throw Error("Attempt to read a reserved document");
   const text=await load(name,{offline});
   const digest=sha(text);
   if(digest!==but.meta.newDocumentChecksums?.[name])
    throw Error("Source text differs from frozen BUT expansion: "+name);
   const genre=name.split("_")[1];
   const candidates=candidatesFromGdtb(text,name,genre).candidates;
   return {name,digest,choices:eligibleAnd(candidates,excluded,maxPerDocument)};
  }));
  for(const x of batch){
   queues.set(x.name,x.choices);checksums[x.name]=x.digest;
   available[x.name]=x.choices.length;
  }
  log("AND pool: inspected "+Math.min(i+6,docs.length)+"/"+
   docs.length+" pinned training documents");
 }
 const selected=documentRoundRobin(queues,MIXTURE_SIZES.at(-1)).map(record);
 if(selected.length<MIXTURE_SIZES.at(-1))
  throw Error("Insufficient genuine AND candidates: need "+
   MIXTURE_SIZES.at(-1)+", found "+selected.length+
   ". Do not manufacture or substitute negatives.");
 const families={};
 for(const r of selected){
  const family=r.relation.split(".")[0];
  families[family]=(families[family]||0)+1;
 }
 const result={
  meta:{
   version:VERSION,sourceRevision:GUM_COMMIT,
   baselineSelectionHash:base.meta.selectionHash,
   butExpansionSelectionHash:but.meta.selectionHash,
   expansionManifestHash:sha(JSON.stringify(planned)),
   selectionHash:hashCases(selected),
   mixtureSizes:MIXTURE_SIZES,
   perDocumentCap:maxPerDocument,
   selectionPolicy:"Pinned training-only documents, unique conflict-free GDTB implicit AND, per-document SHA order and document-round-robin. Nested prefixes 110/220/440; no new source documents chosen after outcomes.",
   contributingDocuments:new Set(selected.map(x=>x.document)).size,
   sourceChecksums:checksums,availableByDocument:available,
   familyCounts:families
  },cases:selected
 };
 verifyAndPool(result,base,old,planned,but);
 log("AND expansion: "+selected.length+" NEW authentic AND across "+
  result.meta.contributingDocuments+" training documents; family counts "+
  JSON.stringify(families));
 log("Nested mixtures: "+MIXTURE_SIZES.join("/")+
  " added AND against unchanged "+but.cases.length+" added BUT.");
 return result;
}
async function main(){
 const argv=process.argv.slice(2);
 if(argv.includes("-h")||argv.includes("--help")){
  console.log("node scripts/build-reader-gum-and-mixtures.mjs [--offline]");
  return;
 }
 if(argv.some(x=>x!=="--offline"))throw Error("Unknown option");
 const pool=await buildAndPool({offline:argv.includes("--offline")});
 await mkdir(path.dirname(PATHS.output),{recursive:true});
 await writeFile(PATHS.output,JSON.stringify(pool,null,2)+"\n");
 console.log("Saved "+PATHS.output+" (local and gitignored).");
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
 main().catch(e=>{console.error(e?.stack||e);process.exitCode=1;});
