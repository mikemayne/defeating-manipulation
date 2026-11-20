import assert from 'node:assert/strict';
import {observableContradiction, observableSamplingLeap}
 from '../extension/src/argument-claim-relations.mjs';
import {combineArgumentEvidence,argumentFindings}
 from '../extension/src/argument-analysis.mjs';

// Independently authored fictional contrasts. The user's downloaded
// 100-paragraph media/social benchmark is NOT committed to GitHub.
const contrasts=[
 {id:'members-enter-free',premise:'The gallery notice states that admission is free for every registered member.',conclusion:'Registered members must pay an admission fee at the gallery.',expected:'conflict'},
 {id:'redevelopment-approved',premise:'The development committee formally rejected the Riverside redevelopment proposal.',conclusion:'The committee approved the Riverside redevelopment proposal.',expected:'conflict'},
 {id:'numbers-increasing',premise:'The city report states that bicycle use rose in the borough.',conclusion:'Bicycle use in the borough declined this year rather than increased.',expected:'conflict'},
 {id:'local-team-result',premise:'The match statement describes a clear victory for the visiting Eagles team.',conclusion:'The Eagles team lost the match.',expected:'conflict'},
 {id:'fully-claimed',premise:'The community draw confirms that all seventy prizes have already been claimed.',conclusion:'At least one of those seventy prizes remains unclaimed.',expected:'conflict'},
 {id:'venue-exhausted',premise:'At the concert venue every seat is sold and no extra seats will be offered.',conclusion:'Tickets are available to buy directly from the concert venue.',expected:'conflict'},
 {id:'online-event',premise:'The lecture will run online only, with no hall session scheduled.',conclusion:'The lecture will take place in the school hall.',expected:'conflict'},
 {id:'shop-hours',premise:'The council library opens for visitors on Friday.',conclusion:'The council library is closed for visitors on Friday.',expected:'conflict'},
 {id:'two-testimonials',premise:'Two customers liked the revised restaurant menu.',conclusion:'Every customer prefers the revised restaurant menu.',expected:'gap'},
 {id:'one-event',premise:'A poll of thirty concert visitors praised the new arena.',conclusion:'The whole city supports the new arena.',expected:'gap'},
 {id:'most-comments',premise:'Most comments under the housing post support the proposal.',conclusion:'All citizens in the county support the housing proposal.',expected:'gap'},
 {id:'single-route',premise:'One cycle track in the district has new lighting.',conclusion:'Every cycle track in the district has new lighting.',expected:'gap'},
 {id:'different-speakers',premise:'The editor said the theatre opens on Monday.',conclusion:'The manager said the theatre closes on Monday.',expected:'none'},
 {id:'different-dates',premise:'The library opens to visitors on Tuesday.',conclusion:'The library is closed to visitors on Wednesday.',expected:'none'},
 {id:'different-groups',premise:'Children enter the theatre free of charge.',conclusion:'Adults must pay an admission fee at the theatre.',expected:'none'},
 {id:'different-areas',premise:'The northern car park is open this morning.',conclusion:'The southern car park is closed this morning.',expected:'none'},
 {id:'old-new',premise:'The newspaper confirmed that the new sports venue opened this year.',conclusion:'The old sports venue closed this year.',expected:'none'},
 {id:'different-issues',premise:'The committee rejected the arts plan and approved the transport plan.',conclusion:'The committee approved the arts plan.',expected:'none'},
 {id:'different-objects',premise:'One gardener watered a rose bush.',conclusion:'Every councillor supports the redevelopment.',expected:'none'},
 {id:'unfounded-superlative',premise:'The shop published its first annual accounts.',conclusion:'The shop is the best retailer in Europe.',expected:'none'},
 {id:'third-party-resale',premise:'Every seat at the theatre has sold out.',conclusion:'Some tickets are available from a separate resale site.',expected:'none'},
 {id:'quoted-uncertainty',premise:'The gallery opens every Tuesday.',conclusion:'The gallery might close on Tuesday.',expected:'none'},
 {id:'population-rule',premise:'Every registered visitor gets a badge. One visitor is registered.',conclusion:'Every registered visitor gets a badge.',expected:'none'},
 {id:'same-price-revision',premise:'One cashier reported a price change.',conclusion:'All cashiers might encounter changes this month.',expected:'none'}
];
// Separate fresh controls for state opposites. Both sides must refer to the
// same subject and scope; quoted, mixed, or temporally different facts abstain.
const statePositive=[
 ['lock','The archive door remained locked during the inspection.',
  'The archive door was unlocked during the inspection.'],
 ['pass-fail','The generator passed the maintenance inspection on Tuesday.',
  'The generator failed the maintenance inspection on Tuesday.'],
 ['on-off','The laboratory machine was switched off throughout the trial.',
  'The laboratory machine was switched on throughout the trial.'],
 ['vacancy','The holiday suite was vacant throughout Saturday.',
  'The holiday suite was occupied throughout Saturday.'],
 ['sold','The balcony tickets were sold out at noon.',
  'The balcony tickets remained unsold at noon.'],
 ['service','The coastal ferry was suspended throughout Friday.',
  'The coastal ferry was operating normally throughout Friday.']
];
for(const [id,p,c] of statePositive){
 const result=observableContradiction(p,c);
 assert.equal(result.verified,true,id+': '+JSON.stringify(result));
 assert.equal(combineArgumentEvidence([{kind:'combined',text:p,forward:{contradiction:.001,neutral:.998,entailment:.001}}],c)?.label,
  'contradictory_claims',id+' must override model-neutral score');
}
const stateNegative=[
 ['different-date','The archive door remained locked on Monday.',
  'The archive door was unlocked on Tuesday.'],
 ['different-object','The north archive door remained locked during the inspection.',
  'The south archive door was unlocked during the inspection.'],
 ['different-clock','The archive door remained locked at 09:00.',
  'The archive door was unlocked at 10:00.'],
 ['quoted-report','The caretaker said "The archive door was locked on Monday."',
  'The archive door was unlocked on Monday.'],
 ['both-premise-states','The archive door was locked then unlocked during the inspection.',
  'The archive door was unlocked during the inspection.'],
 ['hedged','The archive door remained locked during the inspection.',
  'The archive door might be unlocked during the inspection.'],
 ['later','The archive door was locked, then later unlocked.',
  'The archive door was unlocked.'],
 ['distinct-category','The venue had sold out balcony tickets on Monday.',
  'The venue still had unsold standing tickets on Monday.']
];
for(const [id,p,c] of stateNegative){
 const result=observableContradiction(p,c);
 assert.equal(result.verified,false,id+': '+JSON.stringify(result));
}
const tallies={conflict:0,gap:0,none:0};
for(const row of contrasts){
 const con=observableContradiction(row.premise,row.conclusion);
 const gap=observableSamplingLeap(row.premise,row.conclusion);
 const observed=con.verified?'conflict':gap.verified?'gap':'none';
 assert.equal(observed,row.expected,row.id+' '+con.reason+' / '+gap.reason);
 tallies[observed]++;
}
assert.ok(tallies.conflict>=7&&tallies.gap>=4&&tallies.none>=8);
const entailment={contradiction:.002,neutral:.002,entailment:.996};
const neutral={contradiction:.001,neutral:.997,entailment:.002};
const mismatch=contrasts.find(x=>x.id==='fully-claimed');
const overridden=combineArgumentEvidence([{kind:'combined',text:mismatch.premise,forward:entailment}],mismatch.conclusion);
assert.equal(overridden?.label,'contradictory_claims',
 'A narrowly verified conflict vetoes an erroneous high-confidence model entailment');
const extrapolation=contrasts.find(x=>x.id==='two-testimonials');
const unsupported=combineArgumentEvidence([{kind:'combined',text:extrapolation.premise,forward:neutral}],extrapolation.conclusion);
assert.equal(unsupported?.label,'unsupported_conclusion',
 'A clearly limited sample cannot establish a whole-population conclusion');
const unrelated=contrasts.find(x=>x.id==='unfounded-superlative');
const uncertain=combineArgumentEvidence([{kind:'combined',text:unrelated.premise,forward:neutral}],unrelated.conclusion);
assert.equal(uncertain?.label??null,null,
 'No specific evidence gap means no unsupported red underline');
assert.equal(argumentFindings([{...unsupported,conclusion:{start:14,end:40},premise:extrapolation.premise,
 explanation:'Sample overclaim'}]).length,1,'One verified leap produces one localised underline');
console.log('Independent argument relations:',contrasts.length,tallies,'explicit rule verification and abstentions passed');