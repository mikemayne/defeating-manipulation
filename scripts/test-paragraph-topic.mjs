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
for (const response of ["no", "uncertain", "yes and no"]) {
 assert.deepEqual(await paragraphTopicFindings(passage, analyse, async () => response), []);
}
const unexpected = () => assert.fail("No topic inference expected");
assert.deepEqual(await paragraphTopicFindings(topic + " " + hook, analyse, unexpected), []);
assert.deepEqual(await paragraphTopicFindings(hook + "\n" + topic, analyse, unexpected), []);
console.log("Paragraph topic checks passed.");
