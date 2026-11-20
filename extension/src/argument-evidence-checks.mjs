// Conservative, model-independent evidence checks for the existing MNLI scorer.
import { attributedSource } from './consistency.mjs';
// NLI probabilities are candidates, not proofs of contradiction or an overclaim.
// Do not use these checks to assert that an argument is supported or true.

const NEGATION = /\b(?:no|not|never|none|nothing|nobody|neither|without|cannot|can't|won't|wasn't|isn't|aren't|doesn't|didn't|don't|hasn't|haven't|hadn't)\b/i;
const RESTRICTED = /\b(?:a|an|one|single|some|several|few|certain|specific|particular|two|three|four|five|six|seven|eight|nine|ten|\d+)\b/i;
const ALL = /\b(?:all|every|each)\s+([a-z][a-z'-]*(?:\s+[a-z][a-z'-]*){0,2})/gi;
const FUNCTION_WORD = /^(?:in|at|on|of|to|from|through|with|without|by|has|have|had|is|are|was|were|will|can|must|may|now|then|that|which|as|for)$/i;
function categoryNoun(quantifierPhrase) {
 const xs=quantifierPhrase.toLowerCase().split(/\s+/);
 const part=xs.slice(0, Math.max(1,xs.findIndex((x,i)=>i>0 && FUNCTION_WORD.test(x))));
 return norm(part[part.length-1]);
}
const TIME = /\b(?:19\d\d|20\d\d|yesterday|today|tomorrow|last week|this week|last month|this month|last year|this year|monday|tuesday|wednesday|thursday|friday|saturday|sunday|before|after)\b/gi;
const STOP = new Set(`a an the this that these those it its is are was were be been being as at by for from in into of on or and but to with than then a all every each one any does do did has have had not never no none nothing nobody neither without can could would should may might will shall so therefore thus since because such more most less least our their they we he she you your his her which who whose what when where`.split(' '));

function norm(word) {
 let w=word.toLowerCase().replace(/['’]s$/, '');
 if (/^(?:buses|busses)$/.test(w)) return 'bus';
 if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
 if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
 return w;
}
function terms(text) {
 return new Set((String(text).toLowerCase().match(/[a-z][a-z'’-]*/g) || [])
  .map(norm).filter(x=>x.length>2 && !STOP.has(x)));
}
function sharedWords(a,b) {
 const p=terms(a),c=terms(b);
 return [...p].filter(x=>c.has(x));
}
function distinctPeriod(a,b) {
 const p=(a.match(TIME)||[]).map(x=>x.toLowerCase());
 const c=(b.match(TIME)||[]).map(x=>x.toLowerCase());
 // A date restriction absent from one claim is context-dependent: abstain if
 // the two claims *explicitly* give nonoverlapping periods, not otherwise.
 return p.length>0 && c.length>0 && !p.some(x=>c.includes(x));
}
const ANTONYMS = [
 [/\bopen(?:ed|s)?\b/i, /\bclos(?:ed|ing)|shut\b/i],
 [/\b(?:accessible|accessibility)\b/i, /\binaccessible\b/i],
 [/\b(?:working|operational|functioning)\b/i, /\b(?:broken|inoperable|nonfunctional|not working)\b/i],
 [/\b(?:allow(?:s|ed)?|permitt?ed|permitted)\b/i, /\b(?:ban(?:s|ned)?|prohibit(?:ed|s)?|forbids?|forbidden)\b/i],
 [/\bavailable\b/i, /\bunavailable\b/i],
 [/\b(?:safe|safely)\b/i, /\b(?:unsafe|dangerous|hazardous)\b/i],
 [/\b(?:passed|passing|pass)\b/i, /\b(?:failed|failing|fail)\b/i]
];
function opposingPredicate(a,b) {
 return ANTONYMS.some(([x,y])=>(x.test(a)&&y.test(b))||(y.test(a)&&x.test(b)));
}

/** A direct conflict needs a shared topic and a verifiable lexical opposition.
 * It is deliberately narrower than semantic MNLI contradiction. */
export function explicitConflict(premise, conclusion) {
 const sourceA=attributedSource(premise), sourceB=attributedSource(conclusion);
 if(sourceA && sourceB && sourceA!==sourceB)
  return {verified:false,reason:'different_attributed_sources'};
 const shared=sharedWords(premise,conclusion);
 if (!shared.length) return {verified:false,reason:'different_or_unlinked_claims'};
 if (distinctPeriod(premise,conclusion))
  return {verified:false,reason:'different_explicit_periods'};
 if (opposingPredicate(premise, conclusion) &&
     NEGATION.test(premise)===NEGATION.test(conclusion))
  return {verified:true,reason:'opposing_predicate',shared};
 if (opposingPredicate(premise, conclusion) &&
     NEGATION.test(premise)!==NEGATION.test(conclusion))
  return {verified:false,reason:'negated_opposite_predicate'};
 // "Only platform two" directly excludes the other platforms from an
 // "every platform" claim, even without an antonym or explicit "not".
 if (/\bonly\b/i.test(premise)) {
  for (const match of conclusion.matchAll(ALL)) {
   const category=categoryNoun(match[1]);
   const onlyCategory=new RegExp('\\bonly\\s+(?:(?:one|the|a|an)\\s+)?'+category+'s?\\b','i');
   if (onlyCategory.test(premise))
    return {verified:true,reason:'explicit_only_excludes_universal',shared};
  }
 }
 // Mere appearance of a negator is inadequate. The non-negated content must
 // also agree substantially (e.g. "the clinic provides eye tests" / "no eye tests").
 const polarityDiff=NEGATION.test(premise)!==NEGATION.test(conclusion);
 const p=terms(premise),c=terms(conclusion);
 const smaller=Math.min(p.size,c.size);
 if (polarityDiff && shared.length>=2 &&
     (shared.length>=Math.ceil(smaller*0.6) || shared.length>=3))
  return {verified:true,reason:'same_claim_opposite_polarity',shared};
 return {verified:false,reason:'no_explicit_conflict'};
}

/** Identify a *specific* widening of the same observed category, not merely
 * any all/most/best/guaranteed word. When in doubt, return no finding. */
export function specificEvidenceGap(premise,conclusion) {
 if (distinctPeriod(premise, conclusion))
  return {verified:false,reason:'different_explicit_periods'};
 if (/\b(?:should|ought|recommend|could consider)\b/i.test(conclusion))
  return {verified:false,reason:'normative_conclusion'};
 const p=terms(premise);
 const shared=sharedWords(premise,conclusion);
 for (const match of conclusion.matchAll(ALL)) {
  const category=categoryNoun(match[1]);
  if (!p.has(category)) continue;
  const pAll=[...premise.matchAll(ALL)].some(m=>categoryNoun(m[1])===category);
  if (pAll || !RESTRICTED.test(premise)) continue;
  // A clearly narrower observation of the *same* category is not sufficient
  // to establish a universal claim. Generic shared verbs alone don't count.
  return {verified:true,reason:'explicit_sample_to_universal',category,shared};
 }
 return {verified:false,reason:'no_specific_evidence_gap'};
}