#!/usr/bin/env node
/**
 * Training-only GUM contrast expansion. Uses new, pre-frozen GUM documents
 * disjoint from the old 250-case pilot, 217-case holdout, blind KEEP review
 * queue and reserved future evaluation documents. No held-out scoring.
 *
 * node scripts/build-reader-gum-contrast-expansion.mjs [--offline]
 */
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {createHash} from "node:crypto";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {getRels,candidatesFromGdtb,GUM_COMMIT,GENRES}
 from "./build-reader-gum-pilot.mjs";
import {validateManifest} from "./build-reader-gum-transfer.mjs";
import {verifyTransferCorpus} from "./evaluate-reader-gum-transfer.mjs";
import {buildSupplement,verifyContrastSupplement}
 from "./build-reader-gum-contrast-supplement.mjs";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const local=n=>path.join(ROOT,"evaluation",n);
const BASE=local("reader-gum-transfer-v1.json");
const OLD_MANIFEST=local("reader-authentic-transfer-documents-v1.json");
const NEW_MANIFEST=local("reader-gum-contrast-expanded-documents-v1.json");
const OUTPUT=local("reader-gum-contrast-expansion-v1.json");
export const VERSION="reader-gum-contrast-expansion-v1";
const sha=value=>createHash("sha256").update(value).digest("hex");
const hash=cases=>sha(JSON.stringify(cases.map(c=>[
 c.id,c.document,c.row,c.relation,c.text,c.expected_boundaries[0]
])));
const rowPair=c=>c.text.toLowerCase();
const sourcePair=c=>c.source.toLowerCase();
const serialize=x=>({
 id:x.id,document:x.document,genre:x.genre,family:x.document,
 row:x.row,relation:x.relation,tokenRanges:x.tokenRanges,
 text:x.source,expected_boundaries:[{offset:x.offset,choice:x.gold}]
});
async function json(file){return JSON.parse(await readFile(file,"utf8"));}
function docSet(partitions){
 return new Set(Object.values(partitions).flat().map(c=>c.document));
}
export function verifyExpansionManifest(manifest,base,original){
 verifyTransferCorpus(base);
 const roles=validateManifest(original);
 if(manifest?.version!=="reader-gum-contrast-expanded-documents-v1"||
  manifest.sourceRevision!==GUM_COMMIT||
  !Array.isArray(manifest.newTrainDocuments)||
  !Array.isArray(manifest.futureUntouchedDocuments)||
  manifest.newTrainDocuments.length<30||
  manifest.futureUntouchedDocuments.length<10||
  manifest.existingTrainDataset!=="reader-gum-transfer-v1.json")
  throw Error("Invalid pinned contrast expansion manifest");
 if(sha(JSON.stringify(original))!==base.meta.manifestFingerprint)
  throw Error("Original GUM transfer manifest changed");
 const blocked=docSet(roles);
 for(const [genre,suffixes] of Object.entries(GENRES))
  for(const suffix of suffixes)blocked.add("GUM_"+genre+"_"+suffix);
 const seen=new Set();
 for(const doc of [...manifest.newTrainDocuments,...manifest.futureUntouchedDocuments]){
  if(!/^GUM_[a-z]+_[a-z0-9]+$/u.test(doc)||seen.has(doc)||
   blocked.has(doc))
   throw Error("Unpinned, repeated or excluded GUM document: "+doc);
  seen.add(doc);
 }
 return {newDocs:new Set(manifest.newTrainDocuments),
  reserved:new Set(manifest.futureUntouchedDocuments),
  oldTrainDocs:new Set(roles.train.map(c=>c.document)),
  forbidden:blocked};
}
export function additionalContrasts(candidates,alreadySeen,maxPerDocument=30){
 if(!Number.isSafeInteger(maxPerDocument)||maxPerDocument<1||
  maxPerDocument>500)throw Error("Invalid contrast cap");
 const groups=new Map();
 for(const c of candidates){
  const k=sourcePair(c);
  if(!groups.has(k))groups.set(k,[]);
  groups.get(k).push(c);
 }
 const selected=[];
 for(const group of groups.values()){
  if(new Set(group.map(c=>c.gold)).size!==1)continue;
  const c=group.filter(c=>c.gold==="but").sort((a,b)=>
   a.id.localeCompare(b.id))[0];
  if(!c||!/^comparison\.(contrast|concession)(?:\.|$)/u.test(c.relation)||
   alreadySeen.has(c.id)||alreadySeen.has(sourcePair(c)))continue;
  selected.push(c);
 }
 selected.sort((a,b)=>sha("contrast-expand|"+a.id).localeCompare(
  sha("contrast-expand|"+b.id)));
 return selected.slice(0,maxPerDocument);
}
export function verifyExpansion(expansion,base,oldManifest,newManifest){
 const rules=verifyExpansionManifest(newManifest,base,oldManifest);
 if(expansion?.meta?.version!==VERSION||
  expansion.meta.sourceRevision!==GUM_COMMIT||
  expansion.meta.baselineSelectionHash!==base.meta.selectionHash||
  expansion.meta.expansionManifestHash!==sha(JSON.stringify(newManifest))||
  !Array.isArray(expansion.cases)||
  expansion.meta.selectionHash!==hash(expansion.cases))
  throw Error("Expansion provenance, checksum or selection mismatch");
 const ids=new Set(base.train.map(c=>c.id));
 const pairs=new Set(base.train.map(rowPair));
 const bySubtype={};
 for(const c of expansion.cases){
  if(ids.has(c.id)||pairs.has(rowPair(c))||
   (!rules.newDocs.has(c.document)&&!rules.oldTrainDocs.has(c.document))||
   rules.reserved.has(c.document)||c.expected_boundaries?.length!==1||
   c.expected_boundaries[0].choice!=="but"||
   c.text[c.expected_boundaries[0].offset]!=="."||
   !/^comparison\.(contrast|concession)(?:\.|$)/u.test(c.relation))
   throw Error("Invalid, repeated or leaked expansion case "+c.id);
  ids.add(c.id);pairs.add(rowPair(c));
  const subtype=c.relation.split(".").slice(0,2).join(".");
  bySubtype[subtype]=(bySubtype[subtype]||0)+1;
 }
 if(JSON.stringify(bySubtype)!==JSON.stringify(expansion.meta.subtypeCounts))
  throw Error("Contrast/concession subtype counts differ");
 return {count:expansion.cases.length,bySubtype,
  newDocuments:new Set(expansion.cases.filter(c=>
   rules.newDocs.has(c.document)).map(c=>c.document)).size};
}
export async function buildExpansion({baseline,originalManifest,manifest,
 load=getRels,offline=false,log=console.log,maxPerDocument=30}={}){
 const [base,original,planned]=await Promise.all([
  baseline??json(BASE),originalManifest??json(OLD_MANIFEST),
  manifest??json(NEW_MANIFEST)]);
 const rule=verifyExpansionManifest(planned,base,original);
 // First include all previously unselected BUT examples from original 36 docs;
 // these are disjoint from the frozen train and test cases.
 const fromOld=await buildSupplement({
  baseline:base,manifest:original,load,offline,log:()=>{}
 });
 verifyContrastSupplement(base,fromOld,original);
 const cases=[...fromOld.cases],checksums={};
 const seen=new Set([...base.train.map(c=>c.id),
  ...base.train.map(rowPair),...cases.map(c=>c.id),
  ...cases.map(rowPair)]);
 const docs=planned.newTrainDocuments;
 for(let i=0;i<docs.length;i+=6){
  const slice=docs.slice(i,i+6);
  const output=await Promise.all(slice.map(async document=>{
   if(!rule.newDocs.has(document)||rule.reserved.has(document))
    throw Error("Expansion attempted to load excluded document");
   const raw=await load(document,{offline});
   const genre=document.split("_")[1];
   const extracted=candidatesFromGdtb(raw,document,genre);
   const selected=additionalContrasts(extracted.candidates,seen,maxPerDocument);
   return {document,sourceChecksum:sha(raw),selected};
  }));
  for(const r of output){
   checksums[r.document]=r.sourceChecksum;
   for(const c of r.selected){
    if(seen.has(c.id)||seen.has(sourcePair(c)))continue;
    cases.push(serialize(c));
    seen.add(c.id);seen.add(sourcePair(c));
   }
  }
  log("Contrast expansion: scanned "+Math.min(i+6,docs.length)+
   "/"+docs.length+" new training documents");
 }
 const subtypeCounts={};
 for(const c of cases){
  const subtype=c.relation.split(".").slice(0,2).join(".");
  subtypeCounts[subtype]=(subtypeCounts[subtype]||0)+1;
 }
 const result={
  meta:{
   version:VERSION,sourceRevision:GUM_COMMIT,
   baselineSelectionHash:base.meta.selectionHash,
   expansionManifestHash:sha(JSON.stringify(planned)),
   selectionHash:hash(cases),
   trainingSourceDocuments:rule.newDocs.size,
   futureUntouchedSourceDocuments:rule.reserved.size,
   newDocumentChecksums:checksums,
   originalTrainingSupplement:fromOld.cases.length,
   subtypeCounts,
   policy:"Training-only annotated BUT, all existing AND/BUT data and the 217-case holdout unchanged. No constructed examples or inferred KEEP labels.",
   licence:"GUM source text and scored caches stay local and gitignored."
  },cases
 };
 verifyExpansion(result,base,original,planned);
 log("Expanded contrast: "+result.cases.length+
  " additional BUT (including "+fromOld.cases.length+
  " from old training docs); "+JSON.stringify(subtypeCounts));
 log("  Original authentic training: "+base.train.length+
  " (BUT "+base.train.filter(c=>c.expected_boundaries[0].choice==="but").length+
  "); expanded total "+(base.train.length+cases.length));
 return result;
}
async function main(){
 const args=process.argv.slice(2);
 if(args.includes("-h")||args.includes("--help")){
  console.log("node scripts/build-reader-gum-contrast-expansion.mjs [--offline]");
  return;
 }
 if(args.some(x=>x!=="--offline"))throw Error("Unknown argument");
 const expansion=await buildExpansion({offline:args.includes("--offline")});
 await mkdir(path.dirname(OUTPUT),{recursive:true});
 await writeFile(OUTPUT,JSON.stringify(expansion,null,2)+"\n");
 console.log("Saved "+OUTPUT+" locally (original corpus and test remain unchanged)");
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
 main().catch(e=>{console.error(e?.stack||e);process.exitCode=1;});
