import assert from 'node:assert/strict';
import {inferQuantifierRelation,extractQuantifiedPropositions} from '../extension/src/argument-quantifiers.mjs';
import {inferTypedNumericRelation,extractTypedNumericalFacts} from '../extension/src/argument-numeric-relations.mjs';
import {inferNumericTemporalConstraint} from '../extension/src/argument-numeric-temporal.mjs';
import {inferSupportedDerivation} from '../extension/src/argument-supported-derivations.mjs';

// Fresh, independent controls, distinct from the labelled 200-paragraph
// corpus. The same rules must resist changed groups, scopes and modalities.
const quantPositive=[
 ['Every valve in section J was sealed during the inspection.','One valve in section J was not sealed during the inspection.'],
 ['All nine beacons passed the compatibility test.','One of the nine beacons failed the compatibility test.'],
 ['Every technician in the roster submitted their report.','At least one technician in that roster failed to submit their report.'],
 ['No delegates in the assembly attended the training on Friday.','At least one delegate in the assembly attended the training on Friday.'],
 ['All three lockers were locked yesterday.','One of the three lockers was unlocked yesterday.'],
 ['Every poster in section R was pruned yesterday.','One poster in section R was left unpruned yesterday.'],
 ['All seven drivers were verified on Monday.','One driver was not verified on Monday.'],
 ['None of the sensors were calibrated during the drill.','At least one sensor was calibrated during the drill.']
];
for(const [p,c] of quantPositive){
 const v=inferQuantifierRelation(p,c);
 assert.equal(v?.label,'contradictory_claims',`quantifier failed: ${p} => ${c}`);
 assert.equal(v.chain.at(-1).operation,'universal_existential_conflict');
}
const directQuantifierPositives=[
 ['The final attendance sheet shows nobody from the design team attended the briefing.',
  'One design-team member was present at that briefing.'],
 ['The official board record shows the recorded vote was unanimously against the amendment.',
  'One board member voted for the amendment in that recorded vote.'],
 ['The published minutes record zero votes to abstain.',
  'Several members abstained from the recorded vote.']
];
for(const [p,c] of directQuantifierPositives)
 assert.equal(inferQuantifierRelation(p,c)?.label,'contradictory_claims',
  'Direct source-grounded quantifier conflict: '+p+' / '+c);
const directQuantifierNegatives=[
 ['The final attendance sheet shows nobody from the design team attended the morning briefing.',
  'One design-team member was present at the afternoon briefing.'],
 ['The final attendance sheet shows nobody from the design team attended the briefing.',
  'One marketing-team member was present at that briefing.'],
 ['The final attendance sheet shows nobody from the design team attended the briefing.',
  'A design-team member might have been present at that briefing.'],
 ['The minutes show a recorded vote was unanimously against the first amendment.',
  'One board member voted for the second amendment.'],
 ['The official record shows the vote was unanimously against the amendment.',
  'One board member voted against the amendment.'],
 ['The published minutes record zero votes to abstain.',
  'Several members abstained from a different vote.'],
 ['The provisional minutes record zero votes to abstain.',
  'Several members abstained from the recorded vote.'],
 ['The published minutes record zero votes to abstain.',
  'Several members might have abstained from the recorded vote.'],
 ['The published minutes record zero votes to abstain, except one corrected page.',
  'Several members abstained from the recorded vote.']
];
for(const [p,c] of directQuantifierNegatives)
 assert.equal(inferQuantifierRelation(p,c),null,
  'Direct quantifier scope mismatch must abstain: '+p+' / '+c);
const quantNegatives=[
 ['Every valve in section P was locked during the drill.','One valve in section Q was unlocked during the drill.'],
 ['Every wheel was secured on Monday.','One wheel was not secured on Tuesday.'],
 ['All patients passed the screening.','One patient failed the different examination.'],
 ['Every volunteer in team A passed the test.','One volunteer in team B failed the test.'],
 ['All reviewers were accepted at the door.','One reviewer was rejected at the awards desk.'],
 ['All boxes were locked on Monday.','One box might have been unlocked on Monday.'],
 ['All chairs were locked yesterday.','One chair was unlocked yesterday, assuming an additional inspection.'],
 ['All members were verified yesterday except those on holiday.','One member was not verified yesterday.'],
 ['All beacons failed the navigation test.','One beacon failed the navigation test.'],
 ['All routers were online.','One router was offline.'],
 ['All orchids were watered.','One rose was not watered.'],
 ['All bays were closed for repairs.','The plan may reopen one bay tomorrow.'],
 ['All seats were free on Friday.','One seat was not free on Saturday.'],
 ['Each device was tested during the morning.','One device was not tested at midnight.'],
 ['All devices were unlocked in March.','One device was locked in April.'],
 ['No organisers attended the afternoon briefing.','One organiser attended the morning briefing.'],
 ['Every member was verified if the audit happened.','One member was not verified.'],
 ['Some members voted yes.','One member voted no.'],
 ['Every resident completed registration.','One visitor failed to complete registration.'],
 ['Every red sensor passed inspection.','One blue sensor failed inspection.'],
 ['Every group had a leader.','One group had no funding.'],
];
for(const [p,c] of quantNegatives)assert.equal(inferQuantifierRelation(p,c),null,`false quantifier proof: ${p} => ${c}`);

const numberPositive=[
 ['The annual report identifies exactly 24 entrants, including several part-time entrants.','The total number of entrants was 27.','contradictory_claims'],
 ['The catalogue identifies exactly 14 ornaments, including two glass ornaments.','The total number of ornaments was 14.','supported_conclusion'],
 ['The shipping ledger records 90 parcels dispatched in April and 70 parcels dispatched in May.','More parcels were dispatched in May than in April.','contradictory_claims'],
 ['The register counted 20 requests in June and 24 in July.','More requests were recorded in July than in June.','supported_conclusion'],
 ['The organisation statement lists total revenue of £700 and total expenses of £600.','The revenue exceeded expenses.','supported_conclusion'],
 ['The organisation statement lists total revenue of £700 and total expenses of £600.','The expenses exceeded revenue.','contradictory_claims'],
 ['The river reading was 4.2 and the acceptable interval is 4.5 to 6.0.','The measurement lies below that interval.','supported_conclusion'],
 ['The reservoir reading was 8.2 and the permitted interval is 4.5 to 6.0.','The reading lies within that interval.','contradictory_claims']
];
for(const [p,c,label] of numberPositive){
 const v=inferTypedNumericRelation(p,c);
 assert.equal(v?.label,label,`typed numeric failed: ${p} => ${c}`);
 assert.equal(v.chain.at(-1).type,'javascript_comparison');
}
const numericExclusionPositives=[
 ['The warehouse manifest states that the parcel contains exactly 12 standard batteries.',
  'The parcel contains exactly 15 batteries according to that manifest.','contradictory_claims'],
 ['Every seat in the auditorium has a number and the lowest number is 4.',
  'The auditorium contains a seat numbered minus two.','contradictory_claims'],
 ['The final exam record shows not a single candidate scored above 70.',
  'Several candidates scored 92.','contradictory_claims'],
 ['The inventory counted seven green folders and three yellow folders, making ten in all.',
  'There were twelve folders in that inventory.','contradictory_claims']
];
for(const [p,c,label] of numericExclusionPositives){
 const v=inferTypedNumericRelation(p,c);
 assert.equal(v?.label,label,'numeric exclusion: '+p+' / '+c+' '+JSON.stringify(v));
}
const numericExclusionNegatives=[
 ['The warehouse manifest states that this parcel contains 12 standard batteries.',
  'The parcel may contain exactly 15 batteries according to that manifest.'],
 ['The warehouse manifest states that this parcel contains 12 standard batteries.',
  'The other parcel contains exactly 15 batteries according to that manifest.'],
 ['Every seat in the auditorium has a number and the lowest number is 4.',
  'The auditorium contains a seat numbered nine.'],
 ['The final exam record shows not a single candidate scored above 70.',
  'Several candidates scored 60.'],
 ['The inventory counted seven green folders and three yellow folders, making ten in all.',
  'There were twelve files in that inventory.'],
 ['The inventory counted seven green folders and three yellow folders.',
  'There were twelve folders in that inventory.'],
 ['This report says that the parcel contains 12 standard batteries.',
  'The parcel contains exactly 15 batteries in another manifest.'],
 ['Every seat in the auditorium has a number and the lowest number is 4.',
  'A different auditorium contains a seat numbered minus two.']
];
for(const [p,c] of numericExclusionNegatives)
 assert.equal(inferTypedNumericRelation(p,c),null,'numeric exclusion must abstain: '+p+' / '+c);
const numberNegatives=[
 ['The report lists 30 employees in one office, excluding contractors.','The company has exactly 30 workers.'],
 ['The report lists approximately 90 entries.','The total number of entries was 90.'],
 ['The catalogue lists exactly 50 parcels.','The total number of people was 50.'],
 ['The paper records exactly 14 observations.','The next edition has exactly 17 observations.'],
 ['The library logged 30 books in March and 40 videos in April.','More books were processed in April than in March.'],
 ['The report says 50 widgets in March and 30 widgets in April.','There might have been fewer widgets in April than March.'],
 ['The report lists 90 parcels in March and 40 parcels in May.','More parcels moved in June than March.'],
 ['The financial report lists total revenue of £900 and total expenses of $750.','The expenses exceeded revenue.'],
 ['The balance sheet lists total income of £900 and total expenses of £750.','The income is forecast to exceed expenses next year.'],
 ['The report says total expenses of £200 and total income of £300.','Revenue exceeded costs.'],
 ['A sample reading was 5 and the acceptable interval is 4 to 8.','The result might lie above that interval.'],
 ['The lake reading was about 5 and the interval is 4 to 8.','The reading lies within that interval.'],
 ['The report shows 4 entries in March.','More entries were recorded in March than in April.'],
 ['The estimate lists exactly 10 parcels unless there are new deliveries.','The total number of parcels was 10.'],
 ['The report lists total income of £100 and total expenses of £95.','The organisation is profitable.'],
 ['The map shows two routes in June and five routes in July.','All routes in July were built.'],
];
for(const [p,c] of numberNegatives)assert.equal(inferTypedNumericRelation(p,c),null,`false numeric proof: ${p} => ${c}`);
// Fresh fictional cases, not the frozen 200-item development benchmark.
const temporalPositive=[
 ['exclusive-platform','The station information board lists platform 6 as the sole departure platform for service T92.',
  'Service T92 departs from platform 8 according to that board.','contradictory_claims'],
 ['matching-platform','The station information board lists platform 6 as the sole departure platform for service T92.',
  'Service T92 departs from platform 6 according to that board.','supported_conclusion'],
 ['exclusive-levels','The building plan confirms the north lift stops at levels 1, 3 and 5 only.',
  'The lift stops at level 9 according to that plan.','contradictory_claims'],
 ['in-listed-levels','The building plan confirms the north lift stops at levels 1, 3 and 5 only.',
  'The lift stops at level 3 according to that plan.','supported_conclusion'],
 ['universal-bound','All six bags were weighed and each was less than four kilograms.',
  'One of those bags weighed more than nine kilograms.','contradictory_claims'],
 ['staff-cutoff','The staff schedule assigns nobody to the security desk after 17:30 on Tuesday.',
  'Two security staff are assigned there at 19:00 on that Tuesday.','contradictory_claims'],
 ['dated-end','The exhibition ends on 22 March, and today is 23 March.',
  'The exhibition has already ended.','supported_conclusion']
];
for(const [id,p,c,label] of temporalPositive){
 const got=inferNumericTemporalConstraint(p,c);
 assert.equal(got?.label,label,'numeric/temporal '+id+': '+JSON.stringify(got));
}
const temporalNegative=[
 ['other-service','The station information board lists platform 6 as the sole departure platform for service T92.',
  'Service T93 departs from platform 8 according to that board.'],
 ['nonexclusive-platform','The station information board lists platform 6 as a departure platform for service T92.',
  'Service T92 departs from platform 8 according to that board.'],
 ['different-source','The station information board lists platform 6 as the sole departure platform for service T92.',
  'Service T92 departs from platform 8 according to a different board.'],
 ['other-lift','The building plan shows the north lift stops at levels 1, 3 and 5 only. A second lift serves another wing.',
  'The lift stops at level 9 according to that plan.'],
 ['lift-not-closed','The building plan shows the lift stops at levels 1, 3 and 5.',
  'The lift stops at level 9 according to that plan.'],
 ['overlapping-weight','All six bags were weighed and each was less than four kilograms.',
  'One of those bags weighed more than two kilograms.'],
 ['different-weight-units','All six bags were weighed and each was less than four kilograms.',
  'One of those bags weighed more than nine grams.'],
 ['partial-weight','Some six bags were weighed and each was less than four kilograms.',
  'One of those bags weighed more than nine kilograms.'],
 ['staff-before-cutoff','The staff schedule assigns nobody to the security desk after 17:30 on Tuesday.',
  'Two security staff are assigned there at 16:00 on that Tuesday.'],
 ['staff-other-desk','The staff schedule assigns nobody to the security desk after 17:30 on Tuesday.',
  'Two reception staff are assigned there at 19:00 on that Tuesday.'],
 ['staff-other-day','The staff schedule assigns nobody to the security desk after 17:30 on Tuesday.',
  'Two security staff are assigned there at 19:00 on that Wednesday.'],
 ['before-end','The exhibition ends on 22 March, and today is 21 March.',
  'The exhibition has already ended.'],
 ['different-event','The exhibition ends on 22 March, and today is 23 March.',
  'The carnival has already ended.'],
 ['cross-year-date','The exhibition ends on 22 December, and today is 2 January.',
  'The exhibition has already ended.'],
 ['quotation','The board reads "platform 6 as the sole departure platform for service T92".',
  'Service T92 departs from platform 8 according to that board.'],
 ['uncertain','The exhibition might end on 22 March, and today is 23 March.',
  'The exhibition has already ended.']
];
for(const [id,p,c] of temporalNegative)
 assert.equal(inferNumericTemporalConstraint(p,c),null,'numeric/temporal abstention '+id);
// Novel controls for arithmetically provable conclusions: no NLI confidence
// shortcut and no assumption that partial inventories are exhaustive.
const derivedPositives=[
 ['cost','The cab fare is £15 plus £4 for each of three extra stops.',
  'This journey costs £27 before any tip.'],
 ['remaining','Three of the eleven lamps were moved to storage, leaving eight in the main gallery.',
  'Eight of the original eleven lamps remain there.'],
 ['inventory','The clinic inventory identifies seven unused stretchers and two in service.',
  'The inventory accounts for nine stretchers in total.'],
 ['travel','The trip planner gives a 18-minute cycle and a 31-minute bus journey for the same trip.',
  'Its cycling estimate is thirteen minutes shorter.'],
 ['conditional','If the drainage level drops below six metres, the inlet pump shuts down. The gauge now reads 5.5 metres.',
  'The stated shutdown condition has been met.']
];
for(const [id,p,c] of derivedPositives){
 const got=inferSupportedDerivation(p,c);
 assert.equal(got?.label,'supported_conclusion',id+': '+JSON.stringify(got));
 assert.ok(got.verified&&got.chain.at(-1).type==='javascript_proof',id);
}
const derivedNegatives=[
 ['wrong-total','The cab fare is £15 plus £4 for each of three extra stops.',
  'This journey costs £29 before any tip.'],
 ['wrong-currency','The cab fare is $15 plus $4 for each of three extra stops.',
  'This journey costs £27 before any tip.'],
 ['missing-stop-count','The cab fare is £15 plus £4 per extra stop.',
  'This journey costs £27 before any tip.'],
 ['other-charge','The cab fare is £15 plus £4 for each of three extra stops, plus a £5 surcharge.',
  'This journey costs £27 before any tip.'],
 ['left-does-not-add','Three of the eleven lamps were moved to storage, leaving seven in the main gallery.',
  'Eight of the original eleven lamps remain there.'],
 ['different-items','Three of the eleven lamps were moved to storage, leaving eight in the main gallery.',
  'Eight of the original eleven chairs remain there.'],
 ['unclear-remaining','Three of the eleven lamps were moved to storage.',
  'Eight of the original eleven lamps remain there.'],
 ['inventory-overlap','The clinic inventory identifies seven available stretchers and two in service.',
  'The inventory accounts for nine stretchers in total.'],
 ['inventory-wrong-sum','The clinic inventory identifies seven unused stretchers and two in service.',
  'The inventory accounts for eleven stretchers in total.'],
 ['inventory-different-item','The clinic inventory identifies seven unused stretchers and two in service.',
  'The inventory accounts for nine wheelchairs in total.'],
 ['travel-different-trip','The trip planner gives a 18-minute cycle and a 31-minute bus journey for separate trips.',
  'Its cycling estimate is thirteen minutes shorter.'],
 ['travel-wrong-difference','The trip planner gives a 18-minute cycle and a 31-minute bus journey for the same trip.',
  'Its cycling estimate is fourteen minutes shorter.'],
 ['gauge-not-low','If the drainage level drops below six metres, the inlet pump shuts down. The gauge now reads 7.2 metres.',
  'The stated shutdown condition has been met.'],
 ['gauge-other','If the drainage level drops below six metres, the inlet pump shuts down. Another gauge now reads 5.5 metres.',
  'The stated shutdown condition has been met.'],
 ['gauge-unit-mismatch','If the drainage level drops below six metres, the inlet pump shuts down. The gauge now reads 5.5 feet.',
  'The stated shutdown condition has been met.'],
 ['gauge-hedged','If the drainage level drops below six metres, the inlet pump might shut down. The gauge now reads 5.5 metres.',
  'The stated shutdown condition has been met.']
];
for(const [id,p,c] of derivedNegatives)
 assert.equal(inferSupportedDerivation(p,c),null,id+' must abstain');
// Month names are not modal verbs: a source date in May must still be parsed.
const calendarPositive=[
 ['The pageant ends on 28 April and today is 2 May.','The pageant has already ended.'],
 ['The carnival ends on 14 May and tonight is 15 May.','The carnival has already ended.']
];
for(const [p,c] of calendarPositive)
 assert.equal(inferNumericTemporalConstraint(p,c)?.label,'supported_conclusion','calendar-May month parsing: '+p);
const calendarNegative=[
 ['The pageant may end on 28 April and today is 2 May.','The pageant has already ended.'],
 ['The pageant ends on 28 April and today might be 2 May.','The pageant has already ended.'],
 ['The pageant ends on 28 April and today is 2 April.','The pageant has already ended.'],
 ['The pageant ends on 28 April and today is 2 May.','The parade has already ended.']
];
for(const [p,c] of calendarNegative)
 assert.equal(inferNumericTemporalConstraint(p,c),null,'calendar claim must abstain: '+p+' / '+c);
assert.ok(extractQuantifiedPropositions('All seven lockers were sealed.').length>0);
assert.ok(extractTypedNumericalFacts('We recorded 20 widgets in April and 24 widgets in May.').length===2);
console.log(`Typed reasoning tests: ${quantPositive.length} quantifier positives, ${quantNegatives.length} quantifier abstentions, ${numberPositive.length} numeric positives, ${numberNegatives.length} numeric abstentions passed.`);

// Wiring: verified source-grounded results override mistaken NLI guesses,
// while tentative arguments remain recognised but undecided.
const {extractArguments} = await import('../extension/src/argument-clauses.mjs');
const {inspectArgumentProof} = await import('../extension/src/argument-proof-graph.mjs');
const {combineArgumentEvidence,analyseArguments,argumentFindings} =
 await import('../extension/src/argument-analysis.mjs');
const tentativeSource=
 'The festival may change its entry arrangement. This suggests that some visitors could wait longer.';
const tent=extractArguments(tentativeSource);
assert.equal(tent.length,1,'Tentative inference is still an argument');
assert.equal(tent[0].conclusion.text,tentativeSource.slice(tent[0].conclusion.start,tent[0].conclusion.end),
 'Tentative conclusion offsets must match the original source');
assert.equal(extractArguments('The station changed its menu. This suggests a different recipe.').length,0,
 'A bare suggestion is not necessarily a premise-conclusion argument');
// The new facts also enter the existing graph and override mistaken NLI
// verdicts without modifying model probabilities or displaying red support.
const temporalGraph=inspectArgumentProof(
 temporalPositive[0][1],temporalPositive[0][2]);
assert.equal(temporalGraph.verified?.label,'contradictory_claims');
assert.equal(temporalGraph.verified?.basis,'numeric');
const temporalSupported=inspectArgumentProof(
 temporalPositive[6][1],temporalPositive[6][2]);
assert.equal(temporalSupported.verified?.label,'supported_conclusion');
const temporalCombined=combineArgumentEvidence([
 {kind:'combined',text:temporalPositive[6][1],
  forward:{contradiction:0.995,neutral:0.004,entailment:0.001}}
],temporalPositive[6][2]);
assert.equal(temporalCombined?.label,'supported_conclusion');
for(const [id,p,c] of derivedPositives){
 const verified=inspectArgumentProof(p,c);
 assert.equal(verified.verified?.label,'supported_conclusion','graph: '+id+': '+JSON.stringify(verified.verified));
}
const guarded=combineArgumentEvidence([{
 kind:'combined',text:derivedPositives[0][1],
 forward:{contradiction:0.996,neutral:0.003,entailment:0.001}
}],derivedPositives[0][2]);
assert.equal(guarded?.label,'supported_conclusion','Arithmetic proof overrides neural contradiction');
const quantifiedProof=inspectArgumentProof(
 'Every storage crate was sealed yesterday.',
 'One storage crate was not sealed yesterday.');
assert.equal(quantifiedProof.verified?.label,'contradictory_claims');
assert.equal(quantifiedProof.verified?.basis,'quantifier');
const numericProof=inspectArgumentProof(
 'The independent ledger lists exactly 37 consignments, including 8 fragile consignments.',
 'The total number of consignments was 40.');
assert.equal(numericProof.verified?.label,'contradictory_claims');
const falseSupport={contradiction:0.001,neutral:0.001,entailment:0.998};
const corrected=combineArgumentEvidence([
 {kind:'combined',text:'Every storage crate was sealed yesterday.',forward:falseSupport}
],'One storage crate was not sealed yesterday.');
assert.equal(corrected?.label,'contradictory_claims');
assert.equal(corrected?.status,'verified_javascript_proof');
const neutrals={contradiction:0.001,neutral:0.998,entailment:0.001};
const diag=[];
const tentAnalysis=await analyseArguments(tentativeSource,async()=>neutrals,
 {onDiagnostic:value=>diag.push(value)});
assert.equal(diag.length,1);
assert.deepEqual(argumentFindings(tentAnalysis),[],
 'Qualified, unproved suggestions should not turn into red errors');
console.log('Typed argument graph / score correction / tentative extraction integration passed.');
