import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {compilePatternRules, matchText} from "../extension/src/matching-core.mjs";
import {paragraphTopicFindings} from "../extension/src/paragraph-topic.mjs";

const json = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const catalogue = await json("../techniques.json");
const rules = compilePatternRules(catalogue, await json("../extension/patterns.json"));
const analyse = text => matchText(text, {techniques: catalogue.techniques, rules});
const hook = "Your argument is wrong because you are an idiot.";
const middle = "Perhaps another speaker will attend.";
const plain = "The committee meets on Friday.";
for (const closing of ["That remains to be seen.", "Who authorised it?", "Perhaps it will happen."]) {
 const text = "Other text.\r\n  " + [hook, middle, closing].join(" ") + "  \n" + hook;
 const hits = await paragraphTopicFindings(text, analyse);
 assert.deepEqual(hits.map(hit => text.slice(hit.start, hit.end)), [hook, closing]);
 assert.ok(hits.every(hit => hit.technique.id === "ad_hominem"));
}
for (const text of [hook, hook + "\nWho authorised it?", hook + " " + middle + " " + plain, plain + " Who authorised it?"]) {
 assert.deepEqual(await paragraphTopicFindings(text, analyse), []);
}

// Both joins are internal. Only a match covering words from both ends counts.
const first = "Dr. Jones spoke.";
const last = "The meeting ended.";
const technique = {id: "example"};
for (const winningJoin of [" and ", " but ", null]) {
 const calls = [];
 const findings = await paragraphTopicFindings(first + " " + middle + " " + last, async input => {
  calls.push(input);
  const crosses = winningJoin && input.includes(winningJoin);
  return [{start: 0, end: crosses ? input.length : 4, score: 1, technique}];
 });
 assert.deepEqual(calls, [first, "Dr. Jones spoke and " + last, "Dr. Jones spoke but " + last]);
 assert.equal(findings.length, winningJoin ? 2 : 0);
}
console.log("Paragraph opening and closing checks passed.");
