import assert from "node:assert/strict";
import {structuralContrastEvidence}
 from "../extension/src/reader-structural-contrast.mjs";
import {rankBoundaryChoices}
 from "../extension/src/reader-boundary-scorer.mjs";
import {scoreReaderInterpretations}
 from "../extension/src/reader-interpretation.mjs";

const cue=(a,b)=>structuralContrastEvidence(a,b);
const candidates=[
 // Same grammatical contrast structure, different occupations and referents.
 ["Maya was not a cellist.","Several cellists arrived.",true,
  "different_subject_category_polarity"],
 ["Lee wasn't a geologist.","The geologists went outside.",true,
  "different_subject_category_polarity"],
 ["She was n't a doctor.","A lot of doctors were waiting.",true,
  "different_subject_category_polarity"],
 ["Ella was not a botanist.","Her sister was a botanist.",true,
  "different_subject_category_polarity"],
 ["It was not a violin.","Other violins were on the shelf.",true,
  "different_subject_category_polarity"],
 ["She was not an engineer.","Engineers built the device.",true,
  "different_subject_category_polarity"],
 ["The team was not a club.","There were several clubs in the area.",true,
  "different_subject_category_polarity"],
 ["The measurements showed a gain.","It remains unclear why the gain occurred.",
  true,"finding_qualified_by_unknown_explanation"],
 ["The experiments found improved yields.","It is uncertain what caused them.",
  true,"finding_qualified_by_unknown_explanation"],
 ["The results showed an increase.","The reason for the increase remains unknown.",
  true,"finding_qualified_by_unknown_explanation"],
 ["The pilot study observed a benefit.","However, it remains unclear why.",
  true,"finding_qualified_by_unknown_explanation"],
 // Unrelated negation isn't contrast. Contrast must concern different
 // subjects or narrow an actual finding with unexplained causation.
 ["Maya was not a cellist.","Maya was a cellist.",false,null],
 ["Maya was not a cellist.","She was a cellist.",false,null],
 ["Maya was not a cellist.","She enjoyed cello music.",false,null],
 ["Maya was not a cellist.","No cellists were present.",false,null],
 ["Maya was not a cellist.","The cellist section had empty chairs.",false,null],
 ["Maya was not an actor.","Actor training was expensive.",false,null],
 ["Lee didn't attend the meeting.","The meeting continued.",false,null],
 ["The subjects did not improve.","The results were measured.",false,null],
 ["The results improved.","It remains unclear whether they arrived.",false,null],
 ["The trial showed an increase.","It remains unclear what day it was.",false,null],
 ["The study lacked historical data.","If we compare these two groups, can we infer causation?",
  false,null],
 ["Two studies reported similar findings.","A third study tested the same idea.",
  false,null]
];
for(const [left,right,expected,kind] of candidates){
 const result=cue(left,right);
 assert.deepEqual(result,{contrastCandidate:expected,kind},
  "Wrong cue for authored fixture: "+left+" / "+right);
 assert.deepEqual(cue(left,right),result,"Determinism");
}
for(const [left,right] of [
 [null,"some text"],["","anything"],["A".repeat(1201),"anything"],
 ["something","B".repeat(1201)],["ordinary","following"]])
 assert.deepEqual(cue(left,right),{contrastCandidate:false,kind:null});

async function scored(source,expectCue,kind=null){
 const seen=[],fake=async(prefix,completion)=>{
  seen.push({prefix,completion});return completion.includes(" but ")?-4.1:-2.2;
 };
 const orig=source.slice(0),ranked=await rankBoundaryChoices(source,fake);
 assert.equal(source,orig,"Analysis must never modify source");
 assert.equal(ranked.length,1);
 const r=ranked[0];
 if(expectCue){
  assert.equal(r.choice,"but");
  assert.equal(r.structuralCue,kind);
  assert.equal(r.decisionSource,"structural_contrast_cue");
  assert.equal(r.scoreType,"structural_relation_rule");
  assert.equal(r.punctuationAction,"analysis_only_replace");
  assert.equal(seen.length,0,"Strong structural signal should bypass neural scoring");
  assert.equal(r.candidates.length,2);
  assert.equal(r.candidates[0].score,null);
 }else {
  assert.notEqual(r.decisionSource,"structural_contrast_cue");
  if(r.decisionSource==="language_model")assert.equal(seen.length,2);
 }
 return r;
}
await scored("Maya was not a cellist. Several cellists arrived for rehearsal.",
 true,"different_subject_category_polarity");
await scored("The trial showed improved yields. It remains unclear why those yields improved.",
 true,"finding_qualified_by_unknown_explanation");
await scored("Maya was not a cellist. Her sister was a cellist.",
 true,"different_subject_category_polarity");
await scored("Maya was not a cellist. She enjoyed cello music.",false);
const explicit=await scored("Maya was not a cellist. And several cellists arrived for rehearsal.",false);
assert.equal(explicit.decisionSource,"explicit_connector");
assert.equal(explicit.choice,"and");

async function interpreted(source,expect){
 let calls=0;
 const output=await scoreReaderInterpretations(source,async()=>{
  calls++;return {entailment:.7,contradiction:.1,neutral:.2};
 });
 assert.equal(output.length,1);
 if(expect){
  assert.equal(calls,0);
  assert.equal(output[0].interpretation,"contrast");
  assert.equal(output[0].proposedConnector,"but");
  assert.equal(output[0].decisionSource,"structural_contrast_cue");
 }else assert.equal(calls,7);
}
await interpreted("Lee was not a cartographer. Some cartographers drew the maps.",true);
await interpreted("The survey found an increase. It remains unclear why that happened.",true);
await interpreted("The survey found an increase. It was measured in June.",false);
await interpreted("Lee was not a cartographer. And some cartographers drew the maps.",false);
console.log("Reader structural subject/qualifier cues: "+
 candidates.length+" authored positive/negative cases, explicit connector priority, "+
 "NLI/LM integration, original offsets, no cached text and no inference passed.");
