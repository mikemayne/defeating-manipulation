const sentences = new Intl.Segmenter("en", {granularity: "sentence"});

function paragraphSentences(paragraph) {
 const parts = [];
 let pending = "";
 for (const {segment} of sentences.segment(paragraph)) {
  pending += segment;
  // ICU can break after a title followed by a capitalised name.
  if (/\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St)\.\s*$/i.test(pending)) continue;
  parts.push(pending.trim());
  pending = "";
 }
 if (pending.trim()) parts.push(pending.trim());
 return parts;
}

export async function paragraphTopicFindings(text, matchOpening, generate) {
 const findings = [];
 // Selection snapshots separate blocks and explicit breaks with a newline.
 for (const line of text.matchAll(/[^\r\n]+/g)) {
  const paragraph = line[0].trim();
  const [opening, ...later] = paragraphSentences(paragraph);
  if (!later.length) continue;
  const hooks = await matchOpening(opening);
  if (!hooks.length) continue;
  for (let i = 0; i < later.length; i++) {
   const prompt = [
    "Does the second sentence endorse the judgment or reaction expressed or suggested by the first?",
    "Answer yes for direct agreement. Answer implied yes if the second sentence takes that judgment for granted or suggests the same conclusion indirectly.",
    "Answer no if it challenges the judgment, merely adds information, or changes subject.",
    "If the relationship is ambiguous, answer unclear.",
    "First: " + opening,
    "Second: " + later[i],
    "Answer:"
   ].join("\n");
   let answer;
   try {
    answer = await generate(prompt);
   } catch (error) {
    console.warn("Local paragraph confirmation check unavailable:", error);
    return findings;
   }
   if (!/^(?:yes|implied yes)[.!]?$/i.test(answer.trim())) continue;
   const hook = hooks.reduce((best, item) => item.score > best.score ? item : best);
   const start = line.index + line[0].indexOf(paragraph);
   findings.push({...hook, kind: "paragraph_topic", start, end: start + paragraph.length, confirmationSentence: i + 2});
   break;
  }
 }
 return findings;
}
