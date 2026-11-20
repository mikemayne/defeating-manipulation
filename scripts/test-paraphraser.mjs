import assert from "node:assert/strict";
import { normaliseParagraphInputs, paraphrasePrompt, assessParaphrase,
 paraphraseParagraphs } from "../extension/src/paragraph-paraphraser.mjs";

const paragraphs = normaliseParagraphInputs([
 { id: "first", text: " First sentence.  Second sentence. " },
 { id: "second", text: "Another paragraph." }
]);
assert.deepEqual(paragraphs.map(p => p.id), ["first", "second"]);
assert.deepEqual(paragraphs.map(p => p.index), [0, 1]);
assert.equal(paragraphs[0].original, "First sentence. Second sentence.");
assert.throws(() => normaliseParagraphInputs([{id:"same",text:"A"},{id:"same",text:"B"}]),
 /Duplicate paragraph ID/);
assert.throws(() => normaliseParagraphInputs([{id:"broken"}]), /text string/);

const prompt = paraphrasePrompt("The council has not approved the plan.");
assert.match(prompt, /PRIMARY WEIGHT/);
assert.match(prompt, /sentence or phrase/);
assert.match(prompt, /Preserve implied accusations, suggested/);
assert.match(prompt, /Do NOT bury the key persuasive point/);
assert.match(prompt, /Do NOT label any manipulation pattern/);
assert.ok(prompt.includes("The council has not approved the plan."));
assert.deepEqual(assessParaphrase("A majority supported the proposal.",
 "Most members of the group backed the proposal."), []);
assert.ok(assessParaphrase("The rate rose by 15%.",
 "The rate increased significantly.").includes("number_mismatch"));
assert.ok(assessParaphrase("The council did not approve the proposal.",
 "The council approved the proposal.").includes("negation_mismatch"));
assert.ok(assessParaphrase("She made three separate claims about the results.",
 "Claims.").includes("possible_omission"));

const requested = [], progress = [];
const items = await paraphraseParagraphs([
 {id:"p1",text:"The report says rainfall increased in the region."},
 {id:"p2",text:"The council rejected the proposal after two public meetings."}
], async (input, settings) => {
 requested.push({input,settings});
 if (requested.length === 1)
  return [{generated_text:"According to the report, the region had more rainfall."}];
 return [{generated_text:"After two public meetings, the council turned down the proposal."}];
}, {onProgress: update => progress.push(update)});
assert.deepEqual(items.map(x => x.id), ["p1","p2"]);
assert.deepEqual(items.map(x => x.status), ["ready","ready"]);
assert.equal(requested.length, 2);
assert.equal(progress.at(-1).completed, 2);
assert.equal(progress.at(-1).total, 2);
assert.ok(!requested[1].input.includes("According to the report"),
 "Second prompt depends only on second original paragraph");
assert.ok(!requested[0].input.includes("firstPassFindings"),
 "First-pass analysis must not be supplied to paraphraser");

const degraded = await paraphraseParagraphs([
 {id:"risk",text:"The rate increased by 25% over the last year."},
 {id:"failure",text:"The report contains several independent examples."},
 {id:"long",text:"x".repeat(1201)}
], async input => {
 if (input.includes("independent examples")) throw Error("model unavailable");
 return [{generated_text:"The rate increased during the previous year."}];
});
assert.equal(degraded[0].status, "review");
assert.ok(degraded[0].issues.includes("number_mismatch"));
assert.equal(degraded[1].status, "error");
assert.equal(degraded[2].status, "skipped");
assert.ok(degraded[2].issues.includes("paragraph_too_long"));

await assert.rejects(() => paraphraseParagraphs(["A valid paragraph."],
 async () => "A rewritten paragraph.", { isCancelled:()=>true }), /cancelled/);
console.log("Paragraph paraphraser: deterministic tests passed");
