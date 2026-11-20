import assert from 'node:assert/strict';
import {extractArguments} from '../extension/src/argument-clauses.mjs';
import {normaliseClaimForNli} from '../extension/src/argument-claim-normalisation.mjs';
import {analyseArguments, argumentFindings} from '../extension/src/argument-analysis.mjs';

// Only fictional parser contrasts. No downloaded dataset, real-world
// quotations, URLs or provenance are committed.
const completeSubject = [
 ['The council raised rents and therefore expects higher revenue.',
  'The council expects higher revenue.'],
 ['Our team raised prices and therefore expects complaints about reliability.',
  'Our team expects complaints about reliability.'],
 ['The company cut costs and therefore expects larger profits this year.',
  'The company expects larger profits this year.'],
 ['The platform has expanded its membership and therefore expects more subscribers.',
  'The platform expects more subscribers.'],
 ['Residents changed plans and therefore expect fewer journeys this month.',
  'Residents expect fewer journeys this month.']
];
for(const [text,expected] of completeSubject) {
 const argumentsFound=extractArguments(text);
 assert.equal(argumentsFound.length,1,'Shared-subject inference: '+text);
 const candidate=argumentsFound[0];
 assert.equal(normaliseClaimForNli(candidate).text,expected,
  'The model sees a complete claim without an invented subject');
 assert.equal(text.slice(candidate.conclusion.start,candidate.conclusion.end),
  candidate.conclusion.text,'Original underline span is unchanged');
 for(const premise of candidate.premises)
  assert.equal(text.slice(premise.start,premise.end),premise.text,
   'Original premise span is unchanged');
}
const abstainInputs = [
 'It is not correct therefore to suggest the timetable can be changed at any time.',
 'Because of the weather, the concert was cancelled.',
 'The new policy will (and therefore should) remain unchanged.',
 'The magazine quotes the saying "the council won, therefore everyone agrees".',
 'Since 2022, figures have increased steadily.'
];
for (const text of abstainInputs) {
 const extracted=extractArguments(text);
 assert.equal(extracted.length,0,'Ignore incomplete, quoted or non-argument marker: '+text);
}
const original=completeSubject[0][0];
const expected=completeSubject[0][1];
let modelHypothesis=null,diagnostic=null;
const assessments=await analyseArguments(original,async (_premise,hypothesis)=>{
 modelHypothesis=hypothesis;
 return {contradiction:0.01,neutral:0.98,entailment:0.01};
},{onDiagnostic:d=>diagnostic=d});
assert.equal(modelHypothesis,expected,'The NLI scorer receives the completed hypothesis');
assert.equal(diagnostic?.modelConclusion,expected,'Diagnostics disclose transformed hypothesis');
assert.equal(diagnostic?.conclusion,extractArguments(original)[0].conclusion.text,
 'Diagnostics preserve original wording');
assert.deepEqual(argumentFindings(assessments),[],
 'Uncertain claims never produce a red underline');
console.log('Fictional single-paragraph argument tests: claim completion, quoted controls, exact offsets and NLI input passed.');
