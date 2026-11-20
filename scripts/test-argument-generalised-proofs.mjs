import assert from 'node:assert/strict';
import {inferGeneralisedPremiseProof} from '../extension/src/argument-generalised-proofs.mjs';
import {inspectArgumentProof} from '../extension/src/argument-proof-graph.mjs';
import {combineArgumentEvidence,argumentFindings} from '../extension/src/argument-analysis.mjs';

// Independently written controls, deliberately not copied from the 1000-row
// v2 development benchmark. Each assertion checks specific premises, not
// the occurrence of a trigger word or a model score.
const positives=[
 ['marked-tablets',
  'All tablets labelled violet require a battery check. The tablet assigned to Celia is labelled violet.',
  'The tablet assigned to Celia requires a battery check under that rule.','supported_conclusion'],
 ['marked-security',
  'All folders marked orange must undergo a security inspection. The folder assigned to Orla is marked orange.',
  'The folder assigned to Orla must undergo a security inspection under that rule.','supported_conclusion'],
 ['marked-parcel',
  'All parcels marked green require a manual inspection. The parcel assigned to Jonah is marked green.',
  'The parcel assigned to Jonah requires a manual inspection.','supported_conclusion'],
 ['high-limit',
  'The pressure alert sounds if the tank gauge reads above 40 millimetres. The tank gauge currently reads 45 millimetres.',
  'The numeric condition for the pressure alert has been satisfied.','supported_conclusion'],
 ['low-limit',
  'The barrier alarm engages if the inlet gauge reads under 17 centimetres. The inlet gauge now reads 10 centimetres.',
  'The stated condition for the barrier alarm has been met.','supported_conclusion'],
 ['decimal-limit',
  'The temperature warning activates if the chamber gauge reads below 3.5 metres. The chamber gauge currently reads 2.3 metres.',
  'The numeric condition for the temperature warning has been satisfied.','supported_conclusion'],
 ['journey-shorter',
  'For the same journey to the lake office, the travel planner lists a 20-minute cycle and a 27-minute train ride.',
  'The cycling estimate is 7 minutes shorter than the train estimate.','supported_conclusion'],
 ['journey-longer',
  'For the same route to the south depot, the planner gives an 18-minute walk and a 12-minute bus ride.',
  'The walking estimate is 6 minutes longer than the bus estimate.','supported_conclusion'],
 ['journey-drive',
  'For the same trip to the civic hall, the planner lists a 23-minute drive and a 34-minute taxi ride.',
  'The driving estimate is 11 minutes shorter than the taxi estimate.','supported_conclusion'],
 ['date-may',
  'The archive register notes the submission date on 6 May 2025 and the review on 12 May 2025.',
  'The review date falls after the stated submission date.','supported_conclusion'],
 ['date-year-boundary',
  'The delivery log places the pickup date on 29 December 2025 and the inspection on 2 January 2026.',
  'The inspection date falls after the stated pickup date.','supported_conclusion'],
 ['date-before',
  'The school schedule lists the orientation on 17 September 2027 and the ceremony on 11 September 2027.',
  'The ceremony date falls before the stated orientation date.','supported_conclusion'],
 ['date-opposite',
  'The lab log records the calibration date on 4 April 2026 and the audit on 2 April 2026.',
  'The audit date falls after the stated calibration date.','contradictory_claims']
];
for(const [id,p,c,label] of positives){
 const got=inferGeneralisedPremiseProof(p,c);
 assert.equal(got?.label,label,'Generalised proof: '+id+' '+JSON.stringify(got));
 assert.equal(inspectArgumentProof(p,c).verified?.label,label,'Proof graph: '+id);
}
const negatives=[
 ['wrong-mark','All tablets labelled violet require a battery check. The tablet assigned to Celia is labelled indigo.',
  'The tablet assigned to Celia requires a battery check under that rule.'],
 ['wrong-person','All tablets labelled violet require a battery check. The tablet assigned to Celia is labelled violet.',
  'The tablet assigned to Nia requires a battery check under that rule.'],
 ['wrong-class','All tablets labelled violet require a battery check. The parcel assigned to Celia is labelled violet.',
  'The parcel assigned to Celia requires a battery check under that rule.'],
 ['wrong-obligation','All tablets labelled violet require a battery check. The tablet assigned to Celia is labelled violet.',
  'The tablet assigned to Celia requires a security check under that rule.'],
 ['not-every','Some tablets labelled violet require a battery check. The tablet assigned to Celia is labelled violet.',
  'The tablet assigned to Celia requires a battery check under that rule.'],
 ['marked-unknown','All tablets labelled violet require a battery check. The tablet assigned to Celia may be labelled violet.',
  'The tablet assigned to Celia requires a battery check under that rule.'],
 ['marked-exception','All tablets labelled violet require a battery check unless exempt. The tablet assigned to Celia is labelled violet.',
  'The tablet assigned to Celia requires a battery check under that rule.'],
 ['marked-quote','The sign reads "All tablets labelled violet require a battery check." The tablet assigned to Celia is labelled violet.',
  'The tablet assigned to Celia requires a battery check under that rule.'],
 ['marked-ambiguous-double','All tablets labelled violet require a battery check. The tablet assigned to Celia is labelled violet. The tablet assigned to Celia is also labelled orange.',
  'The tablet assigned to Celia requires a battery check under that rule.'],
 ['threshold-not-met','The pressure alert sounds if the tank gauge reads above 40 millimetres. The tank gauge currently reads 35 millimetres.',
  'The numeric condition for the pressure alert has been satisfied.'],
 ['threshold-equality','The pressure alert sounds if the tank gauge reads above 40 millimetres. The tank gauge currently reads 40 millimetres.',
  'The numeric condition for the pressure alert has been satisfied.'],
 ['threshold-other-instrument','The pressure alert sounds if the tank gauge reads above 40 millimetres. The pipe gauge currently reads 45 millimetres.',
  'The numeric condition for the pressure alert has been satisfied.'],
 ['threshold-other-alarm','The pressure alert sounds if the tank gauge reads above 40 millimetres. The tank gauge currently reads 45 millimetres.',
  'The numeric condition for the fire alert has been satisfied.'],
 ['threshold-other-unit','The pressure alert sounds if the tank gauge reads above 40 millimetres. The tank gauge currently reads 45 kilograms.',
  'The numeric condition for the pressure alert has been satisfied.'],
 ['threshold-different-qualifier','The pressure alert sounds if the tank gauge reads above 40 millimetres. The tank gauge might read 45 millimetres.',
  'The numeric condition for the pressure alert has been satisfied.'],
 ['threshold-outcome-not-proved','The pressure alert sounds if the tank gauge reads above 40 millimetres. The tank gauge currently reads 45 millimetres.',
  'The pressure alert has definitely sounded.'],
 ['threshold-two-readings','The pressure alert sounds if the tank gauge reads above 40 millimetres. The tank gauge currently reads 45 millimetres. The tank gauge now reads 31 millimetres.',
  'The numeric condition for the pressure alert has been satisfied.'],
 ['journey-wrong-arithmetic',
  'For the same journey to the lake office, the travel planner lists a 20-minute cycle and a 27-minute train ride.',
  'The cycling estimate is 8 minutes shorter than the train estimate.'],
 ['journey-direction',
  'For the same journey to the lake office, the travel planner lists a 20-minute cycle and a 27-minute train ride.',
  'The cycling estimate is 7 minutes longer than the train estimate.'],
 ['journey-other-mode',
  'For the same journey to the lake office, the travel planner lists a 20-minute cycle and a 27-minute train ride.',
  'The walking estimate is 7 minutes shorter than the train estimate.'],
 ['journey-other-comparator',
  'For the same journey to the lake office, the travel planner lists a 20-minute cycle and a 27-minute train ride.',
  'The cycling estimate is 7 minutes shorter than the bus estimate.'],
 ['journey-no-same-trip',
  'The travel planner lists a 20-minute cycle on one route and a 27-minute train ride on another route.',
  'The cycling estimate is 7 minutes shorter than the train estimate.'],
 ['journey-two-destinations',
  'For the same journey to the lake office, the travel planner lists a 20-minute cycle and a 27-minute train ride. A different route has also been proposed.',
  'The cycling estimate is 7 minutes shorter than the train estimate.'],
 ['date-other-event',
  'The archive register notes the submission date on 6 May 2025 and the review on 12 May 2025.',
  'The inspection date falls after the stated submission date.'],
 ['date-wrong-reference',
  'The archive register notes the submission date on 6 May 2025 and the review on 12 May 2025.',
  'The review date falls after the stated approval date.'],
 ['date-invalid',
  'The archive register notes the submission date on 31 April 2025 and the review on 12 May 2025.',
  'The review date falls after the stated submission date.'],
 ['date-missing-year',
  'The archive register notes the submission date on 6 May and the review on 12 May.',
  'The review date falls after the stated submission date.'],
 ['date-quoted',
  'The archive register notes "the submission date on 6 May 2025" and the review on 12 May 2025.',
  'The review date falls after the stated submission date.'],
 ['date-modal-may',
  'The archive register notes the submission date on 6 May 2025 and the review may happen on 12 May 2025.',
  'The review date falls after the stated submission date.'],
 ['date-same-day',
  'The archive register notes the submission date on 6 May 2025 and the review on 6 May 2025.',
  'The review date falls after the stated submission date.']
];
for(const [id,p,c] of negatives){
 assert.equal(inferGeneralisedPremiseProof(p,c),null,'Must abstain on '+id);
}
const corrected=combineArgumentEvidence([{
 kind:'combined',text:positives[0][1],
 forward:{contradiction:0.999,neutral:0.001,entailment:0}
}],positives[0][2]);
assert.equal(corrected?.label,'supported_conclusion',
 'Explicit rule proof must take priority over mistaken neural contradiction');
const underlines=argumentFindings([{...corrected,conclusion:{start:0,end:12}}]);
assert.equal(underlines.length,0,'Supported proofs must not create error underlines');
console.log('Generalised proof regression tests passed:',
 positives.length,'verified cases,',negatives.length,'hard negatives; graph and NLI integration.');
