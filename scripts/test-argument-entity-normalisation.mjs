import assert from 'node:assert/strict';
import { normaliseEntitiesForNli, normaliseEntityTextForNli } from '../extension/src/argument-entity-normalisation.mjs';
import { extractArguments, analyseArguments, argumentFindings } from '../extension/src/argument-analysis.mjs';

// Independent fictional open-class roles: none of these nouns need a catalog entry.
const positives=[
 ['archaeologist', 'Ada is an underwater archaeologist. She completed the dive.', 'the underwater archaeologist filed a report.', 'the underwater archaeologist', 'the underwater archaeologist filed a report.'],
 ['climate-researcher', 'Mara, a climate researcher, received the report.', 'she read it.', 'the climate researcher','the climate researcher read it.'],
 ['safety-auditor', 'The safety auditor Maya completed her report.', 'She submitted it.', 'the safety auditor','The safety auditor submitted it.'],
 ['field-engineer','Kai is one of the field engineers. He arrived first.','the field engineer received instructions.','the field engineer','the field engineer received instructions.'],
 ['named-chemist','The chemist Ada wrote the letter.','she reviewed the results.','the chemist','the chemist reviewed the results.'],
 ['wildlife-ranger','Sofia was a wildlife ranger. She volunteered later.','the wildlife ranger was invited.','the wildlife ranger','the wildlife ranger was invited.'],
 ['new-role','Liam is a glassblower. He made the display.','the glassblower was hired.','the glassblower','the glassblower was hired.'],
 ['multi-word-surname','Maya Chen is a cartographer. She published the map.','the cartographer drew the map.','the cartographer','the cartographer drew the map.'],
 ['subscribing-role','Ben is a subscriber. He applied for access.','the subscriber was eligible.','the subscriber','the subscriber was eligible.'],
 ['architect','The architect Ada was shortlisted.','she was invited.','the architect','the architect was invited.'],
 ['unlisted-specialist','The specialist Ada applied yesterday.','she was interviewed.','the specialist','the specialist was interviewed.'],
 ['single-name-no-role','Robin submitted the application. She waited for a response.','she received an email.','Robin','Robin received an email.'],
 ['shortlist-not-membership','All applicants on the published shortlist were invited. Ada is on that shortlist.','she was invited.','Ada','Ada was invited.'],
 ['known-declaration','Ada is a candidate. She submitted the form.','the candidate got an answer.','the candidate','the candidate got an answer.'],
 ['marine-biologist','Rosa is a marine biologist. She worked on a reef.','the marine biologist was funded.','the marine biologist','the marine biologist was funded.']
];
for(const [id,premise,conclusion,canonical,expected] of positives) {
 const result=normaliseEntitiesForNli({premise},conclusion);
 assert.equal(result.changed,true,id+': expected a safe mapping '+JSON.stringify(result));
 assert.equal(result.canonical,canonical,id+' dynamic label');
 assert.equal(result.hypothesis.toLowerCase(),expected.toLowerCase(),id+' shared hypothesis');
 assert.equal(normaliseEntityTextForNli(premise,result),result.premise,id+' model input identical');
}
const negatives=[
 ['two-people','Ada is a librarian. Ben is an archivist.','She was invited.'],
 ['two-people-same-role','Ada is a cartographer. Ben is also a cartographer.','The cartographer was invited.'],
 ['interviewer','The engineer Ada spoke to the interviewer.','She was interviewed.'],
 ['manager','The architect Ada met the manager.','She was invited.'],
 ['quoted','Ada is a translator. She said "the report is false".','She wrote a letter.'],
 ['curly-quote','Ada is a translator. She said “the report is false”.','She wrote a letter.'],
 ['without-name','The forester received the letter.','She answered.'],
 ['different-role-claims','Ada is an engineer. Ada is a dancer.','She was hired.'],
 ['bare-list-not-role','All applicants are invited to the interview.','she was invited.'],
 ['group-pronoun','All delegates were interviewed.','They replied.'],
 ['gendered-ambiguous','Ada is a witness. He said she was mistaken.','she apologised.'],
 ['two-names-partial','Ada is an engineer. Maya applied yesterday.','She was hired.'],
 ['not-explicit-role','Ada is on the list.','the engineer was shortlisted.'],
 ['subordinate-pronoun','Ada completed the task because she wanted to help.','the job ended.'],
 ['quoted-alias','Ada is a programmer.','"she" was in the report.'],
 ['name-only-no-pronoun','Ada submitted the form.','Ada received a reply.'],
 ['unique-unknown-role','Ada completed a report.','the journalist was promoted.'],
 ['two-candidates','The scientist Ada met Ben.','She presented results.']
];
for(const [id,premise,conclusion] of negatives) {
 const got=normaliseEntitiesForNli({premise},conclusion);
 assert.equal(got.changed,false,id+' must not invent a referent: '+JSON.stringify(got));
 assert.equal(got.premise,premise,id+' original premise');
 assert.equal(got.hypothesis,conclusion,id+' original conclusion');
}
const one=positives.find(x=>x[0]==='shortlist-not-membership');
assert.equal(normaliseEntitiesForNli({premise:one[1]},one[2]).canonical,'Ada',
 'Being on a shortlist does not prove the person is an applicant; no invented role');
console.log('Open-class entity normaliser:',positives.length,'positive mappings,',negatives.length,'ambiguous/unfounded controls passed.');

// End-to-end parser -> normaliser -> same-size NLI handoff and diagnostics.
const sample='All field technicians are invited to the workshop. Nora is a field technician, so she was invited to the workshop.';
const parsed=extractArguments(sample);
assert.equal(parsed.length,1,'One explicit premise/conclusion relationship');
const inputs=[],diagnostics=[];
const neutral={contradiction:0.001,neutral:0.998,entailment:0.001};
const assessed=await analyseArguments(sample,async (premise,hypothesis)=>{
 inputs.push({premise,hypothesis});return neutral;
},{onDiagnostic:diagnostic=>diagnostics.push(diagnostic)});
assert.equal(inputs.length,3,'No extra NLI calls');
for(const {hypothesis} of inputs)
 assert.equal(hypothesis.toLowerCase(),'the field technician was invited to the workshop.');
assert.ok(inputs[0].premise.includes('Nora is a field technician'),
 'The explicit identity assertion is preserved as source evidence');
assert.equal(diagnostics[0].entityNormalization.canonical,'the field technician');
assert.equal(diagnostics[0].comparisons[0].premise,parsed[0].premise,
 'Diagnostics preserve literal original premise');
assert.ok(diagnostics[0].comparisons[0].modelPremise,
 'The changed model premise is available for inspection');
assert.deepEqual(argumentFindings(assessed),[],
 'NLI neutral alone remains insufficient for a red claim');
for(const premise of parsed[0].premises)
 assert.equal(sample.slice(premise.start,premise.end),premise.text,
 'Source offsets unchanged for each premise');
assert.equal(sample.slice(parsed[0].conclusion.start,parsed[0].conclusion.end),
 parsed[0].conclusion.text,'Conclusion underline range remains original');

// A list is not proof that someone belongs to the quantified group.
const notAType='All scientists on the published roster receive access. Ada is on that roster, so she receives access.';
const notACandidate=normaliseEntitiesForNli(extractArguments(notAType)[0], 'she receives access.');
assert.equal(notACandidate.canonical,'Ada','Do not invent a scientist role');
assert.equal(notACandidate.hypothesis,'Ada receives access.');
console.log('NLI handoff: 3 comparisons, no changed offsets and no invented group membership passed.');