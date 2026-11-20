import assert from 'node:assert/strict';
import {normaliseEntitiesForNli,normaliseEntityTextForNli}
 from '../extension/src/argument-entity-normalisation.mjs';
import {extractArguments,analyseArguments,argumentFindings}
 from '../extension/src/argument-analysis.mjs';

// Original, fictional contrasts. No private benchmark examples or articles.
const positives=[
 ['shortlisted-candidate',
  'All shortlisted candidates were invited. Ada is on that shortlist.',
  'she was invited.','The candidate was invited.','candidate'],
 ['shortlisted-applicant',
  'All applicants on the published shortlist were invited to interview. Ada is on that shortlist.',
  'she was invited to interview.','The applicant was invited to interview.','applicant'],
 ['explicit-candidate',
  'Ada is the candidate. She completed the interview.',
  'the candidate was shortlisted.','the candidate was shortlisted.','candidate'],
 ['explicit-applicant',
  'Ben is an applicant. He applied on Friday.',
  'he was interviewed.','The applicant was interviewed.','applicant'],
 ['named-role',
  'The candidate Ada was shortlisted.',
  'she was invited.','The candidate was invited.','candidate'],
 ['named-subscriber',
  'Liam is a subscriber. Liam has paid.',
  'he is eligible.','The subscriber is eligible.','subscriber']
];
for(const [id,p,c,expected,role] of positives){
 const value=normaliseEntitiesForNli({premise:p},c);
 assert.equal(value.changed,true,id);
 assert.equal(value.hypothesis.toLowerCase(),expected.toLowerCase(),id);
 assert.equal(value.canonical,'the '+role,id);
 assert.ok(value.premise.includes('the '+role)||value.premise.includes('The '+role),id);
 assert.equal(normaliseEntityTextForNli(p,value),value.premise,
  'Apply identical mapping to each NLI comparison: '+id);
}
const negatives=[
 ['two-names','Ada is a candidate. Ben is also a candidate.','She was invited.'],
 ['two-actors','The candidate Ada spoke to the interviewer.','She was invited.'],
 ['third-person','Ada is the candidate. She told Ben he was shortlisted.','he was invited.'],
 ['quoted','All shortlisted candidates were invited. Ada is on that shortlist.','she said “I was invited.”'],
 ['no-name','The candidate was shortlisted.','She was invited.'],
 ['no-role','Ada applied for a post.','She was invited.'],
 ['different-individual','Ada is the candidate. Ben applied on Friday.','She was invited.'],
 ['ambiguous-capitals','The candidate Ada met Jordan on Friday.','She was invited.'],
 ['plural-groups','All shortlisted candidates were invited.','they were interviewed.'],
 ['names-not-inferred','The council says every resident can appeal.','she can appeal.']
];
for(const [id,p,c] of negatives) {
 const result=normaliseEntitiesForNli({premise:p},c);
 assert.equal(result.changed,false,'Ambiguity must abstain: '+id);
 assert.equal(result.premise,p,'Original premise retained: '+id);
 assert.equal(result.hypothesis,c,'Original conclusion retained: '+id);
}
// A real parser -> normalizer -> NLI handoff, with model comparisons captured.
// Text spans stay aligned to original text and remain fully intact.
const source='All shortlisted candidates were invited to interview. Ada is on that shortlist, so she was invited to interview.';
const found=extractArguments(source);
assert.equal(found.length,1,'One argument to normalise');
const comparisons=[],diagnostics=[];
const assessments=await analyseArguments(source,async (p,c)=>{
 comparisons.push({premise:p,conclusion:c});
 return {contradiction:0.001,neutral:0.998,entailment:0.001};
},{onDiagnostic:d=>diagnostics.push(d)});
assert.equal(comparisons.length,3,'Model still sees the same three views of the evidence');
assert.equal(comparisons[0].conclusion,'The candidate was invited to interview.');
assert.ok(comparisons[0].premise.includes('The candidate is on that shortlist'));
assert.ok(comparisons[1].premise.includes('All shortlisted candidates were invited'));
assert.ok(comparisons[2].premise.includes('The candidate is on that shortlist'));
assert.equal(diagnostics[0].entityNormalization?.canonical,'the candidate');
assert.equal(diagnostics[0].conclusion,found[0].conclusion.text,
 'User-visible conclusion must be the original wording');
assert.equal(diagnostics[0].comparisons[2].premise,'Ada is on that shortlist',
 'Display original evidence, not the normalized model input');
assert.ok(diagnostics[0].comparisons[2].modelPremise?.includes('The candidate'));
assert.deepEqual(argumentFindings(assessments),[],
 'Model-neutral score without explicit error does not underline a normalized claim');
for(const premise of found[0].premises)
 assert.equal(source.slice(premise.start,premise.end),premise.text,
  'Never change source offsets when rewriting model input');
assert.equal(source.slice(found[0].conclusion.start,found[0].conclusion.end),
 found[0].conclusion.text,'Keep original conclusion offsets');
console.log('Single-entity NLI normalisation: '+positives.length+
 ' role mappings, '+negatives.length+' hard negatives, source offsets and model inputs passed.');
