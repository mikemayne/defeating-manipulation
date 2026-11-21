const sentences = new Intl.Segmenter("en", {granularity: "sentence"});

function openingPair(paragraph) {
 const pair = [];
 let pending = "";
 for (const {segment} of sentences.segment(paragraph)) {
  pending += segment;
  // ICU can break after a title followed by a capitalised name.
  if (/\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St)\.\s*$/i.test(pending)) continue;
  pair.push(pending.trim());
  if (pair.length === 2) return pair;
  pending = "";
 }
 return null;
}

export async function paragraphTopicFindings(text, matchOpening, generate) {
 const findings = [];
 // Selection snapshots separate blocks and explicit breaks with a newline.
 for (const line of text.matchAll(/[^\r\n]+/g)) {
  const paragraph = line[0].trim();
  const pair = openingPair(paragraph);
  if (!pair) continue;
  const [opening, second] = pair;
  const hooks = await matchOpening(opening);
  if (!hooks.length) continue;
  const prompt = [
   "Does the second sentence endorse the judgment or reaction expressed or suggested by the first?",
   "Answer yes if it validates that reaction or states the invited conclusion.",
   "Answer no if it challenges the judgment, merely adds information, or changes subject.",
   "If the relationship is ambiguous, answer unclear.",
   "First: " + opening,
   "Second: " + second,
   "Answer:"
  ].join("\n");
  let answer;
  try {
   answer = await generate(prompt);
  } catch (error) {
   console.warn("Local paragraph confirmation check unavailable:", error);
   break;
  }
  if (!/^yes[.!]?$/i.test(answer.trim())) continue;
  const hook = hooks.reduce((best, item) => item.score > best.score ? item : best);
  const start = line.index + line[0].indexOf(paragraph);
  findings.push({...hook, kind: "paragraph_topic", start, end: start + paragraph.length});
 }
 return findings;
}
