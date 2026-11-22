import { extractArguments } from "./argument-clauses.mjs";
import { attributedSource } from "./consistency.mjs";
import { preprocessText, originalRangeForAnalysis } from "./text-preprocessing.mjs";

const sentences = typeof Intl.Segmenter === "function"
 ? new Intl.Segmenter("en", { granularity: "sentence" }) : null;

function sentenceSegments(text) {
 return sentences?.segment(text) ?? Array.from(text.matchAll(/[^.!?]+[.!?]*|[.!?]+/g),
  match => ({ segment: match[0], index: match.index }));
}
const asides = /“[^”]*”|"[^"\n]*"|‘[^’]*’|(?<![\p{L}\p{N}])'[^'\n]+'(?![\p{L}\p{N}])|\([^()]*\)/gu;
const condition = /^(?:if|unless|provided that|as long as)\b/i;
const reason = /^(?:(?:this|that) is )?because\b/i;
const result = /^(?:therefore|consequently|as a result|otherwise|so)\b/i;
const contrast = /^(?:but|however|although|even though|yet)\b/i;
const directive = /^(?:please\s+)?(?:do not\s+|don't\s+)?(?:call|check|close|consider|contact|leave|let|look|open|pay|read|remember|send|sign|skip|stay|stop|take|tell|try|wait|watch)\b(?!\s+(?:is|was|will)\b)/i;
const finite = /\b(?:i|you|we|they|he|she|it|there|everyone)\s+(?:\w+|['’])|\b(?:is|are|was|were|will|would|can|may|must|has|have)\b|\b\w+ed\b/i;
const knownKnowledge = /^you (?:have (?:absolutely )?no (?:idea|clue)|(?:do not|don't) know)\b/i;
const vagueFuture = /\bwhat(?:'s| is) (?:coming|next|about to happen)\b/i;
const firstCondition = /^(?:if|unless)\s+you\s+(?:do not|don't|won't|refuse to|fail to)\s+([a-z]+)\b/i;
const imposedSanction = /^(?:then\s+)?i(?: will|'ll) (?:suspend your account|dock your pay|keep your deposit|cut your hours|cancel your access|remove you from the group)[.!]?$/i;
const unlessAction = /^unless you (?:agree|comply|cooperate|file|hand|remove|return|send|sign|submit|withdraw)\b(?!['\w])/i;
const thenOutcome = /^(?:then\s+)?(?:everyone|someone|somebody|they|i|we|you)\s+(?:will|'ll)\s+.+/i;

// A bounded English clause recognizer. Keep boundaries in working-copy coordinates
// until emitting each span so formatting and spelling edits cannot shift evidence.
export function analyzeStructure(source, { offset = 0, spellchecker } = {}) {
 const preprocessing = preprocessText(source, { spellchecker });
 const { analysisText } = preprocessing;
 const paragraphs = [];
 const span = (start, end) => {
  const raw = originalRangeForAnalysis(preprocessing, start, end);
  return { start: offset + raw.start, end: offset + raw.end, text: source.slice(raw.start, raw.end) };
 };
 const node = (kind, start, end) => {
  const range = span(start, end);
  return { id: `${kind}:${range.start}:${range.end}`, ...range };
 };
 for (const paragraphMatch of analysisText.matchAll(/\S[^\r\n]*(?:(?:\r\n|\n|\r)(?=[^\S\r\n]*[^\s\r\n])[^\r\n]+)*/g)) {
  const base = paragraphMatch.index;
  const passage = paragraphMatch[0].trimEnd();
  const paragraph = { ...node("paragraph", base, base + passage.length), sentences: [], edges: [] };
  const containers = [...passage.matchAll(asides)].map(match => ({
   start: match.index, end: match.index + match[0].length,
   kind: match[0].startsWith("(") ? "parenthetical" : "quotation"
  }));
  // Hide internal punctuation from the outer sentence/clause tokenizer.
  // Retain a terminal mark on quotes to support ordinary dialogue boundaries.
  let cursor = 0;
  const masked = containers.map(({start, end, kind}) => {
   const before = passage.slice(cursor, start);
   cursor = end;
   const terminal = kind === "quotation" ? passage[end - 2]?.match(/[.!?]/)?.[0] : null;
   return before + "x".repeat(end - start - Number(Boolean(terminal))) + (terminal ?? "");
  }).join("") + passage.slice(cursor);
  const direct = [];
  let previous;
  for (const {segment, index} of sentenceSegments(masked)) {
   const start = index + segment.search(/\S/);
   if (start < index) continue;
   const end = index + segment.trimEnd().length;
   const surface = passage.slice(start, end);
   const attributedTo = attributedSource(surface);
   const sentence = { ...node("sentence", base + start, base + end), attributedTo, clauses: [] };
   paragraph.sentences.push(sentence);
   const local = masked.slice(start, end);
   const cuts = [0];
   const introductory = condition.test(local) || /^(?:because|although|even though)\b/i.test(local);
   const boundaries = /[;:]\s*|,\s+(?=\S)|\s+(?=(?:because|unless|if|although|even though|but|and|or|yet)\b)/gi;
   for (const match of local.matchAll(boundaries)) {
    const next = match.index + match[0].length;
    const tail = local.slice(next);
    const head = local.slice(cuts.at(-1), match.index);
    const marked = /^(?:because|unless|if|although|even though)\b/i.test(tail);
    const coordinated = /^(?:but|and|or|yet)\b/i.test(tail);
    if (next > cuts.at(-1) && (match[0].startsWith(";") ||
        (match[0].startsWith(",") && introductory && cuts.length === 1 && !coordinated && (finite.test(tail) || directive.test(tail))) ||
        (marked && finite.test(tail) && /\S/.test(head) && !/\b(?:ask(?:ed)?|wonder(?:ed)?|know|check(?:ed)?)$/i.test(head.trim()) && !/^(?:this|that) is$/i.test(head.trim())) ||
        (coordinated && (finite.test(tail) || directive.test(tail.replace(/^\w+\s+/, "")))) ||
        (/^,/.test(match[0]) && result.test(tail)))) cuts.push(next);
   }
   cuts.push(local.length);
   const records = [];
   const addClause = (left, right, kind) => {
    const part = (kind ? passage : masked).slice(left, right);
    const leading = part.search(/[^\s,;:]/);
    if (leading < 0) return;
    left += leading;
    right = left + part.slice(leading).replace(/[\s,;:]+$/, "").length;
    const text = passage.slice(left, right);
    const clause = { ...node("clause", base + left, base + right),
     kinds: [kind ?? (condition.test(text) || /^because\b/i.test(text) || /^(?:although|even though)\b/i.test(text)
      ? "subordinate" : /^(?:and|or|but|yet)\b/i.test(text) ? "coordinated" : "main")],
     speechActs: [], features: [] };
    if (attributedTo) clause.kinds.push("reported_speech");
    sentence.clauses.push(clause);
    const wording = (kind ? passage : masked).slice(left, right).replace(/[‘’]/g, "'");
    const add = (list, type, match, basis = "explicit", scope) => {
     if (!match || clause[list].some(label => label.type === type)) return;
     clause[list].push({ type, basis, evidence: [span(base + left + match.index, base + left + match.index + match[0].length)],
      ...(scope ? { scope } : {}) });
    };
    const feature = (type, regex, basis) => add("features", type, regex.exec(wording), basis);
    const act = (type, regex, basis) => add("speechActs", type, regex.exec(wording), basis);
    const question = /\?\s*$/.test(wording) || (!kind && /^\s*(?:who|what|where|when|why|how|can|could|would|will|do|did|does|is|are|was|were|have|has)\b/i.test(wording) && /\?\s*$/.test(surface));
    if (question) act("question", /\?/);
    if (question) act("request", /^(?:could|can|would|will) you\b/i, "inferred");
    if (!question) act("instruction", directive, "inferred");
    if (!question && !clause.kinds.includes("subordinate") && !clause.speechActs.length)
     act("assertion", /\S[\s\S]*/, "inferred");
    act("suggestion", /\b(?:i suggest|i recommend|you (?:should|could))\b/i, "inferred");
    if (!question) act("prediction", /\b(?:will|won't|going to)\b|\b\w+'ll\b/i, "inferred");
    act("promise", /\b(?:i|we) (?:promise|pledge)\b/i);
    act("warning", /\b(?:warning|beware|watch out|i warn you)\b/i, "inferred");
    act("accusation", /\b(?:i accuse|you (?:lied|cheated|stole))\b/i, "inferred");
    act("evaluation", /\b(?:wrong|unfair|disgraceful|irresponsible|excellent)\b/i, "inferred");
    feature("condition", condition);
    feature("justification", reason);
    feature("consequence", result);
    feature("evidence", /\b(?:records|measurements|receipts|data|footage) (?:show|confirm|indicate)\b/i);
    feature("presupposition", /^(?:why did you|when did you|why have you)\b/i, "inferred");
    feature("loaded_wording", /\b(?:disgusting|traitor|idiot|disgraceful|pathetic)\b/i, "inferred");
    feature("negative_outcome", /\b(?:lose (?:your|the) |be (?:fired|evicted|excluded)|regret|dock your pay)\b/i, "inferred");
    feature("unspecified_actor", /\b(?:everyone|somebody|someone|some people|anyone|they)\b/i, "inferred");
    feature("unspecified_action", /\b(?:what you(?:'ve| have) done|do something)\b/i, "inferred");
    feature("unspecified_accusation", /\bwhat you(?:'ve| have) done\b/i, "inferred");
    feature("unspecified_future_event", vagueFuture, "inferred");
    feature("unspecified_consequence", vagueFuture, "inferred");
    feature("addressee_lacks_knowledge", knownKnowledge);
    feature("uncertainty", /\b(?:maybe|perhaps|possibly|might|i think|not sure)\b/i);
    feature("certainty", /\b(?:always|never|definitely|certainly|without exception)\b/i);
    feature("modal", /\b(?:can|could|may|might|must|shall|should|will|would)\b/i);
    feature("temporal", /\b(?:today|tomorrow|yesterday|next week|last year|afterwards)\b/i);
    const negation = /\b(?:not|no|never|cannot)\b|n't\b/i.exec(wording);
    if (negation) add("features", "negation", negation, "explicit",
     { ...span(base + left + negation.index, base + right), basis: "inferred" });
    const behavior = firstCondition.exec(wording);
    if (behavior) {
     add("features", "requested_behavior",
      { index: behavior[0].length - behavior[1].length, 0: behavior[1] }, "inferred");
    }
    if (kind === "quotation" || kind === "parenthetical") return;
    records.push({ clause, left, right, wording, add });
   };
   for (let i = 1; i < cuts.length; i++) {
    const left = start + cuts[i - 1], right = start + cuts[i];
    const enclosed = containers.filter(item => item.start >= left && item.end <= right);
    const outside = masked.slice(left, right).replace(/x{2,}/g, "");
    if (/\p{L}|\p{N}/u.test(outside)) addClause(left, right);
    for (const item of enclosed) addClause(item.start + 1, item.end - 1, item.kind);
   }
   direct.push(...records);
   const connect = (type, from, to, marker, basis = "explicit") => {
    if (!marker?.match || !from || !to || from.clause.kinds.includes("reported_speech") ||
        to.clause.kinds.includes("reported_speech")) return;
    const evidence = span(base + marker.record.left + marker.match.index,
     base + marker.record.left + marker.match.index + marker.match[0].length);
    const { id: fromId } = from.clause;
    const { id: toId } = to.clause;
    paragraph.edges.push({ id: `${type}:${fromId}:${toId}`, type, from: fromId, to: toId,
     basis, confidence: basis === "explicit" ? 0.9 : 0.55, evidence: [evidence] });
   };
   const cue = (record, expression) => record && { record, match: expression.exec(record.wording) };
   for (let i = 0; i < records.length; i++) {
    const current = records[i], prior = records[i - 1], next = records[i + 1];
    const marker = cue(current, condition);
    if (marker.match && !attributedTo) {
     const outcome = i === 0 ? next : prior;
     if (outcome && !condition.test(outcome.wording)) {
      connect("condition_consequence", current, outcome, marker);
      outcome.add("features", "consequence", /\S[\s\S]*/.exec(outcome.wording), "inferred");
      if (!/[?]\s*$/.test(surface) && unlessAction.test(current.wording) && imposedSanction.test(outcome.wording)) {
       outcome.add("features", "speaker_imposed_sanction", imposedSanction.exec(outcome.wording), "inferred");
       outcome.add("speechActs", "threat_like", imposedSanction.exec(outcome.wording), "inferred");
      }
      if (firstCondition.test(current.wording) && thenOutcome.test(outcome.wording) &&
          outcome.clause.features.some(label => label.type === "negative_outcome")) {
       outcome.add("speechActs", "threat_like", /\S[\s\S]*/.exec(outcome.wording), "inferred");
      }
     }
    }
    const conditionAfterInstruction = /^otherwise\b/i.exec(current.wording);
    if (conditionAfterInstruction && (prior ?? previous)?.clause.speechActs.some(act => act.type === "instruction"))
     connect("instruction_consequence", prior ?? previous, current, { record: current, match: conditionAfterInstruction });
    const because = cue(current, reason);
    if (because.match) connect("claim_justification", prior ?? (/^because\b/i.test(current.wording) ? next : previous),
     current, because);
    const consequence = cue(current, result);
    if (consequence.match && !conditionAfterInstruction) connect("statement_conclusion", prior ?? previous, current, consequence);
    const qualification = cue(current, contrast);
    if (qualification.match) connect("claim_qualification", prior ?? previous, current, qualification);
   }
   previous = records.at(-1);
  }
  // Reuse the explicit argument extractor. A supplied source is evidence
  // attributed to the claim, even when its quality has not been evaluated.
  const clauseFor = argumentSpan => direct.find(record =>
   record.left <= argumentSpan.start && record.right >= argumentSpan.end);
  for (const argument of extractArguments(passage)) {
   const claim = clauseFor(argument.conclusion);
   if (!claim || claim.clause.kinds.includes("reported_speech")) continue;
   for (const premise of argument.premises) {
    const evidence = clauseFor(premise);
    if (!evidence || evidence === claim || evidence.clause.kinds.includes("reported_speech")) continue;
    const cue = evidence.clause.features.find(feature => feature.type === "evidence");
    if (!cue || !/^(?:because|this is because)$/.test(argument.conclusion.marker)) continue;
    const from = claim.clause.id, to = evidence.clause.id;
    const id = `claim_evidence:${from}:${to}`;
    if (!paragraph.edges.some(edge => edge.id === id))
     paragraph.edges.push({ id, type: "claim_evidence", from, to, basis: "inferred",
      confidence: 0.75, evidence: cue.evidence });
   }
  }
  paragraphs.push(paragraph);
 }
 return { version: 1, paragraphs, flags: preprocessing.flags.map(flag => ({
  ...flag, start: flag.start + offset, end: flag.end + offset
 })) };
}
