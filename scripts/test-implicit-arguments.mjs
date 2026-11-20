import assert from "node:assert/strict";
import {extractArguments} from "../extension/src/argument-clauses.mjs";
import {analyseArguments, argumentFindings} from "../extension/src/argument-analysis.mjs";

// Synthetic cases only. No private or downloaded corpus data is checked in.
const positive = [
 ["The product is unreliable. The product failed three independent tests.", "because"],
 ["The council recorded fourteen failed inspections. The council is not ready for the opening.", "therefore"],
 ["The policy is unfair, the policy requires every resident to pay twice.", "because"],
 ["His record in the Senate does not match his rhetoric. He voted to increase taxes 98 times and to bust the budget 277 times.", "because"]
];
const negative = [
 "The park opened a new entrance. The older entrance is still open.",
 "The policy is unfair. The rain was heavy yesterday.",
 "The report was published on Tuesday.",
 "The report says \"the policy is unfair.\" The journalist repeated the statement.",
 "The policy is unfair because every resident must pay twice."
];
for (const [source,marker] of positive) {
 const unchanged=source;
 const old=extractArguments(source);
 const inferred=extractArguments(source,{includeImplicit:true}).filter(a=>a.inferred);
 assert.ok(inferred.length===1,"One proposed implicit argument");
 const a=inferred[0];
 assert.equal(a.inferredConnector,marker);
 assert.ok(a.analysisText.includes(" "+marker+" "));
 assert.notEqual(a.analysisText,source,"Working copy may differ");
 assert.equal(source,unchanged,"Source input stays immutable");
 assert.equal(source.slice(a.conclusion.start,a.conclusion.end),a.conclusion.text);
 for (const premise of a.premises)
  assert.equal(source.slice(premise.start,premise.end),premise.text);
 assert.ok(!old.some(x=>x.inferred),"Original parser path remains unchanged");
}
for (const source of negative)
 assert.equal(extractArguments(source,{includeImplicit:true}).filter(a=>a.inferred).length,0,
  "Unrelated or attributed sentences must not become arguments: "+source);
const source=positive[0][0];
let diagnostic;
const results=await analyseArguments(source,async ()=>
 ({contradiction:0.01,neutral:0.98,entailment:0.01}),{
 includeImplicit:true,onDiagnostic:d=>diagnostic=d
});
assert.equal(diagnostic?.inferred,true);
assert.ok(diagnostic?.analysisText.includes(" because "));
assert.equal(diagnostic?.conclusion,"The product is unreliable.");
assert.deepEqual(argumentFindings(results),[],
 "A conjectured link and neutral NLI score alone cannot create red underlining");
console.log("Implicit argument reconstruction: 4 positives, 5 negatives, original offsets and abstention passed.");
