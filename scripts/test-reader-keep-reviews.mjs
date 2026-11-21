import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {makeReviewSheet,finalizeReviews,VERSION}
 from "./finalize-reader-keep-reviews.mjs";

const queue={meta:{version:"gum-keep-human-review-queue-v1"},
 items:Array.from({length:8},(_,i)=>({
  id:"review"+i,first:"An authentic sentence number "+i+".",
  second:"Another original sentence number "+i+".",
  document:"GUM_reddit_sample",genre:"reddit",sourceLine:i+2,
  label:null,status:"unreviewed"
 }))};
const sheet=makeReviewSheet(queue);
assert.equal(sheet.version,VERSION);
assert.equal(sheet.items.length,8);
assert.equal(sheet.items[0].label,null);
assert.ok(!("relation" in sheet.items[0]));
const a=structuredClone(sheet),b=structuredClone(sheet);
a.reviewerId="reviewer-a";b.reviewerId="reviewer-b";
for(let i=0;i<8;i++){
 a.items[i].label=i%2?"and":"keep";
 b.items[i].label=i%2?"and":"keep";
}
b.items[1].label="but";
b.items[2].label="abstain";
const result=finalizeReviews(queue,a,b);
assert.equal(result.meta.agreed,6);
assert.equal(result.meta.disagreed,1);
assert.equal(result.meta.abstained,1);
assert.equal(result.agreed.filter(x=>x.gold==="keep").length,3);
assert.ok(result.agreed.every(x=>x.reviewerCount===2));
assert.ok(result.agreed.every(x=>!Object.keys(x).some(k=>/model|prediction/.test(k))));
const same=structuredClone(b);
same.reviewerId=a.reviewerId;
assert.throws(()=>finalizeReviews(queue,a,same),/distinct reviewer/);
const bad=structuredClone(b);
bad.items[0].label=null;
assert.throws(()=>finalizeReviews(queue,a,bad),/invalid human label/);
const wrong=structuredClone(b);
wrong.items[0].first="Changed original text";
assert.throws(()=>finalizeReviews(queue,a,wrong),/source changed/);
const badId=structuredClone(b);
badId.items[0].id=badId.items[1].id;
assert.throws(()=>finalizeReviews(queue,a,badId),/Missing\/duplicate\/invalid|source changed/);
const invalidQueue=structuredClone(queue);
invalidQueue.items[0].label="keep";
assert.throws(()=>makeReviewSheet(invalidQueue),/Pre-labelled/);
const withNewFingerprint=structuredClone(b);
withNewFingerprint.sourceQueueHash="wrong";
assert.throws(()=>finalizeReviews(queue,a,withNewFingerprint),/fingerprint/);
const cmd=spawnSync(process.execPath,[
 path.resolve(path.dirname(fileURLToPath(import.meta.url)),
  "finalize-reader-keep-reviews.mjs"),"--help"
],{encoding:"utf8",timeout:60000});
assert.equal(cmd.status,0,cmd.stderr);
console.log("Human KEEP reviews: blinded source, distinct reviewer IDs, independent "+
 "two-label agreement, conservative abstention and disagreement gating passed.");
