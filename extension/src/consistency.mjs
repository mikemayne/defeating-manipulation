// A second, independent pass over the same user-selected text.
// The model scores relationships between claims; it never infers an author's motives.
const MAX_CLAIMS = 32;
const MAX_PAIRS = 48;
const STOP = new Set("a an and are as at be been being but by can could did do does for from had has have he her hers him his i in is it its me my no not of on or our ours she so than that the their them there these they this those to was were we what when where who why will with would you your yours".split(" "));
const words = sentence => new Set((sentence.toLowerCase().match(/[a-z0-9]{3,}/g) || [])
 .filter(word => !STOP.has(word)));
const temporal = sentence => (sentence.toLowerCase().match(/\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|yesterday|tomorrow|last year|next year|in 20\d\d)\b/g) || []).join(" ");

// Distinguish a claim made by the writer from a report of what somebody said.
// "The manager said X. The spokesperson said not-X." reports disagreement,
// not an internally contradictory article. Only use clear leading attributions;
// ambiguous wording is left for the existing NLI/context checks.
export function attributedSource(sentence) {
 const text = sentence.trim();
 let match = text.match(/^(?:(?:the|an?|our)\s+)?([a-z][a-z'-]*(?:\s+[a-z][a-z'-]*){0,3}?)\s+(?:(?:later|earlier|previously|again|also)\s+)?(?:said|says|stated|states|claimed|claims|reported|reports|announced|announces|argued|argues|maintained|maintains|insisted|insists|asserted|asserts|wrote|writes|testified|testifies)\b/i);
 if (!match) {
  match = text.match(/^(?:according to|as (?:stated|reported) by)\s+(?:(?:the|an?|our)\s+)?([a-z][a-z'-]*(?:\s+[a-z][a-z'-]*){0,3})\s*[,;]/i);
 }
 return match ? match[1].toLowerCase().replace(/\s+/g, " ") : null;
}

export function extractClaims(source) {
 const claims = [];
 // Split on sentence terminators, semicolons and explicit line boundaries.
 const pattern = /[^.!?;\n]+(?:[.!?;]+|$)/g;
 let match;
 while ((match = pattern.exec(source)) !== null) {
  const raw = match[0], first = raw.search(/\S/);
  if (first < 0) continue;
  const start = match.index + first;
  const end = match.index + raw.trimEnd().length;
  const text = source.slice(start, end);
  if (text.length > 400 || (text.match(/\b[\w'-]+\b/g) || []).length < 4 ||
      /\?\s*$/.test(text) ||
      /^(?:if|suppose|imagine|hypothetically|for example|e\.g\.)\b/i.test(text)) continue;
  claims.push({ text, start, end, attributedTo: attributedSource(text) });
  if (claims.length >= MAX_CLAIMS) break;
 }
 return claims;
}

export function candidatePairs(claims) {
 const ranked = [];
 const tokenSets = claims.map(item => words(item.text));
 for (let i = 0; i < claims.length; i++) {
  for (let j = i + 1; j < claims.length && j <= i + 10; j++) {
   const a = tokenSets[i], b = tokenSets[j];
   const common = [...a].filter(word => b.has(word)).length;
   // Adjacent statements may describe the same subject with different words.
   if (!common && j !== i + 1) continue;
   // Different explicit periods do not, on their own, contradict each other.
   const t1 = temporal(claims[i].text), t2 = temporal(claims[j].text);
   if (t1 && t2 && t1 !== t2) continue;
   // Reports from distinct identifiable speakers can disagree without the
   // surrounding passage making two incompatible claims of its own.
   if (claims[i].attributedTo && claims[j].attributedTo &&
       claims[i].attributedTo !== claims[j].attributedTo) continue;
   ranked.push({ i, j, rank: 3 * common + 2 / (j - i) });
  }
 }
 return ranked.sort((a, b) => b.rank - a.rank).slice(0, MAX_PAIRS);
}

// scorePair returns { contradiction, neutral, entailment } from a local NLI model.
export async function findInconsistencies(source, scorePair) {
 const claims = extractClaims(source);
 if (claims.length < 2 || typeof scorePair !== "function") return [];
 const findings = [];
 for (const { i, j } of candidatePairs(claims)) {
  const first = claims[i], second = claims[j];
  const forward = await scorePair(first.text, second.text);
  if (!forward || forward.contradiction < 0.84 ||
      forward.contradiction <= forward.neutral) continue;
  // Contradiction is symmetric. Checking both directions reduces spurious hits.
  const reverse = await scorePair(second.text, first.text);
  if (!reverse || reverse.contradiction < 0.7 ||
      reverse.contradiction <= reverse.neutral) continue;
  const score = Math.min(forward.contradiction, reverse.contradiction);
  const technique = {
   id: "argument_inconsistency",
   title: "Possible inconsistency",
   summary: "These statements appear to conflict. Check whether they concern the same subject, time and circumstances.",
   category: "Inconsistency"
  };
  for (const [claim, other] of [[first, second], [second, first]]) {
   findings.push({ kind: "inconsistency", start: claim.start, end: claim.end,
    technique, method: "inference", strength: "Check context",
    otherText: other.text, score });
  }
 }
 return findings;
}

// Red takes precedence when the two passes identify overlapping text.
// Splitting at all boundaries preserves the other colours outside red spans.
export function visibleHighlights(matches, sourceLength) {
 const valid = matches.filter(m => Number.isInteger(m.start) && Number.isInteger(m.end) &&
  m.start >= 0 && m.end > m.start && m.end <= sourceLength);
 const edges = [...new Set(valid.flatMap(m => [m.start, m.end]))].sort((a, b) => a - b);
 const result = [];
 for (let i = 0; i + 1 < edges.length; i++) {
  const start = edges[i], end = edges[i + 1];
  const candidates = valid.filter(m => m.start <= start && m.end >= end);
  if (!candidates.length) continue;
  candidates.sort((a, b) =>
   Number(b.kind === "inconsistency") - Number(a.kind === "inconsistency") ||
   (b.score || 0) - (a.score || 0));
  const match = candidates[0];
  const previous = result[result.length - 1];
  if (previous && previous.original === match && previous.end === start) {
   previous.end = end;
  } else {
   result.push({ ...match, start, end, original: match });
  }
 }
 return result.map(({ original, ...match }) => match);
}
