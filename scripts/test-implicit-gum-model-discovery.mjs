import assert from "node:assert/strict";
import {VERSION,evaluateModelDiscovery}
 from "./implicit-gum-model-discovery.mjs";

const rows=[
 {id:"x01",genre:"news",text:"The committee recorded six errors in its register. The register contains several previously reported errors."},
 {id:"x02",genre:"essay",text:"The library catalogues many local publications. The catalogue has grown throughout the spring season."},
 {id:"x03",genre:"news",text:"A report is not necessarily an accurate assessment. The agency received the report without comment."}
];
assert.equal(VERSION,"implicit-model-discovery-gum-v1");
let called=0;
const good=await evaluateModelDiscovery(rows,async(p,h)=>{
 called++;
 return p.startsWith("The committee")?
  {entailment:.97,neutral:.01,contradiction:.02}:
  {entailment:.1,neutral:.8,contradiction:.1};
},{limit:3});
assert.equal(good.inputParagraphs,3);
assert.ok(good.eligibleForDiscovery>=1);
assert.ok(good.modelScoringCalls>=2);
assert.ok(called>=2);
assert.ok(good.candidates>=1);
assert.equal(good.modelErrors,0);
assert.equal(good.sourceOffsetsValid,true);
assert.doesNotMatch(JSON.stringify(good),/committee recorded|local publications|agency received/);
const none=await evaluateModelDiscovery(rows,async()=>({
 entailment:.1,neutral:.85,contradiction:.05
}),{limit:3});
assert.equal(none.candidates,0);
const bad=await evaluateModelDiscovery(rows,async()=>{
 throw Error("intentional simulated offline failure");
},{limit:3});
assert.ok(bad.modelErrors>=1);
await assert.rejects(
 evaluateModelDiscovery([],async()=>{}),/Invalid/);
console.log("Model-assisted GUM diagnostic: fixed candidate cap, asymmetric "+
 "NLI entailment, abstention, invalid model handling, source-offset integrity "+
 "and source-free aggregate-only report passed.");
