const popularityClaim = /(?:(?:almost |nearly )?(?:everyone|everybody)(?: else)?(?: (?:in|on|at) (?:our |my |the )[a-z]+)?(?:'s| is| has been)?|(?:most|many|nearly all|almost all|all) (?:of (?:us|them|you)|(?:my |your |the )?(?:friends|mates|neighbours|neighbors|people|customers|parents|students|colleagues|classes)))/.source;
const popularityAction = /(?:buying|using|backing|supporting|joining|trying|wearing|bought|joined|use[sd]?|buys?|likes?|backs?|supports?|chooses?|picked|voted for|signed up for)/.source;
const recommendation = /(?:(?:you|we) (?:should|must|ought to|have to|need to) (?:(?:do (?:the same|it)|get (?:one|it)|(?:buy|try|use|join|back|pick|take|book|support|vote for) (?:it|one|them|the same))(?: too| as well)?|sign up too|too)|that alone should settle which one you pick)/.source;
const bandwagon = new RegExp([
 "^(?:", popularityClaim, " ", popularityAction, " ",
 /(?!not\b)(?:[a-z'-]+ ){0,4}[a-z'-]+[,!.]? (?:(?:so|therefore|that's why) |(?=that alone should settle))/.source,
 recommendation, "|",
 /(?:you|we) (?:should|must|ought to) (?:buy|try|use|join|back|pick|support) (it|them|one) because everyone(?: else)? (?:uses|likes|backs|supports|buys|has) \1/.source,
 ")[.!]?$"
].join(""), "i");

// Allowlisted constructions over one bounded paragraph. A non-match leaves
// the broader predicate open. Anchors keep attributed examples out of this pass.
export const localQuestions = {
 popularity_as_reason: {
  limit: "An explicit popularity claim linked to the same recommendation.",
  expression: bandwagon
 },
 personal_attack_as_rebuttal: {
  limit: "A personal insult given as grounds to reject the addressee's argument.",
  expression: /^(?:ignore|dismiss|don't listen to) your (?:argument|claim|proposal|point) because you're (?:an? )?(?:idiot|moron|fool|loser)[.!]?$/i
 },
 critic_inconsistency_as_rebuttal: {
  limit: "The addressee's alleged inconsistency explicitly used to dismiss a criticism.",
  expression: /^you (?:do|did) (?:it|that|the same thing) too[,!.]? so your (?:criticism|complaint|objection) (?:doesn't count|is (?:rubbish|invalid|worthless))[.!]?$/i
 },
 firsthand_as_prerequisite: {
  limit: "Other evidence explicitly rejected because the addressee did not witness the event.",
  expression: /^you (?:weren't there|didn't see it yourself)[,!.]? so (?:the )?(?:footage|records|documents|witness statements|other evidence)(?: and (?:footage|records|documents|witness statements))? (?:count for nothing|counts for nothing|doesn't count|don't count|prove nothing)[.!]?$/i
 },
 reason_restates_conclusion: {
  limit: "An exact restatement or an allowlisted synonymous restatement used as the reason.",
  expression: /^(?:it's illegal because it's against the law|it's against the law because it's illegal|((?:it is|it's|this is|that's) [a-z]+) because \1)[.!]?$/i
 },
 disagreement_welcome: {
  limit: "An explicit invitation to identify an error or disagree.",
  expression: /^(?:tell me (?:where you think i'm wrong|if you disagree|what i got wrong)|please (?:challenge my reasoning|tell me if you disagree|point out any flaws in my argument)|if you disagree[, ]+i'd (?:like|love) to hear why)[.!]?$/i
 },
 acknowledged_uncertainty: {
  limit: "The speaker explicitly qualifies their own first-person claim.",
  expression: /^(?:i (?:think|reckon|suspect|believe) [^.!?";]{1,100}[,.]? but i (?:might|could|may) be wrong|i (?:think|reckon|suspect) [^.!?";]{1,100}[,.]? but i'm not (?:sure|certain)|(?:i'm (?:fairly|pretty) sure|my best guess is(?: that)?) [^.!?";]{1,100}[,]? (?:but|though) i (?:didn't|haven't) (?:check(?:ed)?|touch(?:ed)?|confirm(?:ed)?|ask(?:ed)?) (?:[a-z'-]+ ){0,4}[a-z'-]+)[.!]?$/i
 },
 independent_check: {
  limit: "An explicit invitation to check figures, evidence or sources independently.",
  expression: /^(?:please )?(?:check|verify|look up) the (?:figures|numbers|sources|evidence|data) (?:yourself|for yourself|independently)(?: before (?:you decide|deciding|you make up your mind))?[.!]?$/i
 },
 free_choice: {
  limit: "Explicit permission to decide paired with explicit acceptance of either choice.",
  expression: /^(?:it's (?:up to you|your call)(?: whether to [a-z][a-z '-]{0,45})?[.!;,]|come if you (?:like|want)[.!;,]|you can say no[.!;,]) (?:either way is fine|i'll respect either decision|i'll respect your decision|there's no pressure)[.!]?$/i
 },
 ownership_of_harm: {
  limit: "An admission of a specific mistake followed by acceptance of responsibility.",
  expression: /^i (?:missed (?:the deadline|our appointment)|left you waiting|forgot (?:to call|our meeting)|gave you the wrong (?:time|date|address))[.!;,] (?:that was my fault|that's on me|i take responsibility for that)[.!]?$/i
 },
 validating_feeling: {
  limit: "Explicit acknowledgement that the other person's feeling makes sense.",
  expression: /^(?:it makes sense|i can understand) that you (?:feel|felt) (?:left out|upset|sad|worried|frustrated|hurt|disappointed|anxious|angry)[.!]?$/i
 },
 plain_boundary_respect: {
  limit: "A request for space or no calls followed by a directly related commitment.",
  expression: /^you (?:asked me not to call|said you need(?:ed)? space)[.!;,] (?:i won't call|i'll stop calling|i'll give you space)[.!]?$/i
 },
 offered_attention_exit: {
  limit: "Explicit permission to skip the rest or stop reading.",
  expression: /^(?:you can (?:skip the rest|stop reading)(?: if you (?:like|want|already have what you need))?|feel free to (?:skip the rest|stop reading)|skip the rest if you've got what you needed)[.!]?$/i
 },
 conditional_penalty: {
  limit: "An explicit request linked to a first-person sanction for refusal.",
  expression: /^(?:please )?(?:sign|send|remove|return|hand over|take down|finish|wear|stop parking|come help) [a-z][a-z '-]{0,45}[.!;,]? (?:or |if you (?:refuse|say no|don't)[, ]+|otherwise[, ]+)(?:i'll (?:dock your pay|cut your hours|keep your deposit|cancel your (?:access|permit)|suspend your account|remove you from the group)|you(?:'ll)? lose your (?:spot|place) on the trip)[.!]?$/i
 },
 unfavourable_future: {
  limit: "An explicit adverse consequence imposed by the speaker for refusing to act.",
  expression: /^if you (?:say no|refuse|don't (?:sign|return it|give it back))[, ]+i'll (?:dock your pay|cut your hours|keep your deposit|cancel your access|suspend your account)[.!]?$/i
 },
 choice_with_linked_penalty: {
  limit: "Explicit permission to refuse followed by a penalty explicitly tied to refusal.",
  expression: /^(?:it's your (?:choice|decision|call)|you can (?:say no|decline|refuse))[,!.]? (?:but )?(?:if you (?:say no|decline|refuse)[, ]+|(?:say no|decline|refuse) and )i'll (?:dock your pay|cut your hours|keep your deposit|cancel your access|suspend your account|remove you from the group)[.!]?$/i
 },
 absence_as_proof: {
  limit: "A lack of disproof explicitly declared sufficient proof.",
  expression: /^(?:nobody|no one) has (?:proved|proven|shown) (?:it|that) (?:false|wrong)[,.!]? so (?:it|that) (?:must be|is definitely|has to be) true[.!]?$/i
 },
 distinguishes_inference: {
  limit: "An explicitly identified observation followed by an expressly uncertain interpretation.",
  expression: /^i saw (?:her|him|them) (?:leave early|walk away|close the door)[.!;,] i (?:took that to mean|thought that meant) (?:she was|he was|they were) (?:upset|angry|in a hurry)[, ]+but i (?:don't know|could be wrong)[.!]?$/i
 },
 authority_as_reason: {
  limit: "A credential explicitly treated as sufficient reason to accept a claim.",
  expression: /^(?:a|the) (?:professor|doctor|minister|celebrity|expert) said (?:it|so|that)[,.!]? so (?:it|that) (?:must be|has to be|is definitely) true[.!]?$/i
 },
 rebuttal_as_wider_attack: {
  limit: "A correction of one item explicitly recast as an attack on a wider group or argument.",
  expression: /^you (?:corrected|questioned) (?:one|a single) (?:figure|number|fact|detail)[,.!]? so (?:obviously |clearly )?you're attacking (?:my whole argument|the entire argument|everyone who (?:agrees|believes this))[.!]?$/i
 },
 freedom_to_speak_redirect: {
  limit: "A direct objection to the claim recast as a denial of permission to speak.",
  expression: /^you said (?:my (?:maths|math|argument|claim|figures) (?:was|were) wrong|i got (?:the figures|that fact) wrong)[.!;,] (?:so |and now )?(?:i'm not allowed to speak now|i'm not allowed to say that|you're saying i can't speak)\?$/i
 },
 tautology_as_necessity: {
  limit: "An identical label offered as the stated reason an outcome cannot change.",
  expression: /^([a-z][a-z '-]{0,30}) is \1[.!;,] (?:so |therefore |that's why )(?:it|the (?:rule|decision|policy)) (?:can't be changed|cannot be changed|cannot be challenged|can't be challenged)[.!]?$/i
 },
 reason_supports: {
  limit: "A conclusion restating the explicitly universal property of an explicitly named member.",
  expression: /^all ([a-z]+s) are ([a-z]+)\. ([a-z]+) is one of those \1\.[ ](?:so|therefore) \3 is \2[.!]?$/i
 },
 causal_from_sequence: {
  limit: "The order of two explicitly matched events offered as the entire basis for causation.",
  expression: /^(the [a-z]+) happened (?:right |just )?after (the [a-z]+)[,.!]? so \2 (?:must have caused|caused) \1[.!]?$/i
 },
 limited_sample_to_group: {
  limit: "One or two observations explicitly generalized to all members of the same named group.",
  expression: /^i (?:met|spoke to) (?:one or two|two) ([a-z]+s) who were ([a-z]+)[,.!]? so all \1 (?:must be|are) \2[.!]?$/i
 },
 guilt_as_leverage: {
  limit: "An explicit test of care tying a named person's distress to an instruction.",
  expression: /^if you (?:really )?cared that (?:grandma|grandpa|mum|mom|dad) (?:is|was) (?:lonely|upset|hurting), you'd (?:cancel your trip|come home|give up your plans|stay with (?:her|him))[.!]?$/i
 },
 disagreement_with_penalty: {
  limit: "Permission to disagree directly followed by a sanction for the same disagreement.",
  expression: /^you(?:'re welcome to| can| are free to) disagree[,!.]? (?:but )?if you (?:do|disagree)[, ]+i'll (?:remove you from the group|cut your hours|suspend your account)[.!]?$/i
 },
 empathy_with_linked_guilt: {
  limit: "Acknowledgement of an expressed feeling followed by a demand framed as a test of loyalty.",
  expression: /^i (?:get|understand|know) (?:that )?you(?:'re| feel) (?:tired|upset|hurt|worried)[,.!] but if you really cared about (?:me|us), you'd (?:stay|cancel your plans|come home|take my shift)[.!]?$/i
 },
 independence_with_demand: {
  limit: "An invitation to decide independently directly reversed by a demand to agree.",
  expression: /^(?:make up your own mind|think for yourself|decide for yourself)[,.!] but you (?:must|have to|need to) (?:agree with me|accept my conclusion|take my side)[.!]?$/i
 },
 changed_requirement: {
  limit: "An explicitly sufficient criterion repeated as fulfilled before an additional requirement is introduced.",
  expression: /^you said all i needed was ([a-z][a-z ]{0,45})\. i (?:provided|sent|submitted) \1\. now you say i also need ([a-z][a-z ]{0,45})[.!]?$/i,
  accept: ([, original, additional]) => original.toLowerCase() !== additional.toLowerCase()
 },
 allegation_loses_attribution: {
  limit: "The same clause first attributed as an allegation and then restated unqualified.",
  expression: /^(?:the report|a witness|the complaint) alleged that (the [a-z]+ (?:took|hid|removed|withheld) the [a-z]+)\. \1[.!]?$/i
 },
 two_options_as_exhaustive: {
  limit: "A claim of exactly two options alongside a distinct option explicitly named as available.",
  expression: /^(?:your|the) only options are to ([a-z][a-z ]{0,28}) or to ([a-z][a-z ]{0,28})\. you can also ([a-z][a-z ]{0,28})[.!]?$/i,
  accept: ([, first, second, third]) => {
   const choices = [first, second, third].map(option => option.toLowerCase());
   return new Set(choices).size === 3 && !choices.some(option => option.includes(" or "));
  }
 },
 disproportionate_reward_offer: {
  limit: "An immediate guaranteed cash return of at least 100 times the requested payment in the same currency.",
  expression: /^send ([$£€])([1-9][0-9]{0,6})(?: now)? (?:and you'll get|to get) (?:a guaranteed )?\1([1-9][0-9]{0,8}) (?:guaranteed (?:today|tomorrow|instantly)|(?:today|tomorrow|instantly),? guaranteed)[.!]?$/i,
  accept: ([, , payment, reward]) => Number(reward) >= 100 * Number(payment)
 }
};

export function localAnswer(questionId, passage, scope) {
 const rule = localQuestions[questionId];
 if (!rule) return null;
 const leading = passage.length - passage.trimStart().length;
 const quote = passage.trim();
 const match = rule.expression.exec(quote.replace(/[’‘]/g, "'").replace(/\s+/g, " "));
 if (!match || (rule.accept && !rule.accept(match))) return null;
 return {
  answer: "yes", status: "answered", method: "javascript",
  evidence: [{ id: questionId, ruleId: questionId + ".explicit.v1",
   start: scope.start + leading, end: scope.start + leading + quote.length, quote, limit: rule.limit }]
 };
}
