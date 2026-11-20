import catalogue from "./concealed-patterns.json" with { type: "json" };
import { attributedSource } from "./consistency.mjs";

// An explicit relationship classifier. Positive + negative nearby is not
// sufficient: the second passage must retract freedom, dissent, independent
// choice or empathy through a concrete demand, penalty, or shaming condition.
// It does NOT determine whether a writer intended to deceive.
function compile(patterns) {
 return patterns.map(pattern => ({
  ...pattern,
  positiveRegexes: pattern.positiveCues.map(expression => new RegExp(expression, "ig")),
  negativeRegexes: pattern.negativeCues.map(expression => new RegExp(expression, "ig"))
 }));
}

export const concealedPatterns = compile(catalogue.patterns);
const MAX_GAP = catalogue.maxGap || 260;
const quoteOrReport = /\b(?:according to|reported|quoted|described|example|phrases? (?:like|such as)|said|stated|claimed|wrote|told)\b/i;
const linking = /\b(?:but|however|yet|unless|otherwise|except|only if|although|in fact|instead)\b/i;
const directPressure = /\b(?:must|have to|need to|are required to|or else|if you (?:don't|do not|won't|refuse)|unless you|you(?:'ll| will) (?:lose|be (?:punished|excluded|fired|removed|banned|shamed))|we(?:'ll| will) (?:punish|fire|exclude|ban|remove|shame|expose)|if you really cared|if you (?:valued|loved|respected)|a (?:good|decent|loyal) (?:friend|colleague|parent|person|teammate) would|if you disagree|you(?:'re| are) (?:selfish|disloyal|ungrateful)|the only acceptable)\b/i;
const boundary = /[.!?]/g;

function hits(text, expressions) {
 const result = [];
 for (const regex of expressions) {
  regex.lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
   if (!match[0]) { regex.lastIndex++; continue; }
   result.push({ start: match.index, end: regex.lastIndex, text: match[0], origin: "cue" });
  }
 }
 return result;
}
function sentenceAt(text, offset) {
 const before = text.slice(0, offset);
 const start = Math.max(before.lastIndexOf("."), before.lastIndexOf("?"),
  before.lastIndexOf("!"), before.lastIndexOf("\n")) + 1;
 const rest = text.slice(offset);
 const next = rest.search(/[.!?\n]/);
 const end = next < 0 ? text.length : offset + next + 1;
 return { start, end, text: text.slice(start, end).trim() };
}
function reportingFrame(text, hit) {
 const sentence = sentenceAt(text, hit.start);
 // Do not mistake a journalist quoting examples of phrases for the author
 // making the demand. Also avoid comparing conflicting named speakers.
 const preceding = text.slice(sentence.start, hit.start);
 return quoteOrReport.test(preceding);
}
function compatibleSource(text, positive, negative) {
 const pos = sentenceAt(text, positive.start), neg = sentenceAt(text, negative.start);
 const a = attributedSource(pos.text), b = attributedSource(neg.text);
 if (a && b && a !== b) return false;
 if (reportingFrame(text, negative) && !reportingFrame(text, positive)) return false;
 return true;
}
function sameArgument(text, positive, negative) {
 if (negative.start < positive.end || negative.start - positive.end > MAX_GAP) return false;
 const between = text.slice(positive.end, negative.start);
 // Do not connect separate paragraphs or unrelated intervening claims.
 if (/\n\s*\n/.test(between)) return false;
 if ((between.match(boundary) || []).length > 1) return false;
 // A local transition or directly coercive instruction is essential.
 return linking.test(between) || directPressure.test(negative.text);
}
function extendToClauseEnd(text, negative) {
 const tail = text.slice(negative.start, Math.min(text.length, negative.start + 270));
 const boundaryIndex = tail.search(/[.!?;\n]/);
 return boundaryIndex < 0 ? Math.min(text.length, negative.start + tail.length)
  : negative.start + boundaryIndex + 1;
}
function uniqueByStart(candidates) {
 const seen = new Set();
 return candidates.filter(item => {
  const key = item.start + ":" + item.end;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
 });
}
function matchedAnchors(text, matches, ids) {
 const allowed = new Set(ids);
 return matches.filter(match => allowed.has(match.technique?.id) &&
   Number.isInteger(match.start) && Number.isInteger(match.end) &&
   match.end > match.start && match.end <= text.length &&
   // A broad semantic window spanning both sides of an argument is not a
   // reliable anchor. Require a local positive span.
   match.end - match.start <= 170)
  .map(match => ({
   start: match.start, end: match.end,
   text: text.slice(match.start, match.end), origin: "stage-one"
  }));
}

export function findConcealedPatterns(text, { positiveMatches = [], negativeMatches = [] } = {}) {
 if (typeof text !== "string" || !text.trim()) return [];
 const detected = [];
 for (const pattern of concealedPatterns) {
  const positives = uniqueByStart([
   ...hits(text, pattern.positiveRegexes),
   ...matchedAnchors(text, positiveMatches, pattern.positiveIds)
  ]).sort((a, b) => a.start - b.start);
  const negatives = hits(text, pattern.negativeRegexes).sort((a, b) => a.start - b.start);
  for (const negative of negatives) {
   const positive = positives.filter(candidate =>
    sameArgument(text, candidate, negative) &&
    compatibleSource(text, candidate, negative) &&
    !reportingFrame(text, candidate) &&
    // A generic quoted adverse event is not a coercive continuation of
    // the author's positive assurance.
    !reportingFrame(text, negative))
    .sort((a, b) => b.end - a.end)[0];
   if (!positive) continue;
   const end = extendToClauseEnd(text, negative);
   const technique = {
    id: pattern.id, title: pattern.title, summary: pattern.summary,
    category: "Concealed manipulation"
   };
   const confirmedNegative = negativeMatches.find(item =>
    pattern.negativeIds.includes(item.technique?.id) &&
    item.start < end && item.end > negative.start);
   detected.push({
    kind: "concealed", start: negative.start, end, technique,
    method: "relationship", strength: "Check context",
    positiveText: text.slice(positive.start, positive.end),
    negativeText: text.slice(negative.start, end),
    positivePattern: positiveMatches.find(item =>
     item.start < positive.end && item.end > positive.start)?.technique?.title || null,
    negativePattern: confirmedNegative?.technique?.title || null
   });
  }
 }
 // Overlapping phrases can instantiate more than one relational pattern.
 // Show a single turquoise highlight for each pressure passage.
 const selected = [];
 for (const match of detected.sort((a, b) =>
  a.start - b.start || (a.end - a.start) - (b.end - b.start))) {
  if (!selected.some(item => match.start < item.end && match.end > item.start))
   selected.push(match);
 }
 return selected;
}
