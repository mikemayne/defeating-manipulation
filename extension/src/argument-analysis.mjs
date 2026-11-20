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
const NORMATIVE = /\b(?:should|ought|perhaps|possibly|might|may|could|recommend|consider|prefer|hope|wish)\b/i;

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

export function extractArguments(source) {
 const statements = extractArgumentStatements(source);
 const argumentsFound = [];
 for (let i = 0; i < statements.length && argumentsFound.length < MAX_ARGUMENTS; i++) {
  const conclusion = explicitConclusion(statements[i]);
  if (!conclusion) continue;
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

export function classifyArgumentScore(forward, reverse = null) {
 if (!forward || !["contradiction","neutral","entailment"].every(
  key => Number.isFinite(forward[key]))) return null;
 const { contradiction, neutral, entailment } = forward;
 if (contradiction >= 0.84 && contradiction > neutral && contradiction > entailment) {
  if (!reverse || !Number.isFinite(reverse.contradiction) ||
      reverse.contradiction < 0.70 || reverse.contradiction <= reverse.neutral) return null;
  return { label: "contradictory_claims",
   score: Math.min(contradiction, reverse.contradiction) };
 }
 if (entailment >= 0.76 && entailment > contradiction + 0.15 &&
     entailment > neutral + 0.15)
  return { label: "supported_conclusion", score: entailment };
 if (neutral >= 0.78 && neutral > entailment + 0.15 &&
     neutral > contradiction + 0.15)
  return { label: "unsupported_conclusion", score: neutral };
 // Ambiguous model output: do not turn uncertainty into a red accusation.
 return null;
}

export async function analyseArguments(source, scorePair, { onProgress } = {}) {
 if (typeof scorePair !== "function") return [];
 const candidates = extractArguments(source);
 const assessments = [];
 for (let i = 0; i < candidates.length; i++) {
  const argument = candidates[i];
  onProgress?.({ completed: i, total: candidates.length });
  const forward = await scorePair(argument.premise, argument.conclusion.text);
  let reverse = null;
  if (forward?.contradiction >= 0.84 && forward.contradiction > forward.neutral)
   reverse = await scorePair(argument.conclusion.text, argument.premise);
  const result = classifyArgumentScore(forward, reverse);
  if (!result) continue;
  assessments.push({ ...argument, ...result,
   // Purely an assessment of these premises, not an absolute statement of truth.
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
 return assessments.filter(item => item.label !== "supported_conclusion").map(item => ({
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
