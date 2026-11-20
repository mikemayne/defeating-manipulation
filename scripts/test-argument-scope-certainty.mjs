import assert from 'node:assert/strict';
import {inferScopeCertaintyGap as gap} from '../extension/src/argument-scope-certainty.mjs';
import {combineArgumentEvidence,analyseArguments,argumentFindings}
 from '../extension/src/argument-analysis.mjs';

// Independently authored fictional controls, not copied from the frozen
// 1000-row development corpus. No imported gold labels or benchmark scores.
const positives=[
 ['citywide-from-one-ward',
  'One Meadowbridge ward reported a 6 percent increase in library loans.',
  'The nationwide rate of library loans has increased by precisely 6 percent.',
  'single_local_measurement_to_population_statistic'],
 ['national-from-one-clinic',
  'A single coastal clinic measured a 4 percent drop in waiting times.',
  'The national rate of waiting times has dropped by exactly 4 percent.',
  'single_local_measurement_to_population_statistic'],
 ['regional-from-single-branch',
  'A local eastside branch recorded a 12 percent rise in course enrolments.',
  'The regional rate of course enrolments has risen by exactly 9 percent.',
  'single_local_measurement_to_population_statistic'],
 ['early-feedback-to-zero-errors',
  'The initial small medical-device trial returned promising early feedback.',
  'The completed project will have zero failures without exception.',
  'preliminary_observation_to_unqualified_final_guarantee'],
 ['pilot-to-perfect-outcome',
  'The first pilot survey produced an encouraging preliminary result.',
  'The final study will produce a perfect result without exception.',
  'preliminary_observation_to_unqualified_final_guarantee'],
 ['prototype-to-all-success',
  'An early prototype test generated favourable preliminary results.',
  'The production version will pass every test without exception.',
  'preliminary_observation_to_unqualified_final_guarantee'],
 ['feature-to-zero-accidents',
  'The delivery van now includes a larger mirror.',
  'The delivery van will never cause an accident under any circumstances.',
  'isolated_feature_to_no_future_risk'],
 ['feature-to-zero-outages',
  'The relay cabinet now uses an improved switch.',
  'The relay cabinet will never suffer an outage ever again.',
  'isolated_feature_to_no_future_risk'],
 ['feature-to-total-access',
  'The booking portal now uses a redesigned menu.',
  'Every person with any disability can use every feature of the booking portal independently.',
  'isolated_feature_to_universal_accessibility'],
 ['feature-to-total-access-two',
  'The mobile ticket app now includes clearer labels.',
  'Every user with any disability can use every function of the mobile ticket app independently.',
  'isolated_feature_to_universal_accessibility'],
 ['one-show-to-ten-future',
  'Every ticket was sold for one chamber concert last year.',
  'The next 10 chamber concerts are certain to sell out completely.',
  'one_sold_out_event_to_guaranteed_future_series'],
 ['one-gala-to-future',
  'All tickets sold for a single charity gala last month.',
  'The next 4 charity galas are guaranteed to sell out completely.',
  'one_sold_out_event_to_guaranteed_future_series'],
 ['one-soldout-multi-word',
  'All tickets were sold for one science lecture last week.',
  'The next 8 science lectures will be sure to sell out completely.',
  'one_sold_out_event_to_guaranteed_future_series'],
 ['garden-to-unemployment',
  'The eastern council renovated the old botanical garden.',
  'Regional unemployment will fall by exactly 11 percent next month because of that renovation.',
  'local_intervention_to_exact_macro_causal_prediction'],
 ['bridge-to-inflation',
  'The county authority repaired the local footbridge.',
  'National inflation will decrease by precisely 5 percent because of that repair.',
  'local_intervention_to_exact_macro_causal_prediction'],
 ['museum-to-tax',
  'The riverside charity built a new museum.',
  'Countywide tax revenue will increase by exactly 3 percent because of that project.',
  'local_intervention_to_exact_macro_causal_prediction']
];
const marker='therefore';
for(const [id,p,c,reason] of positives){
 const v=gap(p,c,{inferenceMarker:marker});
 assert.equal(v?.label,'unsupported_conclusion',id+': '+JSON.stringify(v));
 assert.equal(v?.reason,reason,id);
 assert.ok(v.obligation&&v.observed,id+' must identify the specific missing bridge');
}
const negatives=[
 ['no-marker','One Meadowbridge ward reported a 6 percent increase in library loans.',
  'The nationwide rate of library loans has increased by precisely 6 percent.', ''],
 ['different-metric','One Meadowbridge ward reported a 6 percent increase in library loans.',
  'The nationwide rate of road traffic has increased by precisely 6 percent.'],
 ['different-direction','One Meadowbridge ward reported a 6 percent increase in library loans.',
  'The national rate of library loans has dropped by exactly 6 percent.'],
 ['local-to-local','One Meadowbridge ward reported a 6 percent increase in library loans.',
  'The local rate of library loans has increased by exactly 6 percent.'],
 ['representative-study',
  'A nationally representative survey of every ward reported a 6 percent increase in library loans.',
  'The national rate of library loans has increased by exactly 6 percent.'],
 ['local-bounded','One Meadowbridge ward reported a 6 percent increase in library loans.',
  'Library loans in that ward increased by 6 percent.'],
 ['local-tentative','One Meadowbridge ward reported a 6 percent increase in library loans.',
  'The national rate of library loans might have increased by 6 percent.'],
 ['local-quoted','The article quoted "One Meadowbridge ward reported a 6 percent increase in library loans."',
  'The national rate of library loans has increased by exactly 6 percent.'],
 ['local-two-premises',
  'One Meadowbridge ward reported a 6 percent increase in library loans. A representative national sample separately found the same increase.',
  'The national rate of library loans has increased by exactly 6 percent.'],
 ['prelim-not-final','The first small materials trial produced encouraging results.',
  'The group will conduct the final materials trial next year.'],
 ['prelim-modest','The first small materials trial produced encouraging results.',
  'The final project will probably meet its main goal.'],
 ['prelim-stated-success',
  'The completed full materials trial produced verified results and found every test passed.',
  'The final project passed every test.'],
 ['prelim-extra-proof',
  'The first small materials trial produced encouraging results. Every later trial was also independently tested and passed.',
  'The final project will pass every test without exception.'],
 ['prelim-just-description',
  'The first small materials trial produced encouraging results.',
  'The early results were encouraging.'],
 ['prelim-only-probability',
  'A small preliminary survey showed an early improvement.',
  'The final project could show an improvement.'],
 ['feature-different-object',
  'The delivery van now includes a larger mirror.',
  'The minibus will never cause an accident under any circumstances.'],
 ['feature-minor-benefit',
  'The delivery van now includes a larger mirror.',
  'The delivery van may be easier to manoeuvre.'],
 ['feature-is-present',
  'The delivery van now includes a larger mirror.',
  'The delivery van now has a larger mirror.'],
 ['feature-covered-by-full-testing',
  'The delivery van has a certified for all uses safety and accident-prevention system.',
  'The delivery van will never cause an accident under any circumstances.'],
 ['feature-other-access-system',
  'The booking portal now uses a redesigned menu.',
  'Every person with any disability can use every feature of the travel app independently.'],
 ['feature-access-limited',
  'The booking portal now uses a redesigned menu.',
  'Some users may find the booking portal easier to navigate.'],
 ['feature-access-tested',
  'The booking portal has a complete accessibility assessment supporting every feature.',
  'Every person with any disability can use every feature of the booking portal independently.'],
 ['feature-conditional',
  'If the delivery van now includes a larger mirror, drivers will be trained.',
  'The delivery van will never cause an accident under any circumstances.'],
 ['future-single-event-claim',
  'All tickets sold for one chamber concert last year.',
  'The chamber concert sold all its tickets.'],
 ['future-probability',
  'All tickets sold for one chamber concert last year.',
  'The next 10 chamber concerts might sell out.'],
 ['future-different-event',
  'All tickets sold for one chamber concert last year.',
  'The next 10 football matches are certain to sell out completely.'],
 ['future-real-forecast',
  'An independently validated model of all subsequent events predicted sellouts for the season.',
  'The next 10 chamber concerts are certain to sell out completely.'],
 ['future-same-single-event',
  'All tickets sold for one chamber concert last year.',
  'That chamber concert was sold out.'],
 ['future-other-premises',
  'All tickets sold for one chamber concert last year. The organiser also signed guaranteed sellout contracts for the next 10 concerts.',
  'The next 10 chamber concerts are certain to sell out completely.'],
 ['future-quote',
  'The organiser said "All tickets sold for one chamber concert last year."',
  'The next 10 chamber concerts are certain to sell out completely.'],
 ['macro-local-outcome',
  'The eastern council renovated the old botanical garden.',
  'Visitors to the renovated garden may increase.'],
 ['macro-no-exact',
  'The eastern council renovated the old botanical garden.',
  'Regional unemployment might decrease in the future.'],
 ['macro-evidence',
  'A validated predictive model found a direct relationship between the restoration and regional employment.',
  'Regional unemployment will fall by exactly 11 percent because of that restoration.'],
 ['macro-other-cause',
  'The eastern council renovated the old botanical garden.',
  'National inflation will decrease by exactly 5 percent because of new bank policy.'],
 ['macro-no-causal-link',
  'The eastern council renovated the old botanical garden.',
  'Regional unemployment will fall by exactly 11 percent.'],
 ['macro-no-restoration',
  'The eastern council discussed the old botanical garden.',
  'Regional unemployment will fall by exactly 11 percent because of that restoration.'],
 ['macro-different-condition',
  'The eastern council renovated the old botanical garden.',
  'If the whole economy grows, unemployment might fall.'],
 ['sentences-not-simple',
  'The eastern council renovated the old botanical garden. A national employment study independently corroborated the projected impact.',
  'Regional unemployment will fall by exactly 11 percent because of that renovation.'],
 ['unsafe-embedded-words',
  'One Meadowbridge ward reported a 6 percent increase in library loans. The source says in a revised note that more data is available.',
  'The national rate of library loans has increased by exactly 6 percent.'],
 ['quoted-source',
  '"The first small materials trial produced encouraging results."',
  'The completed project will meet every goal without exception.']
];
for(const [id,p,c,whichMarker] of negatives)
 assert.equal(gap(p,c,{inferenceMarker:whichMarker===undefined?marker:whichMarker}),null,
  'must abstain: '+id+' -> '+JSON.stringify(gap(p,c,{inferenceMarker:marker})));
const neutral={contradiction:0.001,neutral:0.998,entailment:0.001};
for(const i of [0,3,6,8,10,13]){
 const [id,p,c]=positives[i];
 const v=combineArgumentEvidence([{kind:'combined',text:p,forward:neutral}],c,
  {inferenceMarker:marker});
 assert.equal(v?.label,'unsupported_conclusion','integrated: '+id+': '+JSON.stringify(v));
 assert.equal(v?.status,'verified_evidence_type_mismatch','status: '+id);
 assert.equal(v?.reason,undefined,'reason is held on evidence row, not top level: '+id);
}
const diag=[];
const passage='One Greenford clinic reported a 7 percent rise in vaccination visits. Therefore, the national rate of vaccination visits has risen by exactly 7 percent.';
const result=await analyseArguments(passage,async()=>neutral,{onDiagnostic:x=>diag.push(x)});
assert.equal(diag.length,1);
assert.equal(diag[0]?.proofObligation?.reason,'single_local_measurement_to_population_statistic');
assert.equal(result.length,1);
assert.equal(result[0].label,'unsupported_conclusion');
assert.equal(argumentFindings(result).length,1,'only actual overclaim should be underlined');

const tent=await analyseArguments(
 'One Greenford clinic reported a 7 percent rise in vaccination visits. Therefore, the national rate of vaccination visits may also have risen.',
 async()=>neutral);
assert.equal(argumentFindings(tent).length,0,'tentative comparison is not an invalid certainty claim');

console.log('Evidence-scope / certainty checks passed:',
 positives.length,'positive gaps,',negatives.length,'adversarial abstentions and integration guards.');
