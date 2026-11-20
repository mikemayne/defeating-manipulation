import assert from "node:assert/strict";
import {extractArguments,extractArgumentStatements} from "../extension/src/argument-clauses.mjs";
import {recoverDiscourseArguments} from "../extension/src/implicit-discourse-passes.mjs";
import {analyseArguments,argumentFindings} from "../extension/src/argument-analysis.mjs";

// Purely invented cases. No user-provided, downloaded or real-world corpus text.
const positives=[
 ["The meter recorded 17 units. That meant that the recorded supply was too low.","anaphoric_inference"],
 ["The inspection recorded five safety problems. This showed that the building was not safe.","anaphoric_inference"],
 ["The report is misleading. The report omitted three of the twelve results.","claim_then_evidence"],
 ["The company filed the wrong numbers. The company reported a different total.","claim_then_evidence"],
 ["The test showed the bridge had defects. The bridge was not safe.","evidence_then_claim"]
];
const negatives=[
 "The park had a new entrance. The older entrance was still open.",
 "The bank published a statement. The gardener planted roses.",
 "The committee voted to approve the application. The board met again later.",
 'The manager said "This report is misleading." The staff printed the report.',
 "The report says the number is wrong because it contains a typo."
];
for (const [source,method] of positives){
 const copy=source;
 const proposals=recoverDiscourseArguments(source,extractArgumentStatements(source));
 assert.ok(proposals.length>0,"Recovered: "+source);
 const a=proposals[0];
 assert.equal(a.reconstructionMethod,method);
 assert.equal(copy,source,"Never change original input");
 assert.notEqual(a.analysisText,source,"Working copy may contain a conjunction");
 assert.equal(source.slice(a.conclusion.start,a.conclusion.end),a.conclusion.text);
 for (const p of a.premises)
  assert.equal(source.slice(p.start,p.end),p.text);
 const extracted=extractArguments(source,{includeImplicit:true});
 assert.ok(extracted.some(x=>x.inferred&&x.conclusion.start===a.conclusion.start),
  "Reconstruction must reach the analysis-only extractor");
}
for (const source of negatives){
 const proposals=recoverDiscourseArguments(source,extractArgumentStatements(source));
 assert.deepEqual(proposals,[],"Unrelated or quoted claims should not be joined: "+source);
}
const input=positives[2][0];
let diagnostic=null;
const assessments=await analyseArguments(input,async ()=>
 ({contradiction:0.01,neutral:0.98,entailment:0.01}),{
 includeImplicit:true,onDiagnostic:entry=>{if(entry.inferred)diagnostic=entry;}
});
assert.equal(diagnostic?.inferred,true);
assert.ok(diagnostic?.analysisText.includes(" because "));
assert.deepEqual(argumentFindings(assessments),[],
 "A proposed implicit link must not create a red finding");
console.log("Discourse expansion: 5 synthetic positives, 5 negatives, source offsets and abstention passed.");
