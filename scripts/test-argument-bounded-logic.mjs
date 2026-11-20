import assert from 'node:assert/strict';
import {boundedArgumentLogic} from '../extension/src/argument-bounded-logic.mjs';
import {combineArgumentEvidence,argumentFindings} from '../extension/src/argument-analysis.mjs';
const controls=[
 ['voters-count-ok','The official tally recorded 630 votes for the measure and 410 against it.','The measure received more votes for than against.','supported_conclusion'],
 ['voters-count-reversed','The official tally recorded 630 votes for the measure and 410 against it.','More voters said yes than no.',null],
 ['voters-count-opposite','The official tally recorded 230 votes for the measure and 410 against it.','The measure received more votes for than against.','contradictory_claims'],
 ['feedback-support','A feedback table lists 180 satisfied responses and 75 dissatisfied responses.','Satisfied responses outnumber dissatisfied ones in that table.','supported_conclusion'],
 ['feedback-opposite','A feedback table lists 75 satisfied responses and 180 dissatisfied responses.','Satisfied responses outnumber dissatisfied ones in that table.','contradictory_claims'],
 ['candidate-support','The result lists Candidate A 51% of the vote and Candidate B 49% of the vote.','Candidate A received a larger share than Candidate B.','supported_conclusion'],
 ['candidate-opposite','The result lists Candidate A 21% of the vote and Candidate B 79% of the vote.','Candidate A received a larger share than Candidate B.','contradictory_claims'],
 ['candidate-different','The result lists Candidate A 51% and Candidate B 49%.','Candidate A received a larger share than Candidate C.',null],
 ['all-votes-none-opposite','All city delegates voted against the motion.','None of the city delegates voted for that motion.','supported_conclusion'],
 ['all-votes-one-opposite','All city delegates voted yes in the count.','At least one of those city delegates voted no.','contradictory_claims'],
 ['all-votes-none-same','All city delegates voted no in the count.','None of the city delegates voted no in that count.',null],
 ['different-group','All school delegates voted against the proposal.','At least one of the city councillors voted for the proposal.',null],
 ['hedged-vote','All delegates voted yes.','At least one delegate might have voted no.',null],
 ['excluded-fee','The insurance policy explicitly excludes luggage.','Luggage claims are not covered under this insurance policy.','supported_conclusion'],
 ['excluded-distinct','The insurance policy explicitly excludes luggage.','Phone claims are not covered under this insurance policy.',null],
 ['excluded-coverage-opposite','The insurance policy excludes luggage.','Luggage is covered by this insurance policy.',null],
 ['online','The club meeting will take place online only.','The meeting will have no in-person session.','supported_conclusion'],
 ['online-might','The club meeting will take place online only.','The meeting might have no in-person session.',null],
 ['online-without-topic','The company published the invoice online only.','The meeting will have no in-person session.',null],
 ['peanuts','The restaurant lists walnuts among the salad’s ingredients.','The salad cannot be described as walnut-free.',null],
 ['fully-unrelated','The council opened a new museum.','All public transport is free.',null],
 ['sample-overclaim','Two residents approved the plan.','Every resident approved the plan.',null],
 ['quote','The reviewer said "all delegates voted yes".','At least one of those delegates voted no.',null]
];
for(const [id,p,c,expected] of controls){
 const got=boundedArgumentLogic(p,c);
 assert.equal(got?.label??null,expected,`${id}: got ${JSON.stringify(got)}`);
}
console.log('Bounded arithmetic / quantifier / exclusion checks passed:',controls.length);
const adversarial=[
 ['candidate-not-same-person','The count lists Candidate A 49% and Candidate B 51%.','Candidate A received a larger share than Candidate C.'],
 ['candidate-not-comparable','Candidate A got 51 votes in 2025 and Candidate B received 48 votes in 2024.','Candidate A received a larger share than Candidate B.'],
 ['tentative-majority','The ballot recorded 210 votes for the measure and 190 against it.','More people might have voted for than against.'],
 ['vote-different-group','All school delegates voted yes on the motion.','At least one city councillor voted no on the motion.'],
 ['vote-different-motion','All delegates voted for the parks motion.','None of the delegates voted for the transport motion.'],
 ['votes-quote','The presenter quoted "all delegates voted yes".','At least one of the delegates voted no.'],
 ['online-unrelated','The town council meeting will happen online only.','The regional hospital meeting will have no in-person session.'],
 ['online-invoice','The shop released its invoice online only.','The meeting will have no in-person session.'],
 ['threshold-different-item','Free delivery requires a basket of at least £40. The first basket costs £15 and the second basket costs £60.','The second basket does not qualify for free delivery.'],
 ['threshold-equal','Free delivery applies only when a basket totals at least £40. This basket costs £40.','It does not qualify for free delivery.'],
 ['bag-height','The venue bans bags wider than 32 cm. This bag measures 48 cm tall.','The bag is too wide to enter.'],
 ['schedule-separate-day','No trains leave after 20:00 tonight.','The 21:00 train will depart tomorrow.'],
 ['expired-valid-earlier','This offer is valid only during July.','The same offer is valid during June.'],
 ['different-plan','The household insurance policy explicitly excludes luggage.','This separate travel insurance policy does not cover luggage.'],
 ['contents-not-negative','The restaurant lists sesame among the rice dish ingredients.','The rice dish might be sesame-free.']
];
for(const [id,p,c] of adversarial)
 assert.equal(boundedArgumentLogic(p,c),null,`Counterexample: ${id}`);
console.log('Adversarial hard negatives passed:',adversarial.length);

// Reproduce a small NLI model hallucination: explicit numerical order wins
// over the model saying entailment or contradiction with high confidence.
const erroneouslySupported={contradiction:.002,neutral:.001,entailment:.997};
const erroneouslyContradicted={contradiction:.995,neutral:.004,entailment:.001};
const opposites=combineArgumentEvidence([{
 kind:'combined',text:'The local ballot counted 240 votes for and 500 against.',
 forward:erroneouslySupported
}], 'The ballot received more votes for than against.');
assert.equal(opposites?.label,'contradictory_claims',
 'Explicit arithmetic must veto an incorrect model entailment');
const reported=combineArgumentEvidence([{
 kind:'combined',text:'The local ballot counted 500 votes for and 240 against.',
 forward:erroneouslyContradicted, reverse:erroneouslyContradicted
}], 'The ballot received more votes for than against.');
assert.equal(reported?.label,'supported_conclusion',
 'Explicit arithmetic may restore support lost to incorrect model contradiction');
assert.deepEqual(argumentFindings([{
 ...reported, premise:'The local ballot counted 500 votes for and 240 against.',
 conclusion:{start:5,end:24},explanation:'The counts establish the comparison.'
}]),[], 'Supported conclusion must never be underlined red');
const overlap=combineArgumentEvidence([{
 kind:'combined',text:'The committee met on Friday and discussed transport.',
 forward:{contradiction:.001,neutral:.997,entailment:.002}
}], 'The town will definitely win an award.');
assert.equal(overlap?.label??null,null,'Unrelated claims still abstain');
console.log('Bounded logic and NLI priority controls passed.');