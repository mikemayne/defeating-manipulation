import { extractArguments } from "./argument-clauses.mjs";
export { extractArguments, extractArgumentStatements } from "./argument-clauses.mjs";

// Parsing is isolated in argument-clauses.mjs. The NLI scoring and
// conservative evidence-abstention policy below are unchanged.

export const ARGUMENT_LABELS = ["contradictory_claims", "unsupported_conclusion", "supported_conclusion"];

// The combined premise is needed for genuinely multi-step inferences, but
// sentence-pair NLI models can lose a clear signal when an irrelevant sentence
// is concatenated with the decisive premise. Keep both views of the evidence.
function normalizedAssertion(text) {
 return text.toLowerCase().replace(/^[\s"'“”‘’]+|[\s"'“”‘’.!?;:,]+$/g, "")
  .replace(/\s+/g, " ").trim();
}
function scoresValid(scores) {
 return scores && ["contradiction", "neutral", "entailment"].every(
  key => Number.isFinite(scores[key]));
}
// A subset doesn't disprove a universal claim: "platform two is accessible"
// is not evidence that *every* platform is accessible, but neither is it
// evidence against that proposition. Keep quantifier scope separate from
// semantic polarity instead of relying on raw NLI contradiction scores.
const UNIVERSAL = /\b(?:all|every|each)\s+([a-z][a-z'-]*)\b/gi;
const EXPLICIT_RESTRICTION_OR_NEGATION =
 /\b(?:not|no|never|none|nothing|neither|without|only|except|cannot|can't|won't|wasn't|isn't|aren't|doesn't|didn't|don't)\b/i;
const OPPOSING_WORDS = [
 [/\b(?:open|opened)\b/i, /\b(?:closed|shut)\b/i],
 [/\b(?:accessible|accessibility)\b/i, /\b(?:inaccessible)\b/i],
 [/\b(?:safe|safely)\b/i, /\b(?:unsafe|dangerous|hazardous)\b/i],
 [/\b(?:passed|passing|pass)\b/i, /\b(?:failed|failing|fail)\b/i],
 [/\b(?:allowed|permitted)\b/i, /\b(?:banned|prohibited|forbidden)\b/i],
 [/\b(?:available)\b/i, /\b(?:unavailable)\b/i],
 [/\b(?:working|operational)\b/i, /\b(?:broken|inoperable)\b/i],
 [/\b(?:present|exists?)\b/i, /\b(?:absent|missing)\b/i]
];
function singular(word) {
 return word.endsWith("ies") && word.length > 4 ? word.slice(0,-3) + "y" :
  word.endsWith("s") && !word.endsWith("ss") && word.length > 3 ?
   word.slice(0,-1) : word;
}
function scopeWidening(premise, conclusion) {
 if (!premise || !conclusion ||
     EXPLICIT_RESTRICTION_OR_NEGATION.test(premise) ||
     EXPLICIT_RESTRICTION_OR_NEGATION.test(conclusion) ||
     OPPOSING_WORDS.some(([a,b]) =>
      (a.test(premise) && b.test(conclusion)) ||
      (b.test(premise) && a.test(conclusion)))) return false;

 const words = new Set((premise.toLowerCase().match(/[a-z][a-z'-]*/g) || [])
  .map(singular));
 const premiseUniversals = new Set(
  [...premise.matchAll(UNIVERSAL)].map(match => singular(match[1].toLowerCase())));
 for (const match of conclusion.matchAll(UNIVERSAL)) {
  const noun = singular(match[1].toLowerCase());
  if (words.has(noun) && !premiseUniversals.has(noun)) return true;
 }
 return false;
}

// A neutral NLI score means "not entailed", NOT "no reasonable evidential
// support". A red unsupported finding needs an *observable overclaim*,
// not merely a semantic-model neutral prediction.
//
// Conservative, fast, domain-general indicators: categorical universals,
// absolute guarantees, superlatives and claims of total resolution. These are
// signals to scrutinise the scope of the provided evidence, not proof that
// the conclusion is false. Qualified claims are not automatically supported;
// without an entailment signal, they must abstain instead of turning red.
const UNIVERSAL_SCOPE =
 /\b(?:all|every|each|everyone|everybody|everything|entire|whole)\b/i;
const NEGATIVE_SCOPE =
 /\b(?:never|none|nobody|nothing|no|no one)\b/i;
const EXCLUSIVE_SCOPE =
 /\b(?:only|always)\b/i;
const CATEGORICAL_ABSOLUTES =
 /\b(?:completely|entirely|totally|absolutely|guaranteed|forever|everlasting|infallible|perfectly|flawless|zero|fully|eliminated|eradicated|solved|cured|proven|proved|definitively)\b/i;
const SUPERLATIVE_SCOPE =
 /\b(?:best|worst|safest|healthiest|highest|lowest|greatest|most|least|fastest|slowest|strongest|weakest|largest|smallest|certainly)\b/i;
const QUALIFIED_INFERENCE =
 /\b(?:may|might|could|can|perhaps|possibly|potentially|probably|plausibly|likely|unlikely|appears?|seems?|suggests?|indicates?|tends?\s+to|is\s+possible|is\s+plausible)\b/i;

// The claimed scope should not be considered broader just because the
// premise uses a universal too. The entailment model still determines
// whether the details actually match; if it is neutral we abstain.
function conclusionScopeCue(conclusion, premise) {
 // Distinguish *types* of quantification. "No damage in three
 // buildings" cannot justify "every building is safe"; a stray
 // negative word in the premise must not mask universal expansion.
 if (UNIVERSAL_SCOPE.test(conclusion) && !UNIVERSAL_SCOPE.test(premise))
  return "universal_scope";
 if (NEGATIVE_SCOPE.test(conclusion) && !NEGATIVE_SCOPE.test(premise))
  return "categorical_denial";
 if (EXCLUSIVE_SCOPE.test(conclusion) && !EXCLUSIVE_SCOPE.test(premise))
  return "exclusive_scope";
 if (CATEGORICAL_ABSOLUTES.test(conclusion) &&
     !CATEGORICAL_ABSOLUTES.test(premise))
  return "categorical_certainty";
 if (SUPERLATIVE_SCOPE.test(conclusion) &&
     !SUPERLATIVE_SCOPE.test(premise))
  return "comparative_superlative";
 // If both contain an absolute word, that does not mean they match,
 // but the lexical rule alone is insufficient to label the leap.
 return null;
}

export function assessNeutralArgumentEvidence(premise, conclusion, verdict) {
 if (!verdict || verdict.label !== "unsupported_conclusion")
  return { verdict, status:"model_verdict" };
 // A high NLI neutral score is just absence of deductive entailment.
 // Never turn cautious scientific/causal claims into red errors solely
 // from that signal. Explicit categorical assertions still need
 // independent evidence for their full scope.
 if (QUALIFIED_INFERENCE.test(conclusion))
  return { verdict:null, status:"evidential_support_uncertain",
   reason:"qualified_claim_not_entailed" };
 const cue = conclusionScopeCue(conclusion, premise);
 if (cue) return { verdict:{...verdict,
  reason:"observable_overclaim_" + cue},
  status:"observable_overclaim", reason:"observable_overclaim_" + cue };
 return { verdict:null, status:"evidential_support_uncertain",
  reason:"neutral_or_asymmetric_nli_is_not_sufficient_to_judge_support" };
}

export function classifyArgumentScore(forward, reverse = null) {
 if (!scoresValid(forward)) return null;
 const { contradiction, neutral, entailment } = forward;
 if (contradiction >= 0.84 && contradiction > neutral && contradiction > entailment) {
  if (scoresValid(reverse) && reverse.contradiction >= 0.70 &&
      reverse.contradiction > reverse.neutral)
   return { label: "contradictory_claims",
    score: Math.min(contradiction, reverse.contradiction) };
  // The local NLI model sometimes scores an unrelated conclusion as
  // contradiction in one direction but emphatically *not* in reverse.
  // That does not prove a genuine contradiction. Treat a very strong,
  // highly asymmetric score only as a *candidate* unsupported inference.
  // The separate evidential gate can still ABSTAIN with no red underline.
  if (contradiction >= 0.95 && scoresValid(reverse) &&
      reverse.contradiction <= 0.15)
   return { label: "unsupported_conclusion",
    score: Math.min(contradiction, 1 - reverse.contradiction),
    reason: "asymmetric_nli" };
  return null;
 }
 if (entailment >= 0.76 && entailment > contradiction + 0.15 &&
     entailment > neutral + 0.15)
  return { label: "supported_conclusion", score: entailment };
 if (neutral >= 0.78 && neutral > entailment + 0.15 &&
     neutral > contradiction + 0.15)
  return { label: "unsupported_conclusion", score: neutral, reason:"nli_neutral" };
 // Ambiguous model output: do not turn uncertainty into a red accusation.
 return null;
}

// A verdict supported by any individual premise is better than a neutral
// verdict caused by adding irrelevant premises to the same NLI input.
// A contradictory premise wins over a supporting one: the supplied set of
// premises is then internally inconsistent. Uncertain scores abstain.
export function combineArgumentEvidence(scored, conclusionText = "") {
 const classified = scored.map(item => {
  let verdict = item.repeated
   ? { label: "supported_conclusion", score: 1 }
   : classifyArgumentScore(item.forward, item.reverse);
  // NLI occasionally calls "one platform is accessible" contradictory to
  // "every platform is accessible." The first is narrower evidence, not an
  // assertion that any other platform is inaccessible. Only downgrade a
  // contradiction when the positive quantifier expands the stated scope
  // without explicit opposing evidence. Do not change genuine negations.
  if (verdict?.label === "contradictory_claims" &&
      scopeWidening(item.text, conclusionText))
   verdict = { label: "unsupported_conclusion",
    score: verdict.score, reason: "scope_expansion" };
  const evidence = assessNeutralArgumentEvidence(item.text, conclusionText, verdict);
  return { ...item, verdict:evidence.verdict, evidenceStatus:evidence.status,
   evidenceReason:evidence.reason || null };
 });
 for (const type of ["contradictory_claims", "supported_conclusion", "unsupported_conclusion"]) {
  const matches = classified.filter(item => item.verdict?.label === type);
  if (matches.length) {
   const winner = matches.sort((a, b) => b.verdict.score - a.verdict.score)[0];
   return { ...winner.verdict, evidenceText: winner.text, basis: winner.kind,
    status: winner.evidenceStatus || "model_verdict" };
  }
 }
 // Preserve a separate reason when the conclusion is unassessed.
 // No claim about its truth or evidential soundness can be derived
 // from a neutral entailment classification.
 const abstained = classified.find(item =>
  item.evidenceStatus === "evidential_support_uncertain");
 if (abstained) return {
  label:null, status:"evidential_support_uncertain",
  reason:abstained.evidenceReason, evidenceText:abstained.text,
  basis:abstained.kind
 };
 return null;
}

export async function analyseArguments(source, scorePair,
 { onProgress, onDiagnostic } = {}) {
 if (typeof scorePair !== "function") return [];
 const candidates = extractArguments(source);
 const assessments = [];
 for (let i = 0; i < candidates.length; i++) {
  const argument = candidates[i];
  onProgress?.({ completed: i, total: candidates.length });

  const texts = [
   { kind: "combined", text: argument.premise },
   ...argument.premises.map((statement, index) => ({
    kind: "premise_" + (index + 1), text: statement.text
   }))
  ].filter((item, index, all) =>
   all.findIndex(other => other.text === item.text) === index);

  const scored = [];
  for (const item of texts) {
   const repeated = normalizedAssertion(item.text) ===
    normalizedAssertion(argument.conclusion.text);
   // Exact repetition is safely supported without trusting model scores;
   // all other comparisons use the actual local NLI model.
   const forward = repeated
    ? { contradiction: 0, neutral: 0, entailment: 1 }
    : await scorePair(item.text, argument.conclusion.text);
   let reverse = null;
   if (scoresValid(forward) && forward.contradiction >= 0.84 &&
       forward.contradiction > forward.neutral)
    reverse = await scorePair(argument.conclusion.text, item.text);
   scored.push({ ...item, repeated, forward, reverse });
  }
  const result = combineArgumentEvidence(scored, argument.conclusion.text);
  onDiagnostic?.({
   conclusion: argument.conclusion.text,
   inferenceMarker: argument.conclusion.marker,
   inline: argument.conclusion.inline || false,
   comparisons: scored.map(({ kind, text, repeated, forward, reverse }) =>
    ({ kind, premise: text, repeated, forward, reverse })),
   verdict: result?.label || null,
   status:result?.status || (result?.label ? "model_verdict" : "model_uncertain"),
   reason: result?.reason || null
  });
  if (!result?.label) continue;
  assessments.push({ ...argument, ...result,
   explanation: result.label === "supported_conclusion"
    ? "The supplied premises appear to support this conclusion at the stated level."
    : result.label === "contradictory_claims"
     ? "The stated conclusion appears to conflict with the supplied premises."
     : "Insufficient evidence provided to support this conclusion. This does not mean the conclusion is false."
  });
 }
 onProgress?.({ completed: candidates.length, total: candidates.length });
 return assessments;
}

export function argumentFindings(assessments) {
 // Only affirmative error findings receive red underlines. An abstention,
 // including "insufficient evidence to judge", is never a finding.
 return assessments.filter(item =>
  item.label === "contradictory_claims" ||
  item.label === "unsupported_conclusion").map(item => ({
  kind: "argument_support",
  start: item.conclusion.start, end: item.conclusion.end,
  method: "inference", strength: "Check context", score: item.score,
  otherText: item.premise, conclusionText: item.conclusion.text,
  technique: item.label === "contradictory_claims"
   ? { id: "contradictory_claims", title: "Conclusion contradicts premises",
       summary: item.explanation, category: "Inconsistency" }
   : { id: "unsupported_conclusion", title: "Insufficient evidence for the conclusion",
       summary: item.explanation, category: "Inconsistency" }
 }));
}
