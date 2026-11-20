import { extractArguments } from "./argument-clauses.mjs";
import { normaliseClaimForNli } from "./argument-claim-normalisation.mjs";
import { normaliseEntitiesForNli, normaliseEntityTextForNli } from "./argument-entity-normalisation.mjs";
import { explicitConflict, specificEvidenceGap } from "./argument-evidence-checks.mjs";
import { observableContradiction, observableSamplingLeap } from "./argument-claim-relations.mjs";
import { boundedArgumentLogic } from "./argument-bounded-logic.mjs";
import { observableOverreach } from "./argument-overreach.mjs";
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
// NLI is a sentence-pair classifier, not a proof engine. Use its scores as
// candidates, then check whether the *actual evidence and conclusion* contain
// an observable mismatch. This is a deliberately conservative policy.
export function assessNeutralArgumentEvidence(premise, conclusion, verdict) {
 if (!verdict || verdict.label !== "unsupported_conclusion")
  return { verdict, status:"model_verdict" };
 const gap = specificEvidenceGap(premise, conclusion);
 if (gap.verified)
  return { verdict:{...verdict, reason:gap.reason}, status:"observable_overclaim",
   reason:gap.reason };
 // An NLI neutral prediction, comparative word, or universal quantifier alone
 // cannot establish that the supplied argument is invalid.
 return { verdict:null, status:"evidential_support_uncertain",
  reason:"no_specific_evidence_gap" };
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
export function combineArgumentEvidence(scored, conclusionText = "", {inferenceMarker=""} = {}) {
 // Structured arithmetic, explicit exclusions and a limited set of
 // quantified conditions are more reliable than MNLI guesses. Keep them
 // separate from neural probabilities and ensure contradictory evidence wins.
 const complete = scored.find(item => item.kind === "combined")?.text || scored[0]?.text || "";
 const bounded = boundedArgumentLogic(complete, conclusionText);
 // An overclaim needs an observable *scope leap*, not merely an NLI-neutral
 // score. Explicit contradictions and bounded entailments take precedence.
 const overreach = !bounded &&
   !observableContradiction(complete, conclusionText).verified &&
   !explicitConflict(complete, conclusionText).verified
   ? observableOverreach(complete, conclusionText, {inferenceMarker}) : null;
 const classified = scored.map(item => {
  let verdict = item.repeated
   ? { label: "supported_conclusion", score: 1 }
   : classifyArgumentScore(item.forward, item.reverse);
  let evidence = null;
  // The NLI model has returned confident entailment for literal opposites.
  // For very narrow, same-scope propositions, a deterministic relation
  // check can override that error; uncertain cases still abstain.
  const otherPremises = scored.some(s => s.kind.startsWith("premise_"));
  const atomic = !(item.kind === "combined" && otherPremises);
  const direct = atomic
   ? observableContradiction(item.text, conclusionText) : {verified:false};
  const leap = atomic && !direct.verified
   ? observableSamplingLeap(item.text, conclusionText) : {verified:false};
  if (direct.verified) {
   verdict = {label:"contradictory_claims",score:1,
    reason:"rule_based_"+direct.reason};
   evidence = {verdict,status:"verified_explicit_relation",reason:direct.reason};
  } else if (leap.verified && !explicitConflict(item.text,conclusionText).verified) {
   verdict = {label:"unsupported_conclusion",score:1,
    reason:"rule_based_"+leap.reason};
   evidence = {verdict,status:"verified_sample_scope_leap",reason:leap.reason};
  }
  if (!evidence && verdict?.label === "contradictory_claims") {
   const conflict = explicitConflict(item.text, conclusionText);
   if (!conflict.verified) {
    // Extremely high bidirectional NLI disagreement can still be a spurious
    // comparison of different claims (as in the election-majority pilot).
    const gap = specificEvidenceGap(item.text, conclusionText);
    if (gap.verified) verdict = { label:"unsupported_conclusion",
     score:verdict.score, reason:gap.reason };
    else {
     verdict = null;
     evidence = { verdict:null, status:"evidential_support_uncertain",
      reason:"nli_contradiction_without_explicit_conflict" };
    }
   }
  }
  if (!evidence)
   evidence = assessNeutralArgumentEvidence(item.text, conclusionText, verdict);
  return { ...item, verdict:evidence.verdict, evidenceStatus:evidence.status,
   evidenceReason:evidence.reason || null };
 });
 if (bounded) classified.push({
  kind:"bounded_relation", text:complete,
  verdict:{label:bounded.label, score:1, reason:bounded.reason},
  evidenceStatus:"verified_bounded_relation", evidenceReason:bounded.reason
 });
 if (overreach) classified.push({
  kind:"overreach_relation", text:complete,
  verdict:{label:"unsupported_conclusion",score:1,reason:overreach.reason},
  evidenceStatus:"verified_scope_overreach",evidenceReason:overreach.reason
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
  // A public post may elide a shared subject: use the completed proposition
  // only for inference, never replace the source text or underline offsets.
  const normalised = normaliseClaimForNli(argument);
  // First bring uniquely identified names, roles and subject pronouns to
  // a shared referent for NLI only. The claim-completion pass is separate.
  const entities = normaliseEntitiesForNli(argument, normalised.text);
  const hypothesis = entities.hypothesis;
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
   const modelPremise = normaliseEntityTextForNli(item.text, entities);
   const repeated = normalizedAssertion(modelPremise) ===
    normalizedAssertion(hypothesis);
   // Exact repetition is safely supported without trusting model scores;
   // all other comparisons use the actual local NLI model.
   const forward = repeated
    ? { contradiction: 0, neutral: 0, entailment: 1 }
    : await scorePair(modelPremise, hypothesis);
   let reverse = null;
   if (scoresValid(forward) && forward.contradiction >= 0.84 &&
       forward.contradiction > forward.neutral)
    reverse = await scorePair(hypothesis, modelPremise);
   scored.push({ ...item, modelPremise, repeated, forward, reverse });
  }
  // Explicit-logic checks continue to use the original statements and
  // completed *source* conclusion, not canonicalised NLI text.
  const result = combineArgumentEvidence(scored, normalised.text, {inferenceMarker:argument.conclusion.marker});
  onDiagnostic?.({
   conclusion: argument.conclusion.text,
   modelConclusion: normalised.expanded || entities.changed ? hypothesis : null,
   entityNormalization: entities.changed ? {name:entities.name,canonical:entities.canonical} : null,
   inferenceMarker: argument.conclusion.marker,
   inline: argument.conclusion.inline || false,
   comparisons: scored.map(({ kind, text, modelPremise, repeated, forward, reverse }) =>
    ({ kind, premise: text, modelPremise: modelPremise!==text?modelPremise:null,
     repeated, forward, reverse })),
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
