import assert from "node:assert/strict";
import {VERSION,identifyImplicitLinks,scoreImplicitLinks}
 from "./implicit-gum-argument-links.mjs";
assert.equal(VERSION,"implicit-declarative-gum-v1");

const examples=[
 {id:"x01",genre:"news",text:"The inspector recorded four faulty valves. The valves are unsafe."},
 {id:"x02",genre:"essay",text:"The technicians measured a serious rise in pressure. The pressure is dangerous."},
 {id:"x03",genre:"news",text:"The committee recorded three missing receipts. These receipts are unreliable."},
 {id:"x04",genre:"essay",text:"The doors opened at noon. The visitors entered the building."},
 {id:"x05",genre:"fiction",text:"The device was inspected last week. The device is not reliable."}
];
const inspected=identifyImplicitLinks(examples);
assert.equal(inspected.paragraphs,5);
assert.ok(inspected.withImplicit>=1,
 "Invented evidence and evaluative-claim pairs should produce candidates");
assert.ok(inspected.implicitCandidates>=inspected.withImplicit);
assert.ok(inspected.entries.some(r=>r.count===0));
assert.ok(Object.keys(inspected.byGenre).length>=2);
assert.doesNotMatch(JSON.stringify({
 version:inspected.version,
 paragraphs:inspected.paragraphs,
 explicitCandidates:inspected.explicitCandidates,
 implicitCandidates:inspected.implicitCandidates,
 withImplicit:inspected.withImplicit
}),/inspector recorded|valves are unsafe/);
let calls=0;
const report=await scoreImplicitLinks(inspected,async()=>{
 calls++;
 return {entailment:0.15,contradiction:0.06,neutral:0.79};
},{maxParagraphs:4});
assert.equal(report.version,VERSION);
assert.ok(report.scoredParagraphs>=1);
assert.ok(report.scoredInferredCandidates>=1);
assert.equal(report.failedParagraphs,0);
assert.ok(calls>=1);
assert.equal(report.validSourceSpans,true);
assert.equal(Object.values(report.labels).reduce((a,b)=>a+b,0),
 report.scoredInferredCandidates);
assert.doesNotMatch(JSON.stringify(report),
 /inspector|technicians|receipts|valves|pressure/);
const unavailable=await scoreImplicitLinks(inspected,async()=>{
 throw Error("offline model");
},{maxParagraphs:4});
assert.ok(unavailable.failedParagraphs>=1);
assert.throws(()=>identifyImplicitLinks([]),/required/);
await assert.rejects(scoreImplicitLinks(null,async()=>{}),/Valid/);
console.log("Real-argument inference diagnostic: extracted unstated links, "+
 "retained source spans, scored separate NLI premise/conclusion pairs, "+
 "source-free aggregate statistics and clean model-error handling.");
