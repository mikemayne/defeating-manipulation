#!/usr/bin/env node
/**
 * Versioned contrast supplement for the fixed original GUM transfer TRAIN
 * partition. Only extra, human-annotated BUT examples from the existing 36
 * training documents. Does not modify the original 308 examples, test cases,
 * review queue, or any existing model-score cache.
 *
 * node scripts/build-reader-gum-contrast-supplement.mjs
 * node scripts/build-reader-gum-contrast-supplement.mjs --offline
 */
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {createHash} from "node:crypto";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {candidatesFromGdtb,getRels,GUM_COMMIT}
 from "./build-reader-gum-pilot.mjs";
import {validateManifest} from "./build-reader-gum-transfer.mjs";
import {verifyTransferCorpus} from "./evaluate-reader-gum-transfer.mjs";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const local=n=>path.join(ROOT,"evaluation",n);
const BASE=local("reader-gum-transfer-v1.json");
const MANIFEST=local("reader-authentic-transfer-documents-v1.json");
const OUTPUT=local("reader-gum-contrast-supplement-v1.json");
export const VERSION="reader-gum-contrast-supplement-v1";
export const MAX_ADDITIONAL_BUT_PER_DOC=32;
const digest=x=>createHash("sha256").update(x).digest("hex");
const identity=c=>c.document+"|"+c.text.toLowerCase();
const candidateIdentity=c=>c.document+"|"+c.source.toLowerCase();
const rank=x=>digest("supplement-v1|"+x.document+"|"+x.row+"|"+x.id);
async function json(p){return JSON.parse(await readFile(p,"utf8"));}
const serialize=x=>({
 id:x.id,document:x.document,genre:x.genre,family:x.document,
 row:x.row,relation:x.relation,tokenRanges:x.tokenRanges,
 text:x.source,expected_boundaries:[{offset:x.offset,choice:x.gold}]
});

/**
 * Skip existing pairs, duplicated annotations and conflicting senses. Do not
 * quietly relabel the original 308 items. Preserve contrast/concession subtype.
 */
export function extraButCandidates(candidates,baseline,limit=MAX_ADDITIONAL_BUT_PER_DOC){
 if(!Number.isSafeInteger(limit)||limit<1||limit>500)
  throw Error("Invalid contrast supplement limit");
 const originalIds=new Set(baseline.map(x=>x.id));
 const originalPairs=new Set(baseline.map(identity));
 const originalDocs=new Set(baseline.map(x=>x.document));
 const grouped=new Map();
 for(const x of candidates){
  if(!originalDocs.has(x.document))
   throw Error("Candidate outside baseline TRAIN documents: "+x.document);
  const key=candidateIdentity(x);
  if(!grouped.has(key))grouped.set(key,[]);
  grouped.get(key).push(x);
 }
 const selected=[];
 for(const rows of grouped.values()){
  // Any conflict in GDTB mapping, even one involving a BUT label, is skipped.
  if(new Set(rows.map(x=>x.gold)).size!==1||rows[0].gold!=="but")continue;
  const x=rows.slice().sort((a,b)=>rank(a).localeCompare(rank(b)))[0];
  if(originalIds.has(x.id)||originalPairs.has(candidateIdentity(x)))continue;
  if(!/^comparison\.(contrast|concession)(?:\.|$)/u.test(x.relation))
   throw Error("Non-contrast BUT label included: "+x.relation);
  selected.push(x);
 }
 const byDoc=new Map();
 for(const x of selected){
  if(!byDoc.has(x.document))byDoc.set(x.document,[]);
  byDoc.get(x.document).push(x);
 }
 return [...byDoc.entries()].sort(([a],[b])=>a.localeCompare(b))
  .flatMap(([,cases])=>cases.sort((a,b)=>rank(a).localeCompare(rank(b)))
   .slice(0,limit));
}
export function verifyContrastSupplement(base,supplement,manifest){
 verifyTransferCorpus(base);
 const partition=validateManifest(manifest);
 const trainDocs=new Set(partition.train.map(x=>x.document));
 const testDocs=new Set(partition.test.map(x=>x.document));
 const reviewDocs=new Set(partition.review.map(x=>x.document));
 if(supplement?.meta?.version!==VERSION||
  supplement.meta.sourceRevision!==GUM_COMMIT||
  supplement.meta.baselineSelectionHash!==base.meta.selectionHash||
  supplement.meta.sourceManifestHash!==digest(JSON.stringify(manifest))||
  !Array.isArray(supplement.cases))
  throw Error("Contrast supplement fingerprint or source mismatch");
 const ids=new Set(base.train.map(x=>x.id));
 const pairs=new Set(base.train.map(identity));
 const seen=new Set();
 const subtype={};
 for(const c of supplement.cases){
  if(!trainDocs.has(c.document)||testDocs.has(c.document)||
   reviewDocs.has(c.document)||seen.has(c.id)||ids.has(c.id)||
   pairs.has(identity(c))||c.expected_boundaries?.length!==1||
   c.expected_boundaries[0].choice!=="but"||
   c.text?.[c.expected_boundaries[0].offset]!=="."||
   !/^comparison\.(contrast|concession)(?:\.|$)/u.test(c.relation))
   throw Error("Invalid, duplicate or leaked contrast supplement "+c.id);
  seen.add(c.id);pairs.add(identity(c));
  const family=c.relation.split(".").slice(0,2).join(".");
  subtype[family]=(subtype[family]||0)+1;
 }
 const expected=digest(JSON.stringify(supplement.cases.map(c=>[
  c.id,c.document,c.row,c.relation,c.text,c.expected_boundaries[0]
 ])));
 if(expected!==supplement.meta.selectionHash)
  throw Error("Contrast supplement case hash mismatch");
 if(JSON.stringify(subtype)!==JSON.stringify(supplement.meta.subtypeCounts))
  throw Error("Contrast subtype counts mismatch");
 return {count:supplement.cases.length,subtype,
  contributingDocs:new Set(supplement.cases.map(c=>c.document)).size};
}
export async function buildSupplement({baseline,manifest,load=getRels,
 offline=false,log=console.log,limit=MAX_ADDITIONAL_BUT_PER_DOC}={}){
 const b=baseline??await json(BASE),m=manifest??await json(MANIFEST);
 verifyTransferCorpus(b);
 const groups=validateManifest(m);
 if(digest(JSON.stringify(m))!==b.meta.manifestFingerprint)
  throw Error("Original GUM manifest changed since frozen baseline");
 const trainDocs=new Set(groups.train.map(x=>x.document));
 const excluded=new Set([...groups.test,...groups.review].map(x=>x.document));
 const byDoc=new Map();
 for(const doc of groups.train){
  if(excluded.has(doc.document))throw Error("Training doc overlaps heldout");
  const raw=await load(doc.document,{offline});
  const expected=b.meta.sourceChecksums?.[doc.document];
  if(!expected||digest(raw)!==expected)
   throw Error("GUM source changed since baseline: "+doc.document);
  const {candidates}=candidatesFromGdtb(raw,doc.document,doc.genre);
  byDoc.set(doc.document,candidates);
 }
 const baseByDoc=new Map();
 for(const row of b.train){
  if(!baseByDoc.has(row.document))baseByDoc.set(row.document,[]);
  baseByDoc.get(row.document).push(row);
 }
 const selected=[];
 for(const doc of groups.train){
  const candidates=byDoc.get(doc.document);
  // When a training source yields no original annotated full-sentence pairs,
  // do not inject extra examples from a previously unused document.
  if(!baseByDoc.has(doc.document))continue;
  selected.push(...extraButCandidates(candidates,
   baseByDoc.get(doc.document),limit));
 }
 const cases=selected.map(serialize);
 const subtypeCounts={};
 for(const c of cases){
  const family=c.relation.split(".").slice(0,2).join(".");
  subtypeCounts[family]=(subtypeCounts[family]||0)+1;
 }
 const supplement={
  meta:{
   version:VERSION,sourceRevision:GUM_COMMIT,
   baselineSelectionHash:b.meta.selectionHash,
   sourceManifestHash:digest(JSON.stringify(m)),
   limitPerTrainingDocument:limit,
   selectionPolicy:"Extra unique implicit full-sentence human GDTB BUT labels only; no train/test/review repartition, no change to the original 308 train cases or 217 test cases.",
   subtypeCounts,
   sourceDocuments:trainDocs.size,
   contributingDocs:new Set(cases.map(c=>c.document)).size,
   baselineBUT:b.train.filter(c=>c.expected_boundaries[0].choice==="but").length,
   selectionHash:digest(JSON.stringify(cases.map(c=>[
    c.id,c.document,c.row,c.relation,c.text,c.expected_boundaries[0]
   ])))
  },cases
 };
 verifyContrastSupplement(b,supplement,m);
 log("Contrast supplement: "+cases.length+" NEW BUT cases from "+
  supplement.meta.contributingDocs+" existing training documents");
 log("  Existing: "+supplement.meta.baselineBUT+
  " BUT; after expansion: "+(supplement.meta.baselineBUT+cases.length)+
  " BUT; original AND/holdout unchanged");
 log("  Contrast subtypes: "+JSON.stringify(subtypeCounts));
 return supplement;
}
async function main(){
 const args=process.argv.slice(2);
 if(args.includes("--help")||args.includes("-h")){
  console.log("node scripts/build-reader-gum-contrast-supplement.mjs [--offline]");
  return;
 }
 if(args.some(a=>a!=="--offline"))throw Error("Unknown option");
 const supplement=await buildSupplement({offline:args.includes("--offline")});
 await mkdir(path.dirname(OUTPUT),{recursive:true});
 await writeFile(OUTPUT,JSON.stringify(supplement,null,2)+"\n");
 console.log("Saved "+OUTPUT+" (gitignored; original transfer preserved).");
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
 main().catch(e=>{console.error(e?.stack||e);process.exitCode=1;});
