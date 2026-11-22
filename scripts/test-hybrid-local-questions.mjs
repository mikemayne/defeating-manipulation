import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyzeHybrid } from "../extension/src/hybrid-detector.mjs";
import { localQuestions } from "../extension/src/hybrid-local-questions.mjs";

const contrasts = {
 popularity_as_reason: ["Everyone’s buying one, so you should too.", "Everyone’s buying one, so you should check the delivery date."],
 personal_attack_as_rebuttal: ["Dismiss your argument because you’re an idiot.", "Dismiss your argument because the figures don't add up."],
 critic_inconsistency_as_rebuttal: ["You do it too, so your complaint doesn't count.", "You do it too, but your complaint is valid."],
 firsthand_as_prerequisite: ["You weren't there, so the footage and records count for nothing.", "You weren't there, so let's look at the footage."],
 reason_restates_conclusion: ["It's illegal because it's against the law.", "It's illegal because the new statute prohibits it."],
 disagreement_welcome: ["Tell me where you think I'm wrong.", "Tell me why you think I'm right."],
 acknowledged_uncertainty: ["I think it's broken, but I might be wrong.", "I think it's broken, but you might be wrong."],
 independent_check: ["Check the figures yourself before you decide.", "I checked the figures myself before you decided."],
 free_choice: ["Come if you like. Either way is fine.", "Come if you like. But if you refuse, I'll never forgive you."],
 ownership_of_harm: ["I left you waiting. That was my fault.", "I left you waiting. That was your fault."],
 validating_feeling: ["It makes sense that you felt left out.", "It makes sense that they deliberately left you out."],
 plain_boundary_respect: ["You said you need space. I'll stop calling.", "You said you need space. I'll keep calling anyway."],
 offered_attention_exit: ["Feel free to skip the rest.", "Feel free to skip the rest if you don't care about us."],
 conditional_penalty: ["Please return the laptop. If you refuse, I'll suspend your account.", "Please return the laptop. Your account is suspended for a separate reason."],
 unfavourable_future: ["If you refuse, I'll cut your hours.", "If you refuse, I'll ask someone else."],
 choice_with_linked_penalty: ["It's your decision, but say no and I'll dock your pay.", "It's your decision. If Sam says no, I'll dock Sam's pay."],
 absence_as_proof: ["Nobody has proved it false, so it must be true.", "Nobody has proved it false, so we need more evidence."],
 distinguishes_inference: ["I saw her leave early. I took that to mean she was upset, but I don't know.", "I saw her leave early. I know she was upset."],
 authority_as_reason: ["A professor said it, so it must be true.", "A professor said it, so let's read the study."],
 rebuttal_as_wider_attack: ["You corrected one figure, so clearly you're attacking everyone who believes this.", "You corrected one figure, so I'll recalculate that estimate."],
 freedom_to_speak_redirect: ["You said my maths was wrong. So I'm not allowed to speak now?", "You said my maths was wrong. Can I check it again?"],
 tautology_as_necessity: ["A rule is a rule, so it can't be changed.", "A rule is a rule, but we can revise it next month."],
 reason_supports: ["All passes are valid. Goldie is one of those passes. Therefore Goldie is valid.", "All passes are valid. Goldie is one of those passes. Therefore Goldie is free."],
 causal_from_sequence: ["The crash happened just after the update, so the update caused the crash.", "The crash happened just after the update, so the update might or might not have caused it."],
 limited_sample_to_group: ["I met two drivers who were rude, so all drivers are rude.", "I met two drivers who were rude, so those two drivers were rude."],
 guilt_as_leverage: ["If you cared that Grandma was lonely, you'd cancel your trip.", "Grandma was lonely, so could we arrange a call?"],
 disagreement_with_penalty: ["You can disagree, but if you do, I'll remove you from the group.", "You can disagree. If Sam spams the chat, I'll remove him from the group."],
 empathy_with_linked_guilt: ["I know you're tired, but if you really cared about me, you'd stay.", "I know you're tired, but if you want to go home, that's fine."],
 independence_with_demand: ["Think for yourself, but you must agree with me.", "Think for yourself, but you need to read both accounts first."],
 changed_requirement: ["You said all I needed was a receipt. I provided a receipt. Now you say I also need a photo.", "You said all I needed was a receipt. I provided a receipt. Now you say I also need a receipt."],
 allegation_loses_attribution: ["The report alleged that the manager took the funds. The manager took the funds.", "The report alleged that the manager took the funds. The manager returned the funds."],
 two_options_as_exhaustive: ["Your only options are to pay or to leave. You can also appeal.", "Your only options are to pay or to leave. You can also leave."],
 disproportionate_reward_offer: ["Send £5 now and you'll get £500 tomorrow, guaranteed.", "Send £5 now and you'll get £6 tomorrow, guaranteed."]
};
assert.deepEqual(Object.keys(contrasts).sort(), Object.keys(localQuestions).sort());
for (const [id, [positive, negative]] of Object.entries(contrasts)) {
 const options = { questionIds: new Set([id]) };
 const result = await analyzeHybrid(positive, { ...options, mode: "complete",
  classify: async () => assert.fail("Explicit local construction should skip the model") });
 const actual = result.scopes[0].answers[id];
 assert.equal(actual.answer, "yes", id);
 assert.equal(actual.method, "javascript", id);
 assert.equal(result.calls, 0);
 assert.equal(positive.slice(actual.evidence[0].start, actual.evidence[0].end), positive);
 for (const text of [negative, 'She quoted: "' + positive + '"', positive + " I disagree with that statement."]) {
  const fallback = await analyzeHybrid(text, options);
  assert.equal(fallback.scopes[0].answers[id].answer, "unknown", id + " hard negative or quoted");
 }
}

const literalCases = [
 ["Most of us use this app. So you ought to use it too.", true],
 ["You should use it because everyone uses it.", true],
 ["27 people viewed this listing. Only two rooms left.", false],
 ["Everyone bought one. You should still compare the prices.", false],
 ["It should arrive Tuesday.", false],
 ["Everyone is buying it, so should you?", false],
 ["Everyone is buying it, so you shouldn't too.", false],
 ["You should use them because everyone uses it.", false]
];
for (const [text, expected] of literalCases) {
 const result = await analyzeHybrid(text);
 const pattern = result.scopes[0].patterns.find(item => item.id === "bandwagon");
 assert.equal(pattern.state === "supported", expected, text);
}
const modal = (await analyzeHybrid("I can't go. You should.")).scopes[0];
assert.deepEqual(modal.answers.modal_wording.evidence.map(item => item.quote), ["can't", "should"]);

const result = await analyzeHybrid("The passage uses an indirect source.", {
 questionIds: new Set(["popularity_as_reason"]),
 classify: async () => '{"question_id":"popularity_as_reason","answer":"no","evidence":[]}'
});
assert.equal(result.calls, 1, "Unmatched construction still reaches the model");
const audit = JSON.parse(readFileSync(
 new URL("../evaluation/hybrid-contrast-audit-v1.json", import.meta.url), "utf8"));
let found = 0, falsePositives = 0;
for (const [id, groups] of Object.entries(audit)) {
 for (const group of groups) {
  for (const [index, passage] of group.entries()) {
   const assessed = await analyzeHybrid(passage, { questionIds: new Set([id]) });
   if (!assessed.scopes.some(item => item.answers[id].answer === "yes")) continue;
   if (index === 0) found++;
   else falsePositives++;
  }
 }
}
assert.ok(found >= 6, "Retain coverage on the previously reviewed examples");
assert.equal(falsePositives, 0, "Retain hard-negative and ambiguity controls");
console.log(`${Object.keys(contrasts).length} local rules and their negative, quotation and mixed-context controls passed.`);
console.log(`Reviewed development examples: ${found} positive matches; ${falsePositives} false positives.`);
