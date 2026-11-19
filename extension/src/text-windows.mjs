// Match complete short statements, even when HTML blocks or <br> split their text.
// Normalising whitespace for matching does not change source start/end offsets.
export function windows(text) {
 const sentences = [];
 const sentencePattern = /[^.!?]+[.!?]?/g;
 let match;
 while ((match = sentencePattern.exec(text)) !== null) {
  const raw = match[0];
  const leading = raw.search(/\S/);
  if (leading < 0) continue;
  const start = match.index + leading;
  const end = match.index + raw.trimEnd().length;
  const value = text.slice(start, end).replace(/\s+/g, " ");
  if (value) sentences.push({ text: value, start, end });
 }

 const out = [];
 for (let i = 0; i < sentences.length; i++) {
  const sentence = sentences[i];
  if (sentence.text.length > 18 && sentence.text.length <= 900) out.push(sentence);

  // A premise and its conclusion can occupy different sentences or lines.
  // Match against their combined meaning, highlighting only the concluding
  // sentence as with the existing two-sentence contextual matching.
  for (let count = 2; count <= 3 && i + count <= sentences.length; count++) {
   const group = sentences.slice(i, i + count);
   if (group[group.length - 1].end - group[0].start > 600) break;
   const combined = group.map(part => part.text).join(" ");
   if (combined.length <= 18) continue;
   const last = group[group.length - 1];
   out.push({ text: combined, start: last.start, end: last.end, contextual: true });
  }
 }
 return out;
}
