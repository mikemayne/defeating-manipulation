import assert from 'node:assert/strict';
import {inferExplicitPolicyPrerequisite} from '../extension/src/argument-policy-prerequisites.mjs';
import {inspectArgumentProof} from '../extension/src/argument-proof-graph.mjs';
import {combineArgumentEvidence,argumentFindings,extractArguments} from '../extension/src/argument-analysis.mjs';

// Independent fictional examples: change objects, people, classes and names
// rather than copying the frozen 200-item development benchmark.
const positives=[
 ['return-check',
  'All returned scanners receive a barcode check. Scanner 6 has been returned.',
  'Scanner 6 is due a barcode check under that policy.'],
 ['expired-policy',
  "All permits with an expired registration period are rejected by this validator. This permit's registration period has expired.",
  'The validator will reject it according to its rule.'],
 ['necessary-rota',
  'Only inspectors on the approved roster can monitor the late shift. Amira monitored the late shift.',
  'Amira must have been on the approved roster if that rule was followed.'],
 ['completed-modules',
  'Every module of the course must be completed to receive the full certificate. Evelyn completed all modules.',
  'She has met the course-completion requirement for the full certificate.'],
 ['paired-screws',
  'The workshop instructions say to tighten screws C and D before installing the panel. Both screws have already been tightened.',
  'The screw-tightening prerequisite is satisfied.'],
 ['weekend-scope',
  'The notice identifies both north and south entrances as closed all weekend. This is Sunday.',
  'Neither entrance is available under that weekend notice today.']
];
for(const [id,p,c] of positives){
 const v=inferExplicitPolicyPrerequisite(p,c);
 assert.equal(v?.label,'supported_conclusion',id+': '+JSON.stringify(v));
 assert.equal(inspectArgumentProof(p,c).verified?.label,'supported_conclusion','proof graph: '+id);
}
const negatives=[
 ['different-returned-object',
  'All returned scanners receive a barcode check. Scanner 6 has been returned.',
  'Scanner 7 is due a barcode check under that policy.'],
 ['different-check',
  'All returned scanners receive a barcode check. Scanner 6 has been returned.',
  'Scanner 6 is due a thermal check under that policy.'],
 ['not-member-of-class',
  'All returned scanners receive a barcode check. Tool 6 has been returned.',
  'Tool 6 is due a barcode check under that policy.'],
 ['no-returned-fact',
  'All returned scanners receive a barcode check. Scanner 6 was delivered yesterday.',
  'Scanner 6 is due a barcode check under that policy.'],
 ['other-validator',
  "All permits with an expired registration period are rejected by this validator. This permit's registration period has expired.",
  'The scanner will reject it according to its rule.'],
 ['not-expired',
  "All permits with an expired registration period are rejected by this validator. This permit's registration period is still valid.",
  'The validator will reject it according to its rule.'],
 ['other-property',
  "All permits with an expired registration period are rejected by this validator. This permit's inspection period has expired.",
  'The validator will reject it according to its rule.'],
 ['different-class',
  "All permits with an expired registration period are rejected by this validator. This licence's registration period has expired.",
  'The validator will reject it according to its rule.'],
 ['rota-necessary-not-sufficient',
  'Only inspectors on the approved roster can monitor the late shift. Amira is on the approved roster.',
  'Amira must have monitored the late shift if that rule was followed.'],
 ['rota-different-action',
  'Only inspectors on the approved roster can monitor the late shift. Amira supervised the late shift.',
  'Amira must have been on the approved roster if that rule was followed.'],
 ['rota-different-shift',
  'Only inspectors on the approved roster can monitor the late shift. Amira monitored the early shift.',
  'Amira must have been on the approved roster if that rule was followed.'],
 ['rota-without-condition',
  'Only inspectors on the approved roster can monitor the late shift. Amira monitored the late shift.',
  'Amira must have been on the approved roster.'],
 ['rota-different-name',
  'Only inspectors on the approved roster can monitor the late shift. Amira monitored the late shift.',
  'Ravi must have been on the approved roster if that rule was followed.'],
 ['module-some-not-all',
  'Every module of the course must be completed to receive the full certificate. Evelyn completed some modules.',
  'She has met the course-completion requirement for the full certificate.'],
 ['module-different-reward',
  'Every module of the course must be completed to receive the full certificate. Evelyn completed all modules.',
  'She has met the course-completion requirement for the full diploma.'],
 ['module-award-not-established',
  'Every module of the course must be completed to receive the full certificate. Evelyn completed all modules.',
  'She has received the full certificate.'],
 ['module-different-subject',
  'Every module of the course must be completed to receive the full certificate. Evelyn completed all modules.',
  'She has met the training-completion requirement for the full certificate.'],
 ['bolt-not-complete',
  'The workshop instructions say to tighten screws C and D before installing the panel. One screw has already been tightened.',
  'The screw-tightening prerequisite is satisfied.'],
 ['bolt-different-item',
  'The workshop instructions say to tighten screws C and D before installing the panel. Both screws have already been tightened.',
  'The bolt-tightening prerequisite is satisfied.'],
 ['bolt-more-than-one-pair',
  'The workshop instructions say to tighten screws C and D before installing the panel. Screws E and F are also present. Both screws have already been tightened.',
  'The screw-tightening prerequisite is satisfied.'],
 ['weekend-not-friday',
  'The notice identifies both north and south entrances as closed all weekend. This is Friday.',
  'Neither entrance is available under that weekend notice today.'],
 ['weekend-different-status',
  'The notice identifies both north and south entrances as open all weekend. This is Sunday.',
  'Neither entrance is available under that weekend notice today.'],
 ['weekend-only-one-closed',
  'The notice identifies the north entrance as closed all weekend. This is Sunday.',
  'Neither entrance is available under that weekend notice today.'],
 ['hedged-source',
  'All returned scanners might receive a barcode check. Scanner 6 has been returned.',
  'Scanner 6 is due a barcode check under that policy.'],
 ['quoted-policy',
  'The poster reads "All returned scanners receive a barcode check." Scanner 6 has been returned.',
  'Scanner 6 is due a barcode check under that policy.'],
 ['exception',
  'All returned scanners receive a barcode check unless they are broken. Scanner 6 has been returned.',
  'Scanner 6 is due a barcode check under that policy.']
];
for(const [id,p,c] of negatives){
 assert.equal(inferExplicitPolicyPrerequisite(p,c),null,'must abstain: '+id);
}
// Strongly wrong neural scores cannot veto a verified, well scoped rule.
const assessment=combineArgumentEvidence([{
 kind:'combined',text:positives[1][1],
 forward:{contradiction:0.002,neutral:0.997,entailment:0.001}
}],positives[1][2]);
assert.equal(assessment?.label,'supported_conclusion','explicit policy proof corrects model abstention');
assert.deepEqual(argumentFindings([{...assessment,conclusion:{start:0,end:12}}]),[],
 'supported reasoning must not be underlined');

console.log('Explicit policy and prerequisite tests passed:',
 positives.length,'independent positives,',negatives.length,'hard negatives.');
