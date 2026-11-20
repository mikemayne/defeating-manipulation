import assert from "node:assert/strict";
import { discoverModelArgumentCandidates } from "../extension/src/argument-model-discovery.mjs";
import { analyseArguments, argumentFindings } from "../extension/src/argument-analysis.mjs";
import { extractArguments, extractArgumentStatements } from "../extension/src/argument-clauses.mjs";

// All examples below are invented. No downloaded corpus content or metadata
// is stored in the repository.
const premise = "The building has five functioning alarms.";
const conclusion = "The building has at least one functioning alarm.";
function pair(a,b) {
 const text=a+" "+b;
 return {text,statements:extractArgumentStatements(text)};
}
function p(e,n=.03,c=.02) {
 return {entailment:e,neutral:n,contradiction:c};
}
function fakeScore(a,b) {
 if(a===premise && b===conclusion) return Promise.resolve(p(.95));
 if(a===conclusion && b===premise) return Promise.resolve(p(.12,.85,.03));
 return Promise.resolve(p(.02,.96,.02));
}
const a=pair(premise,conclusion);
assert.equal(a.statements.length,2);
let calls=0;
const forward=await discoverModelArgumentCandidates(a.text,a.statements,
 async (x,y)=>{calls++;return fakeScore(x,y);});
assert.equal(calls,2,"One model pass costs two directional NLI calls");
assert.equal(forward.length,1);
assert.equal(forward[0].inferredConnector,"therefore");
assert.equal(forward[0].reconstructionMethod,"model_nli_directional_entailment");
assert.equal(a.text.slice(forward[0].conclusion.start,forward[0].conclusion.end),conclusion);
assert.equal(a.text.slice(forward[0].premises[0].start,forward[0].premises[0].end),premise);
assert.notEqual(forward[0].analysisText,a.text);
const b=pair(conclusion,premise);
const backward=await discoverModelArgumentCandidates(b.text,b.statements,fakeScore);
assert.equal(backward.length,1);
assert.equal(backward[0].inferredConnector,"because");
assert.equal(b.text.slice(backward[0].conclusion.start,backward[0].conclusion.end),conclusion);

assert.deepEqual(await discoverModelArgumentCandidates(
 a.text,a.statements,async()=>p(.01,.98,.01)),[],
 "Unrelated NLI-neutral sentence pairs are not treated as arguments");
assert.deepEqual(await discoverModelArgumentCandidates(
 a.text,a.statements,async()=>p(.95)),[],
 "Bidirectional paraphrases are not treated as a one-way inference");
assert.deepEqual(await discoverModelArgumentCandidates(
 a.text,a.statements,async()=>p(.01,.01,.98)),[],
 "Contradiction alone is not a premise-conclusion relation");
const single=extractArgumentStatements(premise);
assert.deepEqual(await discoverModelArgumentCandidates(premise,single,fakeScore),[],
 "One assertion alone is not a reconstructed argument");
const quoted='"The building has five functioning alarms." '+conclusion;
assert.deepEqual(await discoverModelArgumentCandidates(
 quoted,extractArgumentStatements(quoted),fakeScore),[],
 "Quoted assertions are not reconstructed");
assert.deepEqual(await discoverModelArgumentCandidates(
 a.text,a.statements,fakeScore,{maxPairs:0}),[]);
assert.deepEqual(await discoverModelArgumentCandidates(
 a.text,a.statements,fakeScore,{existing:[forward[0]]}),[],
 "Already extracted conclusions are not duplicated");

// Integration: explicit parsing still defaults to unchanged behaviour.
assert.equal(extractArguments(a.text).length,0);
assert.equal(extractArguments(a.text,{includeImplicit:true}).length,0);
const seen=[];
const assessment=await analyseArguments(a.text,fakeScore,{
 includeImplicit:true,includeModelDiscovery:true,onCandidate:c=>seen.push(c)
});
assert.equal(seen.length,1,"AI pass runs after normal extraction misses");
assert.equal(seen[0].analysisText,forward[0].analysisText);
assert.deepEqual(argumentFindings(assessment),[],
 "An inferred relationship can never independently create a red underline");
const unchanged=[];
await analyseArguments(a.text,fakeScore,{onCandidate:c=>unchanged.push(c)});
assert.equal(unchanged.length,0,"Existing labelled benchmark path is unchanged");
console.log("Model discovery: directional NLI, abstentions, original offsets, bounded inference, integration passed.");
