import assert from 'node:assert/strict';
import {parseNumber,arithmeticComparison,extractNumericalPropositions,inferNumericRelation}
 from '../extension/src/argument-numeric.mjs';
import {inspectArgumentProof} from '../extension/src/argument-proof-graph.mjs';

// Fresh, fictional controls: not copied from a benchmark, newspaper or article.
assert.equal(parseNumber('three hundred and two'),null,'Do not guess unsupported number grammar');
assert.equal(parseNumber('three hundred two'),302);
assert.equal(parseNumber('minus five'),-5);
assert.equal(parseNumber('1,250.50'),1250.5);
assert.equal(parseNumber('one thousand seven'),1007);
assert.equal(parseNumber('ten more or less'),null);
assert.equal(arithmeticComparison({value:4,unit:'kg'},{value:4,unit:'GBP'}),null);
assert.equal(arithmeticComparison({value:2,unit:'GBP'},{value:8,unit:'GBP'},'lt'),true);
assert.equal(arithmeticComparison({value:8,unit:'GBP'},{value:2,unit:'GBP'},'lt'),false);

const numericSupported=[
 ['identical-charge','The invoice shows a final charge of £27 for the delivery.',
  'The final charge for the delivery was £27.'],
 ['zero-fee','The contract fixes the monthly service fee at zero pounds for the first year.',
  'The monthly service fee in the first year was £0.'],
 ['exact-amount','The signed receipt records the total price as £107 for the single parcel.',
  'The total price for that parcel was £107.'],
 ['small-decimals','The sensor report shows the final pressure was 2.5 bar for chamber A.',
  'The final pressure for chamber A was 2.5 bar.'],
 ['total-add','The total service fee is £16 plus £7.',
  'The total service fee totals £23.'],
 ['two-routes','The harbour shuttle is 17 minutes while the airport shuttle is 30 minutes.',
  'The harbour shuttle is shorter than the airport shuttle.'],
 ['group-votes','The published tally records 38 votes for Alder and 21 for Birch.',
  'Alder received more votes than Birch.'],
 ['named-samples','The examiner recorded 1.2 milligrams in sample R and 3.7 in sample S.',
  "Sample S's reported reading is higher than sample R's."]
];
const numericContradicted=[
 ['charge-disagreement','The invoice shows a final charge of £27 for the delivery.',
  'The final charge for the delivery was £72.'],
 ['zero-fee-vs-paid','The contract fixes the monthly service fee at zero pounds for the first year.',
  'The monthly service fee in the first year was £26.'],
 ['decimal-conflict','The sensor report shows the final pressure was 2.5 bar for chamber A.',
  'The final pressure for chamber A was 5.2 bar.'],
 ['total-add-wrong','The total service fee is £16 plus £7.',
  'The total service fee totals £34.'],
 ['two-routes-reversed','The harbour shuttle is 17 minutes while the airport shuttle is 30 minutes.',
  'The harbour shuttle is longer than the airport shuttle.'],
 ['votes-reversed','The published tally records 38 votes for Alder and 21 for Birch.',
  'Birch received more votes than Alder.'],
 ['max-violation','The gauge report records a maximum pressure of 4.5 bar for chamber A.',
  'The pressure reached 5.5 bar in that same chamber A.'],
 ['min-violation','The gauge report records a minimum pressure of 4.5 bar for chamber A.',
  'The pressure reached 2.5 bar in that same chamber A.']
];
for(const [id,p,c] of numericSupported){
 const r=inferNumericRelation(p,c);
 assert.equal(r?.label,'supported_conclusion',id+': '+JSON.stringify(r));
 assert.ok(r?.verified && r?.chain?.length>=3,id+': explicit arithmetic proof');
}
for(const [id,p,c] of numericContradicted){
 const r=inferNumericRelation(p,c);
 assert.equal(r?.label,'contradictory_claims',id+': '+JSON.stringify(r));
 assert.ok(r?.verified && r?.chain?.length>=3,id+': explicit contradiction proof');
}
const numericHardNegatives=[
 ['different-currency','The invoice records a final charge of £20 for the delivery.','The final charge for the delivery was $20.'],
 ['different-year','The report shows 10 people last year.','The report shows 20 people this year.'],
 ['different-location','The report shows 10 people in Bristol.','The report shows 20 people in Exeter.'],
 ['two-purchases','The vendor recorded a final price of £12 for one item and a final price of £34 for another.','The final price for this order was £34.'],
 ['an-estimate','The report estimates an approximate cost of £20 for the event.','The final cost for the event was £25.'],
 ['different-property','The office recorded a heating cost of £20 for this month.','The office paid £25 for cleaning this month.'],
 ['hedged-conclusion','The invoice shows a final charge of £20 for the order.','The final charge might have been £30.'],
 ['quoted','The invoice says “final charge £20” for the event.','The final charge for the event was £30.'],
 ['minimum-compatible','The gauge report records a minimum pressure of 4.5 bar for chamber A.','The pressure reached 5.5 bar in that same chamber A.'],
 ['maximum-compatible','The gauge report records a maximum pressure of 4.5 bar for chamber A.','The pressure reached 3.5 bar in that same chamber A.'],
 ['unit-incompatible','The log recorded a length of 12 cm for the rod.','The length for the rod was 12 kg.'],
 ['non-numeric','The depot opened earlier than planned.','The depot is the most profitable in the region.'],
 ['calendar-date','The invoice is dated 19 April and the receipt refers to 27 April.','The final fee was £27.'],
 ['different-subject','The report says the eastern chamber held a pressure of 7 bar.','The pressure in the western chamber was 9 bar.'],
 ['more-than-not-equal','The report says the pressure was at least 7 bar.','The same pressure was 9 bar.'],
 ['indeterminate-division','The register lists nine people and six available chairs.','Every chair was occupied.'],
 ['separate-total','The report lists 7 receipts and 3 receipts for a separate account.','The business has 10 receipts total.'],
 ['duplicate-measures','The researcher measured 7 kg for the first bag and 2 kg for the second.','The bag weighed 9 kg in total.'],
 ['different-dates','The temperature was 17°C on Monday.','The temperature was 20°C on Thursday.'],
 ['different-subentity','The train recorded 3 passengers in carriage A.','The train recorded 4 passengers in carriage B.']
];
for(const [id,p,c] of numericHardNegatives)assert.equal(inferNumericRelation(p,c),null,id+': must abstain');
const span='The  receipt   lists the total charge as £74 for the package.';
const observed=extractNumericalPropositions(span);
assert.equal(observed.length,1);
assert.equal(span.slice(observed[0].start,observed[0].end),observed[0].source,
 'Numerical source offsets must match exact original characters');

const conditionalPositive=[
 ['one-step','If the badge is valid, entry is permitted. The badge is valid.','Entry is permitted.'],
 ['two-step','If the signal is green, the line opens. If the line opens, the operator can enter. The signal is green.',
  'The operator can enter.'],
 ['three-step','If the ticket is scanned, the gate unlocks. If the gate unlocks, the walkway opens. If the walkway opens, visitors can enter. The ticket is scanned.',
  'Visitors can enter.'],
 ['already-stated','The log is complete.','The log is complete.']
];
for(const [id,p,c] of conditionalPositive){const x=inspectArgumentProof(p,c);
 assert.equal(x.status,'proved',id+': '+JSON.stringify(x));
 assert.equal(x.verified?.label,'supported_conclusion',id);
 assert.ok(x.edges.length>=1,id);
}
const graphMissing=[
 ['missing-antecedent','If the badge is valid, entry is permitted.','Entry is permitted.','required_antecedent'],
 ['missing-second-hop','If the signal is green, the line opens. If the line opens, the operator can enter.','The operator can enter.','required_antecedent'],
 ['unsupported-causality','A florist changed its shopfront colour.','The florist doubled its revenue.','no_verified_derivation'],
 ['necessary-condition-only','The archive is available only if the register is signed.','The archive is available.','required_antecedent'],
 ['unrelated-premises','The train operator released a timetable.','The network has no safety risks.','no_verified_derivation']
];
for(const [id,p,c,kind] of graphMissing){const x=inspectArgumentProof(p,c);
 assert.equal(x.status,'undetermined',id);
 assert.equal(x.verified,null,id);
 assert.equal(x.missingLinks[0]?.type,kind,id);
 assert.equal(x.missingLinks[0]?.certainty,'unverified',id);
}
const graphHardNegatives=[
 ['different-premise','If the badge is valid, entry is permitted. The badge is invalid.','Entry is permitted.'],
 ['consequence-irrelevant','If the badge is valid, entry is permitted. The badge is valid.','Every visitor is guaranteed admission.'],
 ['different-subject','If the permit for room A is signed, it opens. The permit for room B is signed.','It opens.'],
 ['condition-in-quote','The sign reads “If the gate is open, entry is permitted.” The gate is open.','Entry is permitted.'],
 ['hedged-claim','If the gate is open, entry is permitted. The gate is open.','Entry might be permitted.'],
 ['fallacy-affirm-consequent','If the gate is open, entry is permitted. Entry is permitted.','The gate is open.'],
 ['fallacy-deny-antecedent','If the gate is open, entry is permitted. The gate is closed.','Entry is prohibited.'],
 ['necessary-affirm','The gate opens only if a supervisor is present. A supervisor is present.','The gate opens.'],
 ['separate-time','The gate opened yesterday.','The gate is open today.'],
 ['negation-not-claimed','If the gate is open, entry is permitted. The gate is closed.','Entry is not permitted.']
];
for(const [id,p,c] of graphHardNegatives){const x=inspectArgumentProof(p,c);
 assert.equal(x.verified,null,id+': '+JSON.stringify(x.verified));}
const graphContradiction=inspectArgumentProof(
 'If the gate is open, entry is permitted. The gate is open.', 'Entry is not permitted.');
assert.equal(graphContradiction.verified?.label,'contradictory_claims',
 'Verified conditional consequence can contradict its exact negation');
console.log(`Numerical JS + proposition graph: ${numericSupported.length} supported, ${numericContradicted.length} contradicted, ${numericHardNegatives.length} numeric hard negatives, ${conditionalPositive.length} graph proofs, ${graphMissing.length} missing-bridge diagnostics and ${graphHardNegatives.length} graph hard negatives passed.`);

// Integration: numeric proof must veto a confidently wrong NLI entailment,
// while a missing link cannot trigger a red warning from a neutral score.
const {combineArgumentEvidence,analyseArguments,argumentFindings} =
 await import('../extension/src/argument-analysis.mjs');
const incorrectNeuralSupport={contradiction:0.001,neutral:0.001,entailment:0.998};
const p='The receipt shows a final charge of £27 for the delivery.';
const c='The final charge for the delivery was £72.';
const corrected=combineArgumentEvidence([{
 kind:'combined',text:p,forward:incorrectNeuralSupport
}],c);
assert.equal(corrected?.label,'contradictory_claims',
 'JavaScript proof corrects the numerical claim even when NLI insists on support');
assert.equal(corrected?.status,'verified_javascript_proof');
const results=[];
const uncertain=await analyseArguments(
 'The florist changed its window display. Therefore the florist doubled its revenue.',
 async()=>({contradiction:0.001,neutral:0.998,entailment:0.001}),
 {onDiagnostic:x=>results.push(x)});
assert.equal(results.length,1);
assert.equal(results[0].proofGraph.status,'undetermined');
assert.ok(results[0].proofGraph.missingLinks.length);
assert.deepEqual(argumentFindings(uncertain),[],
 'Missing logical chain stays diagnostic; no unsupported red underline is inferred');
