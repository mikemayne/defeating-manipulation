import assert from "node:assert/strict";
import {extractArgumentStatements} from "../extension/src/argument-clauses.mjs";
import {reconstructImplicitConclusions,findImplicitConclusionQuestions}
 from "../extension/src/implicit-conclusion-reconstruction.mjs";
import {validateImplicitConclusionCases,summarizeImplicitConclusionCases}
 from "../extension/src/implicit-conclusion-lab.mjs";

const question="And we're supposed to trust his immigration figures after what happened last year?";
const rows=validateImplicitConclusionCases([
 {id:"positive",text:question,expected_implicit:true,
  expected_conclusion:"His immigration figures cannot be trusted."},
 {id:"negative",text:"Can you tell me when the next train arrives?",
  expected_implicit:false},
 {id:"none",text:question,expected_implicit:true},
 {id:"invalid",text:question,expected_implicit:false},
 {id:"error",text:question}
]);
assert.equal(rows.length,5);
assert.throws(()=>validateImplicitConclusionCases([]));
assert.throws(()=>validateImplicitConclusionCases([{id:"x",text:question},
 {id:"x",text:question}]),/Invalid/);
assert.throws(()=>validateImplicitConclusionCases([{id:"x",text:question,
 expected_implicit:"yes"}]),/Invalid/);
assert.throws(()=>validateImplicitConclusionCases([{id:"x",text:question,
 expected_conclusion:42}]),/Invalid/);

const guesses=[
 "His immigration figures cannot be trusted.",
 "NONE",
 "The politician fabricated 73 secret records."
];
const results=[];
for(const [i,item] of rows.entries()){
 const statements=extractArgumentStatements(item.text);
 const candidates=findImplicitConclusionQuestions(item.text,statements);
 const attempts=[];
 let generate;
 if(i===4)generate=async()=>{throw Error("model unavailable");};
 else generate=async()=>guesses[i===0?0:i===2?1:2];
 const found=await reconstructImplicitConclusions(item.text,statements,
  generate,{onAttempt:x=>attempts.push(x)});
 results.push({
  ...item,expected_implicit:item.expected_implicit??null,
  predicted_implicit:found.length>0,
  candidates,attempts,conclusions:found
 });
}
assert.deepEqual(results.map(r=>r.attempts.map(x=>x.status)),[
 ["accepted"],[],["none"],["rejected"],["model_error"]
]);
assert.equal(results[0].conclusions[0].impliedConclusion,
 "His immigration figures cannot be trusted.");
assert.equal(results[0].conclusions[0].start,0);
assert.equal(results[0].conclusions[0].end,question.length);
assert.equal(results[3].conclusions.length,0);
assert.ok(results[4].attempts[0].error.includes("model unavailable"));
const summary=summarizeImplicitConclusionCases(results);
assert.equal(summary.cases,5);
assert.equal(summary.withCandidates,4);
assert.equal(summary.eligibleQuestions,4);
assert.equal(summary.withSuggestions,1);
assert.equal(summary.accepted,1);
assert.equal(summary.rejected,1);
assert.equal(summary.returnedNone,1);
assert.equal(summary.errors,1);
assert.equal(summary.skipped,1);
assert.equal(summary.labelled,4);
assert.deepEqual([summary.tp,summary.fp,summary.fn,summary.tn],[1,0,1,2]);
assert.equal(summary.precision,1);
assert.equal(summary.recall,.5);
assert.equal(summary.accuracy,.75);
const unlabelled=summarizeImplicitConclusionCases([{
 expected_implicit:null,predicted_implicit:false,candidates:[],attempts:[],conclusions:[]
}]);
assert.equal(unlabelled.labelled,0);
assert.equal(unlabelled.accuracy,null);
assert.equal(unlabelled.recall,null);
console.log("Implicit-conclusion lab: upload validation, model statuses, source offsets and optional-label metrics passed.");
