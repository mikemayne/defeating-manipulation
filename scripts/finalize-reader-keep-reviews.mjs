#!/usr/bin/env node
/**
 * Human-annotation gate for genuinely reviewed KEEP/AND/BUT examples.
 *
 * First prepare two independent sheets:
 *   node scripts/finalize-reader-keep-reviews.mjs --prepare
 * Then two different reviewers annotate the same pairs without viewing each
 * other's sheets or any model predictions. Each fills reviewerId, label and
 * optional explanation. Finalise with:
 *   node scripts/finalize-reader-keep-reviews.mjs --a ...json --b ...json
 *
 * None of these files are required for the first GUM authentic train/test run.
 * Never infer KEEP from an absent GDTB label or automatically generated pair.
 */
import {readFile,writeFile,mkdir} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createHash} from "node:crypto";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const base=n=>path.join(ROOT,"evaluation",n);
const INPUT=base("reader-gum-keep-review-queue-v1.json");
const OUTPUT=base("reader-gum-review-finalized-v1.json");
const A=base("reader-gum-review-sheet-a-v1.json");
const B=base("reader-gum-review-sheet-b-v1.json");
const LABELS=new Set(["keep","and","but","abstain"]);
export const VERSION="gum-double-review-v1";
const hash=x=>createHash("sha256").update(x).digest("hex");
const read=async n=>JSON.parse(await readFile(n,"utf8"));

export function makeReviewSheet(queue){
 if(queue?.meta?.version!=="gum-keep-human-review-queue-v1"||
  !Array.isArray(queue.items)||!queue.items.length)
  throw Error("Missing unlabelled review queue");
 const cases=queue.items.map(c=>{
  if(c.label!==null||c.status!=="unreviewed")
   throw Error("Pre-labelled queue invalid");
  return {id:c.id,first:c.first,second:c.second,label:null,reason:""};
 });
 return {version:VERSION,sourceQueueHash:hash(JSON.stringify(
  queue.items.map(c=>[c.id,c.first,c.second]))),
  reviewerId:"",
  instructions:"Classify independently: KEEP=unrelated, AND=additive/continuity, BUT=contrast, ABSTAIN=uncertain. A shared topic alone may justify AND. Do not inspect the model output or the other reviewer's annotations.",
  items:cases};
}
export function finalizeReviews(queue,left,right){
 const reference=makeReviewSheet(queue);
 if(left?.version!==VERSION||right?.version!==VERSION||
  left.sourceQueueHash!==reference.sourceQueueHash||
  right.sourceQueueHash!==reference.sourceQueueHash)
  throw Error("Review source fingerprint/version mismatch");
 const a=left.reviewerId,b=right.reviewerId;
 if(typeof a!=="string"||!a.trim()||typeof b!=="string"||!b.trim()||
  a.toLowerCase().trim()===b.toLowerCase().trim())
  throw Error("Two distinct reviewer IDs required");
 function checked(sheet){
  if(!Array.isArray(sheet.items)||sheet.items.length!==reference.items.length)
   throw Error("Incomplete reviewer item set");
  const ids=new Map();
  for(const c of sheet.items){
   if(ids.has(c.id)||!LABELS.has(c.label)||typeof c.reason!=="string")
    throw Error("Missing/duplicate/invalid human label at "+c.id);
   ids.set(c.id,c);
  }
  for(const original of reference.items){
   const item=ids.get(original.id);
   if(!item||item.first!==original.first||item.second!==original.second)
    throw Error("Human review source changed "+original.id);
  }
  return ids;
 }
 const ar=checked(left),br=checked(right);
 const agreed=[],disagreed=[],abstained=[];
 for(const source of queue.items){
  const l=ar.get(source.id),r=br.get(source.id);
  if(l.label==="abstain"||r.label==="abstain"){
   abstained.push(source.id);continue;
  }
  if(l.label!==r.label){disagreed.push(source.id);continue;}
  agreed.push({id:source.id,document:source.document,genre:source.genre,
   sourceLine:source.sourceLine,first:source.first,second:source.second,
   gold:l.label,reviewerCount:2,
   // Individual reviewer identities and free-form notes are retained in
   // their private sheets, not copied into final inference dataset.
   labelProvenance:"Two separate matching manual judgements",
   sourceKind:"genuine adjacent GUM sentences, not a constructed topic switch"});
 }
 const counts=Object.fromEntries(["keep","and","but"].map(x=>[
  x,agreed.filter(r=>r.gold===x).length]));
 return {meta:{version:VERSION,reviewed:queue.items.length,
  agreed:agreed.length,disagreed:disagreed.length,
  abstained:abstained.length,counts,
  queueFingerprint:reference.sourceQueueHash,
  limitations:"Agreement is a necessary screening step, not a guarantee of independent reviewers or representative KEEP prevalence. Do not merge into train/test without a separately specified source-document split.",
  note:"No original GDTB relation labels or model predictions were displayed to reviewers."},
  agreed,disagreed,abstained};
}
async function main(){
 const argv=process.argv.slice(2);
 if(argv.includes("--help")||argv.includes("-h")){
  console.log("node scripts/finalize-reader-keep-reviews.mjs --prepare\n"+
   "node scripts/finalize-reader-keep-reviews.mjs --a SHEET.json --b SHEET.json");
  return;
 }
 const queue=await read(INPUT);
 if(argv.length===1&&argv[0]==="--prepare"){
  const sheet=makeReviewSheet(queue);
  await Promise.all([writeFile(A,JSON.stringify(sheet,null,2)+"\n"),
   writeFile(B,JSON.stringify(sheet,null,2)+"\n")]);
  console.log("Created two BLIND, independent review sheets (unlabelled):");
  console.log(A);console.log(B);
  console.log("Assign two different reviewers; do not exchange completed sheets.");
  return;
 }
 if(argv.length!==4||argv[0]!=="--a"||argv[2]!=="--b")
  throw Error("Supply --prepare OR --a FILE --b FILE");
 const [a,b]=await Promise.all([read(argv[1]),read(argv[3])]);
 const final=finalizeReviews(queue,a,b);
 await mkdir(path.dirname(OUTPUT),{recursive:true});
 await writeFile(OUTPUT,JSON.stringify(final,null,2)+"\n");
 console.log("Human review: "+final.meta.agreed+" agreed, "+
  final.meta.disagreed+" disagreed, "+final.meta.abstained+" abstained");
 console.log("Agreed labels: "+JSON.stringify(final.meta.counts));
 console.log("Saved "+OUTPUT+" locally; NOT fed into model automatically.");
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
 main().catch(e=>{console.error(e?.stack||e);process.exitCode=1;});
