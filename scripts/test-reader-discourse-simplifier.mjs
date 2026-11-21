import assert from "node:assert/strict";
import {simplifyDiscourseForModel,DISCOURSE_SIMPLIFIER_VERSION}
 from "../extension/src/reader-discourse-simplifier.mjs";
import {extractBoundaryProbes,buildBoundaryChoices,rankBoundaryChoices}
 from "../extension/src/reader-boundary-scorer.mjs";
import {compareReaderStrategies}
 from "../extension/src/reader-strategy-comparison.mjs";

assert.equal(DISCOURSE_SIMPLIFIER_VERSION,"discourse-v1");
const examples=[
 ["The plan failed. Nevertheless, we continued.","The plan failed, but we continued."],
 ["The plan failed. Nonetheless, we continued.","The plan failed, but we continued."],
 ["The plan failed. However, we continued.","The plan failed, but we continued."],
 ["The plan failed. Even so, we continued.","The plan failed, but we continued."],
 ["The plan failed. That said, we continued.","The plan failed, but we continued."],
 ["The plan failed. On the other hand, we continued.","The plan failed, but we continued."],
 ["The plan failed. In contrast, we continued.","The plan failed, but we continued."],
 ["The plan failed. By contrast, we continued.","The plan failed, but we continued."],
 ["The plan failed. All the same, we continued.","The plan failed, but we continued."],
 ["The plan failed. Still, we continued.","The plan failed, but we continued."],
 ["The plan failed. Yet we continued.","The plan failed, but we continued."],
 ["The plan failed. And yet we continued.","The plan failed, but we continued."],
 ["The job finished. Furthermore, we checked it.","The job finished, and we checked it."],
 ["The job finished. Moreover, we checked it.","The job finished, and we checked it."],
 ["The job finished. Additionally, we checked it.","The job finished, and we checked it."],
 ["The job finished. In addition, we checked it.","The job finished, and we checked it."],
 ["The job finished. Also, we checked it.","The job finished, and we checked it."],
 ["The device broke. Therefore, it was replaced.","The device broke, so it was replaced."],
 ["The device broke. Consequently, it was replaced.","The device broke, so it was replaced."],
 ["The device broke. As a result, it was replaced.","The device broke, so it was replaced."],
 ["The device broke. For this reason, it was replaced.","The device broke, so it was replaced."],
 ["The device broke. Thus, it was replaced.","The device broke, so it was replaced."],
 ["The device broke. Hence, it was replaced.","The device broke, so it was replaced."],
 ["The train stopped. Subsequently, the passengers left.","The train stopped, then the passengers left."],
 ["The train stopped. Afterwards, the passengers left.","The train stopped, then the passengers left."],
 ["Due to the fact that it rained, we stayed home.","Because it rained, we stayed home."],
 ["Despite the fact that it rained, we walked.","Although it rained, we walked."],
 ["In the event that you need help, ask.","If you need help, ask."],
 ["We arrived in order to help.","We arrived to help."],
 ["The package arrived late; nevertheless, it was usable.","The package arrived late, but it was usable."]
];
for(const [original,expected] of examples){
 const result=simplifyDiscourseForModel(original);
 assert.equal(result.text,expected,original);
 assert.ok(result.changes.length>0,original);
}
for(const text of [
 "However many cases remain, we must check them.",
 "Still working on the report.",
 "Yet another report arrived.",
 "It has not arrived yet.",
 "Since Tuesday, we have waited.",
 "We worked while they slept.",
 "As you can see, we succeeded.",
 "So many customers complained.",
 "Then they decided to leave.",
 "The model was trained. Otherwise it works.",
 "The findings were published. Also the committee met."
]) assert.equal(simplifyDiscourseForModel(text).text,text,text);

// Unchanged source offsets with model-only simplification of earlier clauses.
const source="The manager promised delivery. Nevertheless, the order arrived late. Customers asked for refunds.";
const original=source;
const probes=extractBoundaryProbes(source,{maxPairs:8});
assert.equal(probes.length,2);
const originalChoices=buildBoundaryChoices(source,probes[1]);
const simplifiedChoices=buildBoundaryChoices(source,probes[1],{simplifyForModel:true});
assert.equal(originalChoices[0].analysisText,simplifiedChoices[0].analysisText);
assert.ok(originalChoices[0].prefix.includes("Nevertheless,"));
assert.ok(simplifiedChoices[0].prefix.includes(", but "));
assert.equal(probes[1].punctuationStart,source.indexOf("late.")+4);
assert.equal(source,original);
const calls=[];
await rankBoundaryChoices(source,async(prefix,completion)=>{
 calls.push({prefix,completion});return completion.startsWith(" and ")?-2:-3;
},{maxPairs:8,simplifyForModel:true});
assert.equal(calls.length,2,"Explicit marker bypasses the model");
assert.ok(calls.every(c=>c.prefix.includes(", but ")));
const progressiveCalls=[];
const comparison=await compareReaderStrategies(source,async(prefix,completion)=>{
 progressiveCalls.push({prefix,completion});return completion.startsWith(" and ")?-2:-3;
},{maxPairs:8,simplifyForModel:true});
assert.equal(comparison.length,2);
assert.equal(comparison[0].context.choice,"but");
assert.equal(comparison[1].modelInputSimplified,true);
assert.ok(progressiveCalls.some(c=>c.prefix.includes(", but ")));
assert.equal(source,original,"Source must remain byte-for-byte intact");
console.log("Conservative discourse simplification, ambiguous terms, model input and preserved offsets passed.");
