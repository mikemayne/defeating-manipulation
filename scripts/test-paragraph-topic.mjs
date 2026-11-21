import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { compilePatternRules, matchText } from "../extension/src/matching-core.mjs";
import { paragraphTopicFindings } from "../extension/src/paragraph-topic.mjs";

const json = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const catalogue = await json("../techniques.json");
const rules = compilePatternRules(catalogue, await json("../extension/patterns.json"));
const analyse = text => matchText(text, {techniques: catalogue.techniques, rules});
const hook = "Your argument is wrong because you are an idiot.";
const middle = "You gave the wrong date for the inspection.";
const closing = "We can safely dismiss your argument.";
const tail = "The committee meets on Friday.";
const text = [hook, middle, closing].join(" ");
const check = async passage => {
 const prompts = [];
 const findings = await paragraphTopicFindings(passage, analyse, async prompt => {
  prompts.push(prompt);
  if (prompt.startsWith("Does the closing")) return prompt.endsWith(closing) ? "implied yes" : "no";
  return prompt.includes("Middle: " + middle) ? "yes" : "no";
 });
 return {prompts, findings};
};
const result = await check(text);
assert.equal(result.findings.length, 1);
assert.equal(result.findings[0].technique.id, "ad_hominem");
assert.equal(result.findings[0].end, text.length);
assert.equal(result.findings[0].confirmationSentence, 3);
assert.equal(result.prompts.length, 2);
assert.ok(!result.prompts[0].includes(middle));
assert.ok(!result.prompts[1].includes(hook));
for (const passage of [[hook, closing], [hook, middle, closing, tail], [hook, tail, closing],
 [tail, middle, closing], [hook, middle + "\n" + closing]]) {
 assert.deepEqual((await check(passage.join(" "))).findings, []);
}
assert.equal((await check([hook, middle, tail, closing].join(" "))).findings.length, 1);
console.log("Closing payload and middle justification checks passed.");
