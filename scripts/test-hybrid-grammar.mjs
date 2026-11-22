import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { findPriorActivities } from "../extension/src/hybrid-grammar.mjs";
import { analyzeHybrid } from "../extension/src/hybrid-detector.mjs";
import { compilePatternRules, matchText } from "../extension/src/matching-core.mjs";

const positives = [
 ["When did you stop checking the invoices?", "checking the invoices"],
 ["Why have the editors stopped publishing the figures?", "publishing the figures"],
 ["Rosa finally stopped sorting the parcels.", "sorting the parcels"],
 ["The company has stopped collecting the fees.", "collecting the fees"],
 ["It was late. Liam stopped reading the notice.", "reading the notice"],
 ["After a change of plan. They stopped printing the leaflets.", "printing the leaflets"],
 ["Why did Max stop answering the phone?", "answering the phone"],
 ["They have recently stopped opening the gates.", "opening the gates"],
 ["Why did we stop charging the batteries?", "charging the batteries"],
 ["You stopped checking the forms yesterday.", "checking the forms"],
 ["Why did they stop concealing the figures?", "concealing the figures"],
 ["When did the team stop reviewing the claims?", "reviewing the claims"]
];
const negatives = [
 "She stopped at the office to check the invoices.",
 "She stopped to check the invoices.",
 "The bus stop is closed.",
 "They stopped the meeting.",
 "If you stop checking the invoices, we need cover.",
 "They may stop checking the invoices.",
 "She did not stop checking the invoices.",
 "She never stopped checking the invoices.",
 "She denied that they stopped checking the invoices.",
 "She wrote, “When did you stop checking the invoices?”",
 "'When did you stop checking the invoices?'",
 "I wonder whether they stopped checking the invoices.",
 "Stop checking the invoices.",
 "Where did they stop to check the invoices?",
 "The council stopped illegal dumping.",
 "Did they stop checking the invoices?"
];

const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const catalogue = read("../extension/techniques.json");
const rules = compilePatternRules(catalogue, read("../extension/patterns.json"))
 .filter(rule => rule.technique.id === "presupposition");
let found = 0, existingFound = 0, existingFalsePositives = 0;
for (const [text, activity] of positives) {
 const result = await analyzeHybrid(text, { findPriorActivities });
 const evidence = result.scopes.flatMap(scope => scope.answers.prior_activity_assumed.evidence);
 if (evidence.length) found++;
 for (const item of evidence) {
  assert.equal(text.slice(item.start, item.end), item.quote);
  assert.equal(text.slice(item.activity.start, item.activity.end), activity);
 }
 if ((await matchText(text, { techniques: catalogue.techniques, rules })).length) existingFound++;
}
for (const text of negatives) {
 const result = await analyzeHybrid(text, { findPriorActivities });
 assert.ok(result.scopes.every(scope => scope.answers.prior_activity_assumed.answer === "unknown"), text);
 if ((await matchText(text, { techniques: catalogue.techniques, rules })).length) existingFalsePositives++;
}
assert.ok(found >= 10, "Catch varied stopping constructions");
const multi = await analyzeHybrid("A note.\n\nWhen did you stop\tchecking the invoices?", { findPriorActivities });
assert.equal(multi.scopes[1].answers.prior_activity_assumed.evidence[0].activity.quote, "checking the invoices");
assert.equal(multi.scopes[1].patterns.find(item => item.id === "presupposition").state, "supported");
assert.equal((await analyzeHybrid(positives[0][0])).scopes[0].answers.prior_activity_assumed.answer, "unknown");
console.log("Wink JavaScript:", found, "/", positives.length, "positives, 0 /", negatives.length, "false positives.");
console.log("Existing Firefox regex:", existingFound, "/", positives.length, "positives,", existingFalsePositives, "/", negatives.length, "false positives.");
