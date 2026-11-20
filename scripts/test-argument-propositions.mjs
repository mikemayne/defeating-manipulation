import assert from 'node:assert/strict';
import {structurePropositions,inferPropositionRelation} from '../extension/src/argument-propositions.mjs';
import {combineArgumentEvidence,analyseArguments,argumentFindings} from '../extension/src/argument-analysis.mjs';

// Fresh fictional examples, independently distinct from the private 100-case
// development benchmark. Exact source offsets are never touched.
const positive=[
 ['all-volunteers','Every volunteer is invited to lunch. Mira is a volunteer.','Mira was invited to lunch.','supported_conclusion'],
 ['all-technicians','All field technicians are invited to the workshop. Nora is a field technician.','She was invited to the workshop.','supported_conclusion'],
 ['all-docents','Each museum docent can enter the archive. Maya is a museum docent.','Maya can enter the archive.','supported_conclusion'],
 ['rule-badge','The workplace rules require every certified visitor to wear a visible badge. This visitor is certified and has no such badge.','It fails that specific badge requirement.','supported_conclusion'],
 ['rule-label','The local rules require every promoted article to display an advert label. This article is promoted and has no such label.','It fails the disclosure requirement.','supported_conclusion'],
 ['rule-direct','Every certified worker must carry a safety badge. This worker is certified and has no such badge.','It fails that specific safety requirement.','supported_conclusion'],
 ['ingredient-almond','The label lists almonds among the biscuit’s ingredients.','The biscuit cannot be described as almond-free.','supported_conclusion'],
 ['ingredient-hazelnut','The description lists hazelnuts among the pastry’s ingredients.','The pastry is hazelnut-free.','contradictory_claims'],
 ['contains-sesame','The salad contains sesame.','The salad is sesame-free.','contradictory_claims'],
 ['cash-payment','The kiosk says customers can pay with cash during business hours.','Cash payment is not accepted during those hours.','contradictory_claims'],
 ['debit-card','The kiosk says customers can pay by debit card during opening hours.','Debit card payment is not accepted during those hours.','contradictory_claims'],
 ['credit-card-supported','The kiosk says visitors can pay by credit card during opening hours.','Credit card payment is accepted during those hours.','supported_conclusion'],
 ['post-unrestored','The administrator confirms the post was removed yesterday and has not been restored.','The same post is publicly visible on that account today.','contradictory_claims'],
 ['survey-zero','The survey breakdown records zero participants under the age of seventeen.','Hundreds of teenagers under seventeen participated in that survey.','contradictory_claims'],
 ['survey-zero-2','The local survey recorded zero respondents under the age of twelve.','Two schoolchildren under twelve participated in that survey.','contradictory_claims'],
 ['age-free','The train notice says children under 11 ride free. My niece is eight.','The ticket fare for her is zero.','supported_conclusion'],
 ['age-free-2','The coach notice says passengers under 6 travel free. My child is four.','The ticket fare for him is zero.','supported_conclusion']
];
const negatives=[
 ['different-membership','All graduates are invited to the event. Mira is a technician.','Mira was invited to the event.'],
 ['not-explicit-member','All graduates on the register are invited. Maya is on the register.','Maya was invited.'],
 ['different-predicate','All graduates can enter the exhibition. Maya is a graduate.','Maya was paid for the exhibition.'],
 ['named-other-person','All visitors are invited to lunch. Maya is a visitor. Nora attended.','She was invited to lunch.'],
 ['not-invited','All visitors are invited to lunch. Maya is a visitor.','Maya was not invited to lunch.'],
 ['rule-hedged','All graduates are invited to lunch. Mira is a graduate.','Mira might be invited to lunch.'],
 ['rule-quoted','"Every visitor is admitted." Maya is a visitor.','Maya was admitted.'],
 ['rule-different-class','The workplace rules require every certified visitor to wear a badge. This visitor is temporary and has no such badge.','It fails that badge requirement.'],
 ['rule-different-thing','The workplace rules require every certified visitor to wear a badge. This visitor is certified and has no wristband.','It fails that badge requirement.'],
 ['rule-has-badge','The workplace rules require every certified visitor to wear a badge. This visitor is certified and has a badge.','It fails that badge requirement.'],
 ['rule-negated-requirement','The workplace rules do not require every certified visitor to wear a badge. This visitor is certified and has no such badge.','It fails that badge requirement.'],
 ['rule-two-requirements','The workplace rules require every certified visitor to wear a badge. The workplace rules require every certified visitor to carry a pass. This visitor is certified and has no such badge.','It fails a requirement.'],
 ['material-absent','The label does not list almonds among the biscuit’s ingredients.','The biscuit is almond-free.'],
 ['material-different-item','The label lists almonds among the biscuit’s ingredients.','The cake is almond-free.'],
 ['material-different-material','The label lists almonds among the biscuit’s ingredients.','The biscuit is cashew-free.'],
 ['material-potential','The label lists almonds among the biscuit’s ingredients.','The biscuit may be almond-free.'],
 ['material-except','The label lists almonds among the biscuit’s ingredients, except for the special batch.','The special batch is almond-free.'],
 ['payment-different','The kiosk says customers can pay with cash during opening hours.','Credit card payment is not accepted during those hours.'],
 ['payment-different-hours','The kiosk says customers can pay with cash during opening hours.','Cash payment is not accepted during late-night hours.'],
 ['payment-except','The kiosk says visitors can pay with cash during opening hours, but not on Sunday.','Cash payment is not accepted during those hours.'],
 ['payment-different-place','The kiosk says customers can pay with cash during opening hours.','Cash payment is not accepted during opening hours at the other kiosk.'],
 ['deleted-but-restored','The administrator says the post was deleted yesterday and has been restored.','The same post is publicly visible on that account today.'],
 ['different-post','The administrator says the post was deleted yesterday and has not been restored.','The other post is publicly visible on that account today.'],
 ['no-persistence','The administrator says the post was deleted yesterday.','The same post is publicly visible on that account today.'],
 ['different-survey','The survey breakdown shows zero respondents under the age of seventeen.','Three teenagers under seventeen participated in that other survey.'],
 ['different-age','The survey breakdown shows zero respondents under the age of seventeen.','Three teenagers under fifteen participated in that survey.'],
 ['same-zero','The survey breakdown shows zero respondents under the age of seventeen.','Zero teenagers under seventeen participated in that survey.'],
 ['age-at-limit','The coach notice says children under 11 ride free. My nephew is eleven.','The ticket fare for him is zero.'],
 ['age-above-limit','The coach notice says children under 11 ride free. My nephew is twelve.','The ticket fare for him is zero.'],
 ['age-other-person','The coach notice says children under 11 ride free. My nephew is ten.','The ticket fare for a different child is zero.'],
 ['age-qualified','The coach notice says children under 11 ride free. My nephew is ten.','The ticket fare for him may be zero.'],
 ['no-rule','A volunteer approached the venue and signed in.','Everyone was invited.'],
 ['no-rule-2','A marketing firm praised the new display.','All safety tests were passed.'],
 ['unrelated-claim','The town introduced new cycle lanes.','Every vehicle is exempt from tax.'],
 ['empty-premise','','Every visitor is invited.'],
 ['no-claim','All applicants are eligible. Maya is an applicant.',''],
 ['statement-no-universal','Several volunteers were invited to lunch. Maya is a volunteer.','Maya was invited to lunch.']
];
for(const [id,p,c,expected] of positive){
 const structured=structurePropositions(p,c);
 assert.equal(structured.relation?.label,expected,`positive ${id}: ${JSON.stringify(structured)}`);
 assert.ok(structured.premises.length,`${id} exposed its parsed premise facts`);
 assert.ok(structured.relation.reason,`${id} includes an interpretable relationship`);
 assert.deepEqual(inferPropositionRelation(p,c),structured.relation,`${id} stable API`);
}
for(const [id,p,c] of negatives)
 assert.equal(inferPropositionRelation(p,c),null,`hard negative ${id} must abstain`);

// The new structured result is independent of NLI scores and does not alter
// the raw evidence or exact offsets used for highlighting.
const badNeural={contradiction:0.999,neutral:0.001,entailment:0};
const support=positive.find(row=>row[0]==='rule-badge');
const restored=combineArgumentEvidence([
 {kind:'combined',text:support[1],forward:badNeural,reverse:badNeural}
],support[2]);
assert.equal(restored?.label,'supported_conclusion','Verified obligation overrides model contradiction candidate');
assert.equal(restored?.status,'verified_proposition_relation');
const opposite=positive.find(row=>row[0]==='cash-payment');
const contradicted=combineArgumentEvidence([
 {kind:'combined',text:opposite[1],forward:{contradiction:0,neutral:0,entailment:1}}
],opposite[2]);
assert.equal(contradicted?.label,'contradictory_claims','Explicit permission conflict overrides model entailment');
assert.equal(contradicted?.status,'verified_proposition_relation');
const sample='All field technicians are invited to the workshop. Nora is a field technician, so Nora was invited to the workshop.';
const seen=[],diagnostics=[];
const analyses=await analyseArguments(sample,async(p,c)=>{
 seen.push({p,c});return {contradiction:0.01,neutral:0.98,entailment:0.01};
},{onDiagnostic:d=>diagnostics.push(d)});
assert.ok(seen.length>0,'The normal-size NLI scorer still runs');
assert.equal(analyses[0]?.label,'supported_conclusion','Universal application recovered during argument analysis');
assert.equal(argumentFindings(analyses).length,0,'Supported conclusions never receive red underlines');
assert.ok(diagnostics[0].propositionNormalization?.facts>0,'Diagnostics exposes normalized proposition count');
const contradiction='The shop says visitors can pay by debit card during opening hours. Therefore debit card payment is not accepted during those hours.';
const assessments=await analyseArguments(contradiction,async()=>({contradiction:0,neutral:1,entailment:0}));
assert.equal(assessments[0]?.label,'contradictory_claims');
const underline=argumentFindings(assessments);
assert.equal(underline.length,1);
assert.equal(contradiction.slice(underline[0].start,underline[0].end),assessments[0].conclusion.text,
 'Red underlines retain literal source offsets');
console.log(`Structured proposition inference: ${positive.length} fictional positives, ${negatives.length} hard negatives and source-offset/NLI integration passed.`);