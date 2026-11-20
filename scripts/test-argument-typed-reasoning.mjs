import assert from 'node:assert/strict';
import {inferQuantifierRelation,extractQuantifiedPropositions} from './argument-quantifiers.mjs';
import {inferTypedNumericRelation,extractTypedNumericalFacts} from './argument-numeric-relations.mjs';

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
