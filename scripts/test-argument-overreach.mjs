import assert from "node:assert/strict";
import { observableOverreach } from "../extension/src/argument-overreach.mjs";
import { combineArgumentEvidence, analyseArguments, argumentFindings }
 from "../extension/src/argument-analysis.mjs";

// New, fictional, individually authored contrasts. No old benchmark text.
const positives=[
 ["limited-sample","Two streetlights on the promenade were repaired.","Every streetlight in the city is working."],
 ["vague-same-population","Several visitors praised the new exhibit.","Every visitor praised the new exhibit."],
 ["limited-events","A single resident complained about noise.","Every house on the street is unbearable."],
 ["day-to-never","My coach arrived on time on Tuesday.","This operator never runs late."],
 ["snapshot-to-permanence","The camera showed no parked cars at 5 a.m.","The borough has permanently eliminated traffic."],
 ["small-sample-total","Inspectors sampled five lunches and found no contamination.","Every lunch in the district is safe."],
 ["one-route-all","The city upgraded one bus route.","All public transport in the county is accessible."],
 ["usage-to-safety","The app received two hundred downloads.","The app has no security risks."],
 ["shares-to-ranking","The restaurant video has millions of shares.","It is the most popular business in the country."],
 ["votes-to-certain-victory","The candidate gained several thousand new followers.","The candidate is certain to win the election."],
 ["reviews-to-safety","The equipment received five-star customer reviews.","It is the safest equipment in the world."],
 ["plan-to-outcome","The office published a strategy for cutting heating costs.","All heating costs have been eliminated."],
 ["forecast-to-guarantee","The organiser released a forecast for next weekend.","The outdoor performance cannot possibly be cancelled."],
 ["marketing-to-reality","The supplier used the words sustainable in its advert.","Every delivery has no environmental impact."],
 ["opening-match","Our club won the first match.","Our club will win the championship in May.","that guarantees"],
 ["one-test-to-everywhere","One water tap passed the safety test.","Every tap throughout the city must be safe."],
 ["first-trial-to-future","The clinic succeeded in the first trial.","It will succeed in all future trials.","that guarantees"],
 ["one-complaint-to-whole","Three users complained about the portal.","All users of the portal have been misled."],
 ["single-success-to-zero","One cycle track was upgraded.","Deaths across the whole city will fall to zero."]
];
const negatives=[
 ["universal-premise","Every resident in this area passed inspection.","Every resident passed inspection."],
 ["incidental-options","The testing team evaluated the device. It considered several options.","The design is safe for all uses."],
 ["vague-unrelated","Some staff visited the building.","All public transport in the region is accessible."],
 ["all-records","All of the reported company complaints were resolved.","All reported company complaints have been resolved."],
 ["just-two-only-two","Only two printers exist in this office. Both passed inspection.","Every printer in this office was inspected successfully."],
 ["only-gateway","The sole gateway serving the office is down.","All office requests will fail."],
 ["conditional","If a user is subscribed, every message is encrypted. Mira is subscribed.","Every message to Mira is encrypted."],
 ["normative","Two residents expressed concern about the road.","The council might consider a review."],
 ["qualified","Three visitors complained about the new timetable.","Every visitor could eventually complain."],
 ["hedged-generalisation","A few residents spoke to reporters.","The whole community might oppose the proposal."],
 ["sample-limited-conclusion","Two lights were tested successfully.","All of those two lights worked."],
 ["explicit-finite","Some customers selected this route.","Every surveyed customer selected this route."],
 ["reported-certification","The equipment has five-star reviews and was independently tested and certified as safe.","The equipment is the safest on the certified shortlist."],
 ["official-ranking","The channel received a thousand views and a certified nationwide ranking.","It is the most popular channel in that nationwide ranking."],
 ["plan-still-proposal","The organisation published a plan to reduce waste.","The organisation hopes waste will be reduced."],
 ["plan-existence","The council published a transport strategy.","A transport strategy was published."],
 ["conditional-plan","If every emission is stopped, pollution will be zero.","Every emission will be stopped."],
 ["quote-to-quote","The analyst quoted the words carbon neutral from the presentation.","Those words appeared in the presentation."],
 ["label-not-outcome","The provider used the words eco friendly in the advert.","The provider's advert included those words."],
 ["single-observed-result","Three students won awards.","Those three students won awards."],
 ["no-claim-connection","The train ran on Monday.","The train was scheduled for Monday."],
 ["date-is-not-modal","The match was cancelled in May.","The match will be cancelled in May."],
 ["may-actually-modal","A candidate gained a thousand followers.","The candidate may win the election."],
 ["two-different-sets","Two buildings were closed during renovations.","Only those buildings were closed."],
 ["universally-scoped-not-sample","The survey covered every household in the district.","Every household in the district was surveyed."],
 ["stated-policy","The membership rules say all registered members can enter.","Every registered member can enter."],
 ["two-and-known-only","There are only two committees, and both unanimously agreed.","Every committee agreed."],
 ["measure-not-guarantee","The post gathered five thousand likes.","The post received some online engagement."],
 ["supported-benefit","The operator guarantees every registered user a free account.","All registered users can have a free account."],
 ["first-match-modest","The club won the first match of the season.","The club has at least one win on its record."],
 ["one-game-hedge","The team won its opening game.","The team might win the title.","that guarantees"],
 ["label-with-caveat","The advert used the words carbon neutral.","The advert contains those words."],
 ["proxy-proportional","The site received ten downloads.","It was downloaded at least once."],
 ["same-scope","Three respondents expressed support.","Each of those three respondents expressed support."]
];
for(const [id,p,c,marker] of positives) {
 const result=observableOverreach(p,c,{inferenceMarker:marker||""});
 assert.equal(result?.label,"unsupported_conclusion",id+" should demonstrate a narrow scope leap");
 assert.ok(result.reason,id+" has an explicit mechanism");
}
for(const [id,p,c,marker] of negatives)
 assert.equal(observableOverreach(p,c,{inferenceMarker:marker||""}),null,
  id+" should abstain rather than accuse");
const ordinary={contradiction:.001,neutral:.997,entailment:.002};
const example=positives[0];
const finding=combineArgumentEvidence([{kind:"combined",text:example[1],forward:ordinary}],example[2]);
assert.equal(finding?.label,"unsupported_conclusion");
assert.equal(finding?.status,"verified_scope_overreach");
const noFinding=combineArgumentEvidence([{kind:"combined",text:negatives[0][1],forward:ordinary}],negatives[0][2]);
assert.equal(noFinding?.label??null,null,"Do not turn a model-neutral score into a red flag");
const scans=await analyseArguments(
 "Two streetlights along the waterfront were repaired. Therefore every streetlight across the city is working.",
 async()=>ordinary);
assert.equal(scans.length,1);
assert.equal(scans[0].label,"unsupported_conclusion");
const red=argumentFindings(scans);
assert.equal(red.length,1);
assert.equal(red[0].otherText.startsWith("Two streetlights"),true);
assert.ok(red[0].end>red[0].start,"Maintain the literal source conclusion offsets");
console.log("Conservative overreach tests:",positives.length,
 "fictional positives,",negatives.length,"hard negatives and original source offsets passed.");
