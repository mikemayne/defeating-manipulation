import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {HEADER,plainTextReview} from "./convert-reader-review-to-text.mjs";

function sample(reviewer){
 const cases=Array.from({length:48},(_,i)=>[
  reviewer,"R"+String(i+1).padStart(3,"0"),
  "An example first sentence "+i+".",
  "The second sentence qualifies it "+i+".",
  "","",""
 ].join("\t"));
 return [HEADER,...cases].join("\n")+"\n";
}
const a=plainTextReview(sample("A"),"A");
assert.match(a,/REVIEWER A/);
assert.match(a,/CASE 01 \/ 48 \[R001\]/);
assert.match(a,/CASE 48 \/ 48 \[R048\]/);
assert.match(a,/Sentence 1:\nAn example first sentence 0/);
assert.match(a,/Sentence 2:\nThe second sentence qualifies it 0/);
assert.match(a,/Judgement: \nConfidence: \nNotes:/);
assert.equal((a.match(/^Judgement: /gm)||[]).length,48);
assert.equal((a.match(/^Sentence 1:/gm)||[]).length,48);
assert.doesNotMatch(a,/\bmodelButScore\b|\bgold\b|originalId/);
assert.match(plainTextReview(sample("B"),"B"),/REVIEWER B/);
assert.throws(()=>plainTextReview(sample("A"),"B"),/Malformed/);
assert.throws(()=>plainTextReview(sample("A").replace(HEADER,"wrong"),"A"),
 /Unexpected/);
assert.throws(()=>plainTextReview(sample("A").replace("R001","R002"),"A"),
 /48 unique/);
assert.throws(()=>plainTextReview(sample("A").split("\n").slice(0,-3)
 .join("\n"),"A"),/Expected 48/);
const run=spawnSync(process.execPath,[
 path.resolve(path.dirname(fileURLToPath(import.meta.url)),
  "convert-reader-review-to-text.mjs"),"--help"
],{encoding:"utf8",timeout:60000});
assert.equal(run.status,0,run.stderr);
assert.match(run.stdout,/Notepad/);
console.log("Plain-text blind-review converter: 48 ordered pairs, A/B separation, "+
 "Notepad structure, no answer-key leakage, malformed files rejected.");
