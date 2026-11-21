const sentences = new Intl.Segmenter("en", {granularity: "sentence"});

function endpoints(line) {
 const lineEnd = line.trimEnd().length;
 let first, last, start = 0;
 for (const {segment, index} of sentences.segment(line)) {
  const end = index + segment.trimEnd().length;
  if (end < lineEnd && /\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St)\.\s*$/i.test(segment)) continue;
  const raw = line.slice(start, end);
  const span = {start: start + raw.length - raw.trimStart().length, end, text: raw.trim()};
  if (span.text) {
   if (!first) first = span;
   else last = span;
  }
  start = index + segment.length;
 }
 return last ? [first, last] : null;
}

function closingCue(text) {
 if (/\?["'”’»)\]]*$/u.test(text)) return "The closing sentence asks a question.";
 if (/\b(?:remains? to be seen|(?:is|remains) (?:an |an? entirely )?open question|time will tell|too (?:early|soon) to (?:say|tell)|hard to (?:say|tell) whether)\b/i.test(text) ||
     /^(?:["'“‘]\s*)?(?:perhaps|maybe|it (?:may|might|could) be that)\b/i.test(text))
  return "The closing sentence expresses uncertainty.";
 return "";
}

export async function paragraphTopicFindings(text, matchSentence) {
 const findings = [];
 for (const line of text.matchAll(/[^\r\n]+/g)) {
  const pair = endpoints(line[0]);
  if (!pair) continue;
  const [first, last] = pair;
  const hooks = await matchSentence(first.text);
  if (!hooks.length) continue;
  const hook = hooks.reduce((best, item) => item.score > best.score ? item : best);
  const cue = closingCue(last.text);
  // A repeated opening-only hit cannot establish a paired match.
  const left = first.text.replace(/[.!?]+$/u, "");
  let strongest;
  for (const join of [" and ", " but "]) {
   const rightStart = left.length + join.length;
   const matches = await matchSentence(left + join + last.text);
   for (const match of matches) {
    if (match.technique.id !== hook.technique.id || match.start >= left.length || match.end <= rightStart) continue;
    if (!strongest || match.score > strongest.score) strongest = match;
   }
  }
  if (!cue && !strongest) continue;
  const detail = [cue, strongest && "The paired sentences also triggered the opening technique."].filter(Boolean).join(" ");
  for (const span of pair) findings.push({...hook, kind: "paragraph_topic", paragraphCue: detail,
   start: line.index + span.start, end: line.index + span.end});
 }
 return findings;
}
