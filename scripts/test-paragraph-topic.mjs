import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { compilePatternRules, matchText } from "../extension/src/matching-core.mjs";
import { paragraphTopicFindings } from "../extension/src/paragraph-topic.mjs";

const json = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const catalogue = await json("../techniques.json");
const rules = compilePatternRules(catalogue, await json("../extension/patterns.json"));
const analyse = text => matchText(text, {techniques: catalogue.techniques, rules});
const hook = "Your argument is wrong because you are an idiot.";
const topic = "Your claim about the bridge deserves dismissal.";
const tail = "The committee meets on Friday.";
const passage = [hook, topic, tail].join(" ");
const text = "First paragraph.\n  " + passage + "\n" + hook;
const prompts = [];
const findings = await paragraphTopicFindings(text, analyse, async prompt => {
 prompts.push(prompt);
 return "Yes.";
});
assert.equal(findings.length, 1);
assert.equal(text.slice(findings[0].start, findings[0].end), passage);
assert.equal(findings[0].technique.id, "ad_hominem");
assert.equal(prompts.length, 1);
assert.ok(prompts[0].includes(topic));
assert.ok(!prompts[0].includes(tail));
const implied = "All that remains is to work out where your reasoning went wrong.";
const indirectPassage = [hook, implied, tail].join(" ");
const indirect = await paragraphTopicFindings(indirectPassage, analyse, async () => "Implied yes.");
assert.equal(indirect.length, 1);
assert.equal(indirect[0].technique.id, "ad_hominem");
assert.equal(indirect[0].end, indirectPassage.length);
const delayed = [hook, tail, topic, implied, tail].join(" ");
const tried = [];
const later = await paragraphTopicFindings(delayed, analyse, async prompt => {
 tried.push(prompt);
 return prompt.includes(implied) ? "implied yes" : "unclear";
});
assert.equal(tried.length, 3);
assert.ok(tried.every(prompt => prompt.includes(hook)));
assert.equal(later[0].confirmationSentence, 4);
assert.equal(later[0].end, delayed.length);
assert.equal(findings[0].confirmationSentence, 2);
for (const response of ["no", "unclear", "uncertain", "yes and no"]) {
 assert.deepEqual(await paragraphTopicFindings(passage, analyse, async () => response), []);
}
const unexpected = () => assert.fail("No topic inference expected");
assert.deepEqual(await paragraphTopicFindings(topic + " " + hook, analyse, unexpected), []);
assert.deepEqual(await paragraphTopicFindings(hook + "\n" + topic, analyse, unexpected), []);
// Keep the opening fixed so shared subject matter alone cannot pass the contrast.
const contrasts = [
 { second: implied, confirms: true },
 { second: "You're absolutely right to dismiss that argument.", confirms: true },
 { second: "That argument deserves to be dismissed.", confirms: true },
 { second: "The argument appeared on page three of the report.", confirms: false },
 { second: "Actually, your argument is sound.", confirms: false },
 { second: "It depends which part of the argument you mean.", confirms: false }
];
assert.match(prompts[0], /endorse the judgment or reaction/);
assert.match(prompts[0], /implied yes/);
assert.match(prompts[0], /unclear/);
if (process.argv.includes("--live")) {
 const { generateImpliedConclusion } = await import("../extension/src/implicit-conclusion-model.mjs");
 const failures = [];
 for (const {second, confirms} of contrasts) {
  const result = await paragraphTopicFindings(hook + " " + second, analyse, generateImpliedConclusion);
  if (Boolean(result.length) !== confirms) failures.push(second);
 }
 assert.deepEqual(failures, [], "Unexpected paragraph marks or missed confirmations");
}
console.log("Paragraph confirmation checks passed.");
