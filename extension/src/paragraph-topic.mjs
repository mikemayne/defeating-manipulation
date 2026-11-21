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
  if (later.length < 2) continue;
  const hooks = await matchOpening(opening);
  if (!hooks.length) continue;
  const closing = later.at(-1);
  const middle = later.slice(0, -1).join(" ");
  const payloadPrompt = [
   "Does the closing sentence directly or indirectly affirm the judgment suggested by the opening?",
   "Answer yes, implied yes, no, or unclear.",
   "Opening: " + opening, "Closing: " + closing
  ].join("\n");
  const justificationPrompt = [
   "Does the middle offer a reason, example or explanation for the closing judgment?",
   "A weak reason counts. Sharing the subject alone is insufficient. Answer yes or no.",
   "Middle: " + middle, "Closing: " + closing
  ].join("\n");
  try {
   if (!/^(?:yes|implied yes)[.!]?$/i.test((await generate(payloadPrompt)).trim())) continue;
   if (!/^yes[.!]?$/i.test((await generate(justificationPrompt)).trim())) continue;
  } catch (error) {
   console.warn("Local paragraph check unavailable:", error);
   return findings;
  }
  const hook = hooks.reduce((best, item) => item.score > best.score ? item : best);
  const start = line.index + line[0].indexOf(paragraph);
  findings.push({...hook, kind: "paragraph_topic", start, end: start + paragraph.length,
   confirmationSentence: later.length + 1});
 }
 return findings;
}
