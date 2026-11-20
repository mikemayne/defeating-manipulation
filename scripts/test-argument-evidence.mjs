import assert from 'node:assert/strict';
import fs from 'node:fs';
import { explicitConflict, specificEvidenceGap } from '../extension/src/argument-evidence-checks.mjs';
import { combineArgumentEvidence, assessNeutralArgumentEvidence } from '../extension/src/argument-analysis.mjs';

const cases=JSON.parse(fs.readFileSync('evaluation/argument-evidence-pairs.json','utf8')).cases;
const counts={ conflict:0, scope_gap:0, abstain:0 };
for(const item of cases){
 const conflict=explicitConflict(item.premise,item.conclusion);
 const gap=specificEvidenceGap(item.premise,item.conclusion);
 const observed=conflict.verified?'conflict':gap.verified?'scope_gap':'abstain';
 assert.equal(observed,item.expected_signal,`${item.id}: ${conflict.reason}; ${gap.reason}`);
 counts[observed]++;
 assert.ok(item.rationale && item.track,'Every contrast has a prior rationale and a track');
}
assert.ok(cases.length>=40 && counts.abstain>=15 && counts.conflict>=8 && counts.scope_gap>=8,
 'Balanced, independent structure challenges needed');

const realContradiction={ contradiction:.926,neutral:.074,entailment:0 };
const realReverse={ contradiction:.999,neutral:.001,entailment:0 };
const badElection={kind:'combined',text:'we won a majority in 2024',forward:realContradiction,reverse:realReverse};
assert.equal(combineArgumentEvidence([badElection],
 '1945, 1997 and 2024 go down as three of the most successful elections').label,null,
 'High bidirectional contradiction cannot override absence of explicit conflict');
const neutral={contradiction:.001,neutral:.999,entailment:0};
const physics=assessNeutralArgumentEvidence('physics explains the most basic ways in which our universe works.',
 'physics is, therefore, necessary to understand all other sciences.',
 {label:'unsupported_conclusion',score:.999,reason:'nli_neutral'});
assert.equal(physics.verdict,null,'A naked universal word cannot justify a red underline');
const realSupported=combineArgumentEvidence([{kind:'combined',text:'the boulder has more mass',forward:neutral,reverse:null}],
 'It is more difficult to change the motion of a large boulder than that of a basketball');
assert.equal(realSupported?.label,null,'Neutral science inference may abstain, not red');

const conflict=combineArgumentEvidence([{kind:'combined',text:'The clinic offers eye tests on Tuesdays.',forward:{contradiction:.96,neutral:.03,entailment:.01},reverse:{contradiction:.92,neutral:.06,entailment:.02}}],
 'The clinic does not offer eye tests on Tuesdays.');
assert.equal(conflict?.label,'contradictory_claims','Direct same-subject contradiction still detected');
const gap=combineArgumentEvidence([{kind:'combined',text:'One bus on the route has a wheelchair ramp.',forward:neutral,reverse:null}],
 'Every bus on the route has a wheelchair ramp.');
assert.equal(gap?.label,'unsupported_conclusion','Narrow evidence to explicit universal is still detected');
const noOverclaim=combineArgumentEvidence([{kind:'combined',text:'The research team gathered data in two towns.',forward:neutral,reverse:null}],
 'The research team has discovered the best method in the world.');
assert.equal(noOverclaim?.label,null,'Unsupported superlative without a specific evidential mismatch must abstain');

console.log(`Evidence checks passed: ${cases.length} independently written pairs; `+
 `${counts.conflict} explicit conflicts, ${counts.scope_gap} specific scope gaps, ${counts.abstain} abstentions; `+
 'real-browser error-score replay and neutral/supported guards.');