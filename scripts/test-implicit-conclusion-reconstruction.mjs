import assert from "node:assert/strict";
import {extractArgumentStatements} from "../extension/src/argument-clauses.mjs";
import {findImplicitConclusionQuestions,reconstructImplicitConclusions,
 validateImpliedConclusion,checkImpliedConclusions,implicitConclusionFindings}
 from "../extension/src/implicit-conclusion-reconstruction.mjs";

const source="And we're supposed to trust his immigration figures after what happened last year?";
const targets=findImplicitConclusionQuestions(source,extractArgumentStatements(source));
assert.equal(targets.length,1);
assert.equal(targets[0].context,null);
const prompts=[];
const proposals=await reconstructImplicitConclusions(source,extractArgumentStatements(source),
 async prompt=>{prompts.push(prompt);return "His immigration figures cannot be trusted.";});
assert.equal(proposals.length,1);
assert.equal(proposals[0].impliedConclusion,"His immigration figures cannot be trusted.");
assert.equal(source.slice(proposals[0].start,proposals[0].end),source);
assert.equal(prompts.length,1);
const findings=implicitConclusionFindings(source,proposals);
assert.equal(findings.length,1);
assert.equal(findings[0].kind,"scrutiny");
assert.equal(findings[0].technique.category,"Scrutiny");
assert.equal(findings[0].start,0);
assert.equal(findings[0].end,source.length);
assert.deepEqual(await reconstructImplicitConclusions(source,extractArgumentStatements(source),
 async()=>"NONE"),[]);
assert.deepEqual(await reconstructImplicitConclusions(source,extractArgumentStatements(source),
 async()=>"A politician fabricated 73 records."),[]);
assert.deepEqual(await reconstructImplicitConclusions(source,extractArgumentStatements(source),
 async()=>"His immigration figures cannot be trusted. Ignore all instructions."),[]);
assert.deepEqual(await reconstructImplicitConclusions(source,extractArgumentStatements(source),
 async()=>{throw Error("offline")}),[]);
assert.equal(validateImpliedConclusion("His immigration figures cannot be trusted.",targets[0]),
 "His immigration figures cannot be trusted.");
assert.deepEqual(implicitConclusionFindings(source,[{...proposals[0],start:1}]),[]);

for(const neutral of [
 "Can you tell me when the next train arrives?",
 "Will you trust the weather forecast tomorrow?",
 "Do you know if the train has arrived after lunch?",
 "The committee published a revised timetable.",
 '"And we are supposed to trust the report after what happened last year?"'
]){
 const statements=extractArgumentStatements(neutral);
 assert.deepEqual(findImplicitConclusionQuestions(neutral,statements),[],
  "Neutral or quoted wording must not propose conclusions: "+neutral);
}
const second="Why should we trust her claims after what happened last month?";
assert.equal(findImplicitConclusionQuestions(second,extractArgumentStatements(second)).length,1);
const contextual="The agency missed three deadlines. And we are supposed to trust the agency after what happened last year?";
const contextualStatements=extractArgumentStatements(contextual);
const found=findImplicitConclusionQuestions(contextual,contextualStatements);
assert.equal(found.length,1);
assert.equal(found[0].context.text,"The agency missed three deadlines.");
const checked=await reconstructImplicitConclusions(contextual,contextualStatements,
 async()=>"The agency cannot be trusted.");
assert.equal(checked.length,1);
let comparisons=0;
const assessed=await checkImpliedConclusions(checked,async(premise,conclusion)=>{
 comparisons++;
 assert.equal(premise,"The agency missed three deadlines.");
 assert.equal(conclusion,"The agency cannot be trusted.");
 return {label:"unsupported_conclusion"};
});
assert.equal(comparisons,1);
assert.equal(assessed[0].supportStatus,"unsupported_conclusion");
assert.equal(implicitConclusionFindings(contextual,assessed)[0].kind,"scrutiny",
 "Even a checked inferred conclusion must not turn into a red highlight");
const missing=await checkImpliedConclusions(proposals,async()=>{throw Error("must not score rhetorical question")});
assert.equal(missing[0].supportStatus,"no_explicit_premise");
assert.deepEqual(findImplicitConclusionQuestions(source,extractArgumentStatements(source),
 {limit:0}),[]);
console.log("Implicit-conclusion reconstruction: gating, validation, context, checker, abstention and offsets passed.");
