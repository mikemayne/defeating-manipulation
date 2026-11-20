import assert from 'node:assert/strict';
import {inferExplicitProofObligationGap as gap} from '../extension/src/argument-proof-obligations.mjs';
// Cases were created independently of the exposed 200-case diagnostic set.
const positives=[
 ['A theatre bought a new curtain.','Therefore all future performances are guaranteed to sell out.'],
 ['The club installed a new turnstile.','That means every supporter will be completely satisfied.'],
 ['An independent bookshop redesigned its logo.','Therefore every book it stocks is historically accurate.'],
 ['The council added one new footpath.','This proves every resident will have full access throughout the year.'],
 ['A mobile developer launched a new splash screen.','Therefore all customer data is now secure forever.'],
 ['The store held a cheerful opening event.','Consequently every future delivery is guaranteed to arrive early.'],
 ['A village choir posted a popular video.','That proves it is the most trusted musical institution in Europe.'],
 ['A sports club introduced a new membership card.','This means it is the most successful team in the region.'],
 ['The office commissioned a feasibility study of the refurbishment.','Therefore all the proposed facilities are already built and open to the public.'],
 ['The transit department published a plan for a new station.','As a result the entire station is now operational.'],
 ['A retailer installed additional signs at the depot.','Therefore fuel consumption must fall by exactly 35 percent.'],
 ['The city installed three extra water fountains.','Consequently the temperature will drop by exactly five degrees.'],
 ['The club ordered new uniforms for its players.','It will never suffer another injury.'],
 ['The committee bought a new microphone.','That means every future decision will be fair.'],
];
for(const [p,c] of positives){const v=gap(p,c,{inferenceMarker:'therefore'});assert.equal(v?.label,'unsupported_conclusion',`Missing obligation: ${p} => ${c}`);assert.ok(v.obligation);}
const negatives=[
 ['All printed tickets were checked.','Therefore every printed ticket has been checked.'],
 ['If a server loses power, every connected session ends. The server lost power.','Therefore every connected session ended.'],
 ['All five visits were recorded in the register.','Therefore all visits were recorded.'],
 ['The audit measured the system as free from known risks.','Therefore the system has no known risks under that audit.'],
 ['The independent study measured a 10 percent change in energy use.','Therefore energy use changed by exactly 10 percent under that measurement.'],
 ['The weather improved yesterday.','Therefore the weather could be better tomorrow.'],
 ['The city bought new buses.','The council may increase journey frequency.'],
 ['The company announced a draft plan.','Therefore the project could open eventually.'],
 ['If all the conditions are met, nobody pays a fee. All conditions are met.','Therefore nobody pays a fee.'],
 ['The department removed all posted fees for this service.','Therefore nobody pays a fee for this service.'],
 ['Every household has received the newsletter.','Therefore all households have received the newsletter.'],
 ['The office bought a new desk.','Therefore a desk has been purchased.'],
 ['A stadium installed new turnstiles.','Therefore the new turnstiles have been installed.'],
 ['The library published a timetable for classes.','Therefore it now has a published timetable.'],
 ['The weather station reported an exact temperature of 5 degrees.','Therefore the station recorded exactly 5 degrees.'],
 ['The engineer bought new equipment.','This may improve accuracy next year.'],
 ['A new hire joined the team.','This suggests everyone could benefit.'],
 ['The author says the report is the most accurate ever.','Therefore the author claims the report is the most accurate ever.'],
 ['The study included all the district residents and measured satisfaction.','Therefore all those residents were included in the study.'],
 ['All the event tickets were issued.','Therefore the event tickets were all issued.'],
 ['The company created a complete financial report for the period.','Therefore the report is complete.'],
 ['The developer installed the security patch and verified it against the published vulnerabilities.','Therefore the published vulnerabilities were checked.'],
 ['The report contains a national ranking after a representative survey.','Therefore this was the most popular choice in the survey.'],
 ['The centre implemented the construction plan and opened all rooms.','Therefore every planned room is now open.'],
 ['The report accurately documented the rainfall.','Therefore the report contains rainfall measurements.'],
 ['The school replaced a classroom projector.','Therefore the projector was replaced.'],
 ['The engineer submitted the results.','Therefore the results were submitted.'],
 ['A club installed a projector.','Therefore a projector is now installed.'],
 ['The sponsor provided enough money to complete all planned improvements.','Therefore the planned improvements might be completed.'],
 ['The office received a new PC.','Therefore it received new equipment.'],
 ['All five engines passed the inspection.','Therefore all five passed the inspection.'],
 ['The publisher made a new title available.','The title is available.'],
];
for(const [p,c] of negatives)assert.equal(gap(p,c,{inferenceMarker:'therefore'}),null,`False evidence gap: ${p} => ${c}`);
assert.equal(gap('A bakery replaced a poster.','Every visitor will now be delighted.'),null,'No inference marker: do not infer a claim of logical entailment');
console.log(`Proof obligations: ${positives.length} verified asymmetry cases; ${negatives.length} adversarial abstentions passed.`);

// End-to-end: a missing proof alone stays diagnostic-only, but an explicit
// finite-to-absolute claim-strength mismatch is a justified supplied-evidence gap.
const {combineArgumentEvidence,analyseArguments,argumentFindings}
 = await import('../extension/src/argument-analysis.mjs');
const neutral={contradiction:0.001,neutral:0.998,entailment:0.001};
const p='A theatre bought a new curtain.';
const c='All future performances are guaranteed to sell out.';
const result=combineArgumentEvidence([{kind:'combined',text:p,forward:neutral}],c,{inferenceMarker:'therefore'});
assert.equal(result?.label,'unsupported_conclusion');
assert.ok(['verified_evidence_type_mismatch','verified_scope_overreach'].includes(result?.status));
const uncertain=await analyseArguments(
 'The town replaced a broken streetlamp. Therefore traffic might be safer tonight.',
 async()=>neutral);
assert.deepEqual(argumentFindings(uncertain),[],'A tentative effect does not turn red');
const captured=[];
const overclaim=await analyseArguments(
 'The district installed a new touchscreen. Therefore every resident will now understand every policy.',
 async()=>neutral,{onDiagnostic:row=>captured.push(row)});
assert.equal(captured.length,1);
assert.equal(captured[0].proofObligation?.reason,'finite_event_to_absolute_outcome');
assert.equal(overclaim[0]?.label,'unsupported_conclusion');
console.log('Proof obligation integration, no-red hedged outcome and benchmark diagnostics passed.');
