import assert from 'node:assert/strict';
import {extractArguments, extractArgumentStatements} from '../extension/src/argument-clauses.mjs';

// Separate parser tests: no MNLI model, no constructed probability scores.
// These are independent fictional contrasts, not the held-out web corpus.
const positive = [
 ['because-first','Because the vendor provided two invalid certificates, the committee rejected the application.','rejected the application'],
 ['because-final','The committee rejected the application because the vendor provided two invalid certificates.','rejected the application'],
 ['therefore-middle','The warehouse counted only four working pumps, therefore the reported ten operational pumps cannot be correct.','reported ten operational pumps'],
 ['and-therefore','The team shuffled the deck and therefore changed the order of its cards.','changed the order'],
 ['therefore-first-with-because','Therefore, the balance cannot be zero because the entries do not sum to zero.','balance cannot be zero'],
 ['concluded','The inspection found no functioning alarms, so the team concluded the building was not ready.','building was not ready'],
 ['named-concluded','A majority of the stock was unavailable, the auditors concluded that the fulfilment rate was too low.','fulfilment rate was too low'],
 ['as-preface','However, as the published data excluded half the regions, we concluded it did not cover the whole country.','cover the whole country'],
 ['which-means','The meter was calibrated before the test, which means its measurements can be compared with the baseline.','measurements can be compared'],
 ['indicates-that','Samples from both laboratories showed the same increase, indicating that the increase might be systematic.','increase might be systematic'],
 ['result-participle','The company became the only supplier in the county, making it the sole local distributor of the product.','sole local distributor'],
 ['follow-up-reason','The design is, therefore, required for every engine. This is because it reduces the pressure fluctuations in the system.','required for every engine'],
 ['since-preface','Since both recorded timestamps precede delivery, the goods must have been dispatched earlier.','goods must have been dispatched earlier'],
 ['because-after-comma','The mountain is difficult to move, for example, because its mass is much greater than that of the ball.','mountain is difficult'],
 ['semicolon-then-marker','The delivery count was lower than the invoice; therefore, the stated quantity was incorrect.','stated quantity was incorrect'],
 ['named-domain','The page presented goods.example.org as independent when it was owned by the advertiser, we concluded it did not identify the commercial intent.','commercial intent']
];
for (const [id, source, expectedPart] of positive) {
 const candidates = extractArguments(source);
 assert.equal(candidates.length, 1, `${id}: one argument should be reconstructed`);
 const a = candidates[0];
 assert.ok(a.conclusion.text.includes(expectedPart), `${id}: conclusion is identified`);
 assert.equal(source.slice(a.conclusion.start,a.conclusion.end),a.conclusion.text,
  `${id}: conclusion uses exact original offset`);
 for (const premise of a.premises)
  assert.equal(source.slice(premise.start,premise.end),premise.text,
   `${id}: each premise uses exact original offsets`);
 assert.ok(a.conclusion.marker, `${id}: inference marker recorded`);
}
const negative = [
 'The report was published on Tuesday.',
 'The team collected data and produced a chart.',
 'An independent report found conditions generally safe.',
 'The report suggests that the programme is safe for all residents.',
 'The observer said that the collected evidence indicates that the bridge is open.',
 'The dataset, which means the collected information, is publicly available.',
 'Our team reviewed the budget, which means we should reconsider the total.',
 'The data were collected at multiple sites, which means we might need to revise the study.',
 'He said that the service closed because of staff leave.',
 'Because of the weather, the concert was cancelled.',
 'Since 2022, figures have increased steadily.',
 'The report states that collecting more observations might be useful.',
 'Strong and consistent evidence shows that the system is continuing to heat.',
 'Evidence from several regions shows that this trend may be accelerating.',
 'It is not correct therefore to suggest the timetable can be changed at any time.',
 'The LFS (and APS) can therefore be used to perform analyses.',
 'For those reasons, we concluded the ad was misleading.',
 'A summary of the results will be published tomorrow.',
 'A local business said that it was closed, but a visitor disagreed.',
 'The result was uncertain and the data were incomplete.'
];
for (const source of negative)
 assert.deepEqual(extractArguments(source),[],`No self-contained argument: ${source}`);
const decimalAndDomain='The inspector checked reports.example.org and measured 4.17 watts. Therefore, the earlier estimate was too high.';
assert.equal(extractArgumentStatements(decimalAndDomain).length,2,
 'Sentence segmentation must retain domain names and decimal values');
const capped=Array.from({length:20},(_,i)=>`A sample of ${i+30} units was collected because the available supply was limited.`).join(' ');
assert.ok(extractArguments(capped).length<=8,'Candidate count stays bounded');
console.log('Clause parser: 16 independent positive and 20 negative controls; original offsets and bounds passed.');