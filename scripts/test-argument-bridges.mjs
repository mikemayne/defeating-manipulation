import assert from 'node:assert/strict';
import {inferReasoningBridge} from '../extension/src/argument-bridges.mjs';
import {combineArgumentEvidence,analyseArguments,argumentFindings} from '../extension/src/argument-analysis.mjs';

// Independent fictional cases, not copies of the private 100-row benchmark.
const positives=[
 ['closed-office','The operator confirmed that its North Street office has permanently closed and will not reopen.','Visitors cannot enter at that office tomorrow.'],
 ['closed-library','The council says its East Lane library has permanently closed and will not reopen.','Members cannot visit at that library next week.'],
 ['sold-out-show','The theatre says all seats for the late screening have sold, and no extra seats will be released.','No tickets remain for that screening.'],
 ['sold-out-venue','Every seat for the evening screening has sold. No extra seats will be released.','No tickets remain for that screening.'],
 ['weekend-fee','The council has abolished Saturday parking fees from every public-run car park. Willow Car Park is public-run.','Parking there on Saturdays is free under the new policy.'],
 ['tuesday-fee','The council has removed Tuesday parking charges from all municipal car parks. Willow Car Park is municipal.','Parking there on Tuesday is free under that policy.'],
 ['entry-waiver','The centre waived entry fees for all registered members.','Entry is free for all registered members.'],
 ['admission-waiver','The museum abolished admission charges for every visitor.','Admission is free for every visitor.'],
 ['new-subscriber-only','The provider limits the offer to new subscribers. Nora has been subscribed for four years.','The offer does not apply to her.'],
 ['new-member-only','The institute restricts the discount to new members. Nora has been a member for two years.','The discount does not apply to Nora.'],
 ['deadline-following-monday','Every application submitted after Friday incurs a late penalty. A resident submitted hers on the following Monday.','Her application falls under that late-penalty rule.'],
 ['deadline-next-saturday','Every renewal submitted after Friday attracts a late fee. A resident submitted his on the following Saturday.','His renewal falls under that late-fee rule.']
];
const negatives=[
 ['different-library','The council confirmed its East Lane library has permanently closed and will not reopen.','Members cannot visit at that gym next week.'],
 ['temporary-closure','The council confirmed its East Lane library temporarily closed yesterday.','Members cannot visit at that library next week.'],
 ['will-reopen','The library closed, but will reopen tomorrow.','Visitors cannot enter at that library tomorrow.'],
 ['closure-not-asserted','The council denied that its East Lane library has permanently closed and will not reopen.','Visitors cannot enter at that library tomorrow.'],
 ['multiple-branches','Its West branch has permanently closed and will not reopen. Another branch still operates.','Visitors cannot enter at that branch tomorrow.'],
 ['online-closure','Its West branch has permanently closed and will not reopen.','Customers cannot shop online tomorrow.'],
 ['resale','All seats for the afternoon screening have sold, and no extra seats will be released. Resale is available.','No tickets remain for that screening.'],
 ['sold-other-screening','All seats for the evening screening have sold, and no extra seats will be released.','No tickets remain for that afternoon screening.'],
 ['not-sold','Not all seats for the evening screening have sold, and no extra seats will be released.','No tickets remain for that screening.'],
 ['extra-release','All seats for the evening screening have sold, but extra seats will be released.','No tickets remain for that screening.'],
 ['no-membership','The council removed Saturday parking fees from every public-run car park.','Parking there on Saturdays is free under the new policy.'],
 ['wrong-day','The council removed Saturday parking fees from every public-run car park. Willow Car Park is public-run.','Parking there on Sundays is free under the new policy.'],
 ['wrong-qualifier','The council removed Saturday parking fees from every municipal car park. Willow Car Park is privately run.','Parking there on Saturdays is free under the new policy.'],
 ['fee-one-off','The institute temporarily waived entry fees for all registered members.','Entry is free for all registered members.'],
 ['fee-exception','The institute waived entry fees for all registered members except visitors.','Entry is free for all registered members.'],
 ['fee-changed-concept','The centre waived entry fees for every student.','Delivery is free for every student.'],
 ['fee-other-group','The centre waived entry fees for every student.','Entry is free for every employee.'],
 ['fee-nonuniversal','The centre waived entry fees for some students.','Entry is free for every student.'],
 ['fee-not-removed','The centre has not waived entry fees for all members.','Entry is free for all members.'],
 ['not-new-does-not-imply-old','The provider restricts the offer to new subscribers. Nora subscribed yesterday.','The offer does not apply to Nora.'],
 ['only-does-not-prove-eligible','The provider restricts the offer to new subscribers. Nora subscribed today.','The offer applies to Nora.'],
 ['years-without-group','The provider restricts the offer to new subscribers. Nora has been employed for six years.','The offer does not apply to Nora.'],
 ['different-benefit','The provider restricts the offer to new subscribers. Nora has been subscribed for three years.','The refund does not apply to Nora.'],
 ['qualified-offer','The provider limits the offer to new members. Nora has been a member for three years.','The offer might not apply to Nora.'],
 ['ambiguous-friday','Every renewal submitted after Friday attracts a late fee. A resident submitted hers on Monday.','Her renewal falls under that late-fee rule.'],
 ['before-friday','Every renewal submitted after Friday attracts a late fee. A resident submitted hers on the preceding Monday.','Her renewal falls under that late-fee rule.'],
 ['wrong-category','Every renewal submitted after Friday attracts a late fee. A resident submitted hers on the following Monday.','Her application falls under that late-fee rule.'],
 ['different-week','Every renewal submitted after Friday attracts a late fee. A resident submitted hers on Monday of that week.','Her renewal falls under that late-fee rule.'],
 ['quoted','The centre waived entry fees for all "members".','Entry is free for every member.'],
 ['uncertain','The centre may have waived entry fees for every member.','Entry is free for every member.'],
 ['two-car-parks','The council removed Sunday parking charges from every municipal car park. East Car Park is municipal. Another car park is private.','Parking there on Sundays is free under the new policy.'],
 ['no-proof-pronoun','The centre removed entry fees for every member. Nora visited yesterday.','She is invited to return.'],
 ['scope-not-guaranteed','The retailer opened a second store.','Its profits must have doubled.'],
 ['scope-not-guaranteed-2','The town added a playground.','Every family will move there.'],
 ['model-should-abstain','Some students liked the new service.','The council is financially solvent.']
];
for(const [id,p,c] of positives){
 const got=inferReasoningBridge(p,c);
 assert.equal(got?.label,'supported_conclusion',id+': '+JSON.stringify(got));
 assert.ok(got.chain.length>=2,id+' has a verifiable chain');
}
for(const [id,p,c] of negatives)
 assert.equal(inferReasoningBridge(p,c),null,id+' must abstain');
// Keep neural model fixed. A verified relation can recover from a mistaken
// NLI contradiction, and a neutral NLI result alone remains an abstention.
const incorrectNli={contradiction:.995,neutral:.004,entailment:.001};
const example=positives[0];
const recovered=combineArgumentEvidence([{
 kind:'combined',text:example[1],forward:incorrectNli,reverse:incorrectNli
}],example[2]);
assert.equal(recovered?.label,'supported_conclusion');
assert.equal(recovered?.status,'verified_reasoning_bridge');
const neutralNli={contradiction:.001,neutral:.998,entailment:.001};
const absent=combineArgumentEvidence([{kind:'combined',text:negatives[32][1],forward:neutralNli}],negatives[32][2]);
assert.equal(absent?.label??null,null,'No bridge means no invented red flag');
const source='The centre waived entry fees for every student. Therefore entry is free for every student.';
const parsed=[];
const findings=await analyseArguments(source,async (p,c)=>{
 parsed.push([p,c]);return neutralNli;
});
assert.equal(findings.length,1);
assert.equal(findings[0].label,'supported_conclusion');
assert.deepEqual(argumentFindings(findings),[], 'Supported relations never get red underlines');
assert.equal(source.slice(findings[0].conclusion.start,findings[0].conclusion.end),findings[0].conclusion.text);
assert.ok(parsed.length>=1);
console.log('Reasoning bridges:',positives.length,'independent positives,',negatives.length,
 'hard negatives, source offsets and conservative NLI integration passed.');