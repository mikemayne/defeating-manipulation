import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { analyzeHybrid } from "../extension/src/hybrid-detector.mjs";
import { findPriorActivities } from "../extension/src/hybrid-grammar.mjs";
import { compilePatternRules, matchText } from "../extension/src/matching-core.mjs";

const [samplePath, labelsPath] = process.argv.slice(2);
if (!samplePath || !labelsPath) throw Error("Pass the local sample and preregistered labels JSON paths.");
const bytes = readFileSync(samplePath);
const sample = JSON.parse(bytes);
const annotation = JSON.parse(readFileSync(labelsPath, "utf8"));
assert.equal(createHash("sha256").update(bytes).digest("hex"), annotation.sample_sha256);
assert.equal(new Set(sample.map(row => row.id)).size, sample.length);
assert.equal(Object.keys(annotation.labels).length, sample.length);
const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const catalogue = read("../extension/techniques.json");
const rules = compilePatternRules(catalogue, read("../extension/patterns.json"))
 .filter(rule => rule.technique.id === "presupposition");
const blank = () => ({
 cases: 0, goldYes: 0, goldNo: 0, goldUnknown: 0, truePositive: 0,
 falsePositive: 0, flaggedUnknown: 0, missedPositive: 0, exactActivity: 0, partialActivity: 0
});
const totals = {};
const diagnostics = [];
for (const row of sample) {
 const gold = annotation.labels[row.id];
 assert.ok(["yes", "no", "unknown"].includes(gold?.answer), row.id);
 if (gold.answer === "yes") assert.ok(gold.activity && row.text.includes(gold.activity), row.id);
 const result = await analyzeHybrid(row.text, {
  findPriorActivities, questionIds: new Set(["prior_activity_assumed"])
 });
 const evidence = result.scopes.flatMap(scope => scope.answers.prior_activity_assumed.evidence);
 const firefox = await matchText(row.text, { techniques: catalogue.techniques, rules });
 const lexical = row.text.match(/\bstop(?:s|ped|ping)?\s+\w+ing\b/i);
 const group = totals[row.stratum] ??= { grammar: blank(), firefox: blank(), lexical: blank() };
 for (const [name, matches] of [["grammar", evidence], ["firefox", firefox], ["lexical", lexical ?? []]]) {
  const stats = group[name];
  stats.cases++;
  if (gold.answer === "yes") {
   stats.goldYes++;
   if (matches.length) stats.truePositive++;
   else stats.missedPositive++;
  } else if (gold.answer === "no") {
   stats.goldNo++;
   if (matches.length) stats.falsePositive++;
  } else {
   stats.goldUnknown++;
   if (matches.length) stats.flaggedUnknown++;
  }
 }
 const activities = evidence.map(span => {
  assert.equal(row.text.slice(span.activity.start, span.activity.end), span.activity.quote);
  return span.activity.quote;
 });
 let activitySpan = null;
 if (gold.answer === "yes" && activities.length) {
  if (activities.includes(gold.activity)) {
   activitySpan = "exact";
   group.grammar.exactActivity++;
  } else if (activities.some(text => gold.activity.includes(text) || text.includes(gold.activity))) {
   activitySpan = "partial";
   group.grammar.partialActivity++;
  } else activitySpan = "different";
 }
 diagnostics.push({ id: row.id, gold: gold.answer, grammar: evidence.length > 0,
  firefox: firefox.length > 0, lexical: Boolean(lexical), activitySpan });
}
console.log(JSON.stringify({ sampleSha256: annotation.sample_sha256, totals, diagnostics }, null, 2));
