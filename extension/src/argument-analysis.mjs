import { attributedSource } from "./consistency.mjs";

// Third local NLI pass: what do the passage's own premises establish?
// Explicit inferential links only; no guesses about the author's intentions.
// A NEUTRAL NLI result can support "not established by the cited evidence",
// but cannot establish that a conclusion is false or that no other evidence exists.
const MAX_STATEMENTS = 80;
const MAX_ARGUMENTS = 8;
const MAX_PREMISES = 5;
const MAX_PREMISE_CHARS = 780;
const MAX_CONCLUSION_CHARS = 280;
const MAX_PARAGRAPH_BREAKS = 1;
const MARKER = /^(?:(?:and|but)\s+)?(therefore|thus|hence|consequently|accordingly|as a result|it follows that|we can conclude that|this (?:shows|proves|demonstrates|confirms|means)(?: that)?|these (?:results|findings) (?:show|prove|demonstrate)(?: that)?|the evidence (?:shows|proves)(?: that)?|so)\s*[,:\s]\s*/i;
// A cautious scientific prediction is a factual inference to assess, not
// a recommendation to abstain from. "Might have occurred" and "can test"
// are different from "we should consider".
const NORMATIVE = /\b(?:should|ought|recommend|consider|prefer|hope|wish)\b|\b(?:we|you)\s+(?:(?:may|might|could|can)\s+)?(?:need to|want to|plan to|intend to)\b/i;
// A limited set of directly expressed within-sentence conclusions. The
// pre-marker clause supplies a premise; the post-marker clause is the claim.
// This only locates the inference; it is never evidence that it is valid.
const INLINE_MARKER = /,\s*(?:which|and this)\s+(?:means|suggests|implies)(?:\s+that)?\s+|\b(?:indicates|suggests|implies|demonstrates|shows|indicating|suggesting|implying|showing)\s+that\s+/gi;


export function extractArgumentStatements(source) {
 if (typeof source !== "string") return [];
 const statements = [];
 const pattern = /[^.!?;\n]+(?:[.!?;]+|$)/g;
 let found;
 while ((found = pattern.exec(source)) !== null && statements.length < MAX_STATEMENTS) {
  const raw = found[0], lead = raw.search(/\S/);
  if (lead < 0) continue;
  const start = found.index + lead, end = found.index + raw.trimEnd().length;
  const text = source.slice(start, end);
  if (text.length > 550 || (text.match(/\b[\w'-]+\b/g) || []).length < 3) continue;
  statements.push({ start, end, text });
 }
 return statements;
}
function paragraphBreaks(between) {
 // Two line breaks separate paragraphs; four separate an unrelated section.
 return Math.floor((between.match(/\n/g) || []).length / 2);
}

function explicitConclusion(statement) {
 if (/[?!]\s*$/.test(statement.text) || attributedSource(statement.text)) return null;
 const match = MARKER.exec(statement.text);
 if (!match) return null;
 let start = statement.start + match[0].length;
 while (/\s/.test(statement.text[start - statement.start] || "") && start < statement.end)
  start++;
 const text = statement.text.slice(start - statement.start).trim();
 if (text.length < 12 || text.length > MAX_CONCLUSION_CHARS ||
     !/[a-z]{3}/i.test(text) || /[?]\s*$/.test(text)) return null;
 // Advice, permissions and tentative suggestions need different reasoning
 // criteria from factual entailment; abstain rather than calling them errors.
 if (NORMATIVE.test(text)) return null;
 return { start, end: statement.end, text, marker: match[1].toLowerCase() };
}

function extractInlineArgument(statement) {
 if (/[?!]\s*$/.test(statement.text) || attributedSource(statement.text)) return null;
 INLINE_MARKER.lastIndex = 0;
 let match;
 while ((match = INLINE_MARKER.exec(statement.text)) !== null) {
  const before = statement.text.slice(0, match.index);
  const after = statement.text.slice(INLINE_MARKER.lastIndex).trim();
  // Do not treat "the report suggests X" or an empty conclusion as an
  // evidential argument. Preserve the pre-marker clause verbatim.
  if ((before.match(/\b[\w'-]+\b/g) || []).length < 7 ||
      after.length < 12 || after.length > MAX_CONCLUSION_CHARS ||
      NORMATIVE.test(after)) continue;
  const leading = before.search(/\S/);
  const premiseEnd = before.trimEnd().replace(/[,;]\s*$/, "").trimEnd().length;
  if (leading < 0 || premiseEnd <= leading) continue;
  const premise = {
   start: statement.start + leading,
   end: statement.start + premiseEnd,
   text: statement.text.slice(leading, premiseEnd)
  };
  // Position the conclusion after its marker while preserving all original
  // source offsets, including punctuation and capitalization.
  const offset = statement.text.slice(INLINE_MARKER.lastIndex).search(/\S/);
  if (offset < 0) continue;
  const conclusion = {
   start: statement.start + INLINE_MARKER.lastIndex + offset,
   end: statement.end,
   text: statement.text.slice(INLINE_MARKER.lastIndex + offset),
   marker: match[0].trim().toLowerCase(),
   inline: true
  };
  if (conclusion.text.trim() !== after) continue;
  return { premise: premise.text, premises: [premise],
   conclusion, start: premise.start, end: conclusion.end };
 }
 return null;
}

export function extractArguments(source) {
 const statements = extractArgumentStatements(source);
 const argumentsFound = [];
 for (let i = 0; i < statements.length && argumentsFound.length < MAX_ARGUMENTS; i++) {
  const conclusion = explicitConclusion(statements[i]);
  if (!conclusion) {
   const inline = extractInlineArgument(statements[i]);
   if (inline) argumentsFound.push(inline);
   continue;
  }
  const preceding = [], end = statements[i].start;
  let usedChars = 0, totalParagraphBreaks = 0, cursor = end;
  for (let j = i - 1; j >= 0 && preceding.length < MAX_PREMISES; j--) {
   const sentence = statements[j];
   totalParagraphBreaks += paragraphBreaks(source.slice(sentence.end, cursor));
   if (totalParagraphBreaks > MAX_PARAGRAPH_BREAKS) break;
   if (usedChars + sentence.text.length + 1 > MAX_PREMISE_CHARS) break;
   // A separate heading/quoted claim must not silently become a premise.
   if (sentence.text.trim().startsWith(">")) break;
   preceding.unshift(sentence);
   usedChars += sentence.text.length + 1;
   cursor = sentence.start;
  }
  if (!preceding.length) continue;
  const premise = preceding.map(item => item.text).join(" ");
  argumentsFound.push({ premise, premises: preceding, conclusion, start: preceding[0].start, end: conclusion.end });
 }
 return argumentsFound;
}

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
const CLAIMED_UNIVERSALS =
 /\b(?:all|every|each|everyone|everybody|everything|entire|whole|only|always|never|none|nobody|nothing|no|no one|everyone's)\b/i;
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
 if (CLAIMED_UNIVERSALS.test(conclusion) &&
     !CLAIMED_UNIVERSALS.test(premise))
  return "universal_scope";
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
   return { ...winner.verdict, evidenceText: winner.text, basis: winner.kind };
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
