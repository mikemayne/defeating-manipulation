// Semantic similarity is not proof of constructive communication. Require
// relevant observable wording and a stronger positive-pattern similarity margin.
// These gates are deliberately broad; the explicit regexes are the precision baseline.
const cues = {
 restoring_agency: /\b(?:you (?:can|may|are free to|don't have to|do not have to)|your (?:choice|decision)|up to you|decide (?:for|by) yourself|choose (?:for|by) yourself|take (?:the|your) time)\b/i,
 welcoming_disagreement: /\b(?:disagree|different (?:opinion|view|perspective)|challenge|hear (?:your|the) (?:perspective|view)|understand why)\b/i,
 separating_observation_from_interpretation: /\b(?:saw|observed|noticed|heard|witnessed)\b[^.!?]{0,130}\b(?:don't know|do not know|can't know|cannot know|not sure|don't assume|do not assume|uncertain)\b/i,
 acknowledging_uncertainty: /\b(?:not (?:certain|sure)|don't know|do not know|could be wrong|might be wrong|may be wrong|limited (?:evidence|information)|can't say|cannot say|best (?:guess|reading))\b/i,
 respecting_boundaries: /\b(?:understood|i respect|i'll respect|we can leave|let's leave|won't push|will not push|don't want to push|stop asking|respect (?:your|that) (?:boundary|limit|choice))\b/i,
 proportionate_response: /\b(?:not urgent|isn't urgent|is not urgent|not an emergency|no need to rush|can wait|deal with (?:it|this) (?:later|tomorrow)|proportionate|reasonable response)\b/i,
 encouraging_independent_thought: /\b(?:sources|evidence|check|review|read|think|decide|reach|draw)\b[^.!?]{0,130}\b(?:yourself|your own|own conclusion|own mind|independently)\b/i,
 validating_emotional_experience: /\b(?:i (?:understand|can see|hear)|that (?:sounds|seems|must have been)|it makes sense|i'm sorry|i am sorry)\b[^.!?]{0,120}\b(?:felt|feel|feeling|upset|hurt|painful|difficult|frustrating|experience|for you)\b/i,
 transparent_reasoning: /\b(?:because|reasons?|assumptions?|conditions?|constraints?|evidence|recommendation|conclusion)\b[^.!?]{0,160}\b(?:if|change|wrong|reconsider|assumptions?|reasons?|constraints?|evidence)\b/i,
 supporting_informed_choice: /\b(?:options?|alternatives?|choices?)\b[^.!?]{0,160}\b(?:risks?|trade-offs?|benefits?|what each|pros and cons|compare|details|consequences?)\b/i,
 taking_responsibility: /\b(?:i (?:was wrong|made a mistake|interrupted|apologise|apologize)|my (?:fault|mistake|error)|i take responsibility)\b[^.!?]{0,180}\b(?:i'll|i will|let me|fix|correct|change|finish|responsibility|sorry)\b/i,
 respecting_attention: /\b(?:no need to (?:reply|answer|respond)|take your time|when you have time|if and when|no rush|respond later|reply later|not (?:right now|immediately))\b/i
};
export function hasPositiveSemanticEvidence(id, text) {
 return Boolean(cues[id]?.test(text));
}
