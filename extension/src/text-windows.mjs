// Generate candidate text windows without requiring a browser.
// Each normalised character retains its position in the original selection,
// so rule matches can underline the actual phrase even across line breaks.
const MAX_WINDOW = 900;
const CONTEXT_WINDOW = 650;

function normalise(source, start, end) {
 let text = "", offsets = [], spaceAt = -1;
 for (let i = start; i < end; i++) {
  const character = source[i];
  if (/\s/.test(character)) {
   if (text && spaceAt < 0) spaceAt = i;
   continue;
  }
  if (spaceAt >= 0) {
   text += " ";
   offsets.push(spaceAt);
   spaceAt = -1;
  }
  text += character;
  offsets.push(i);
 }
 return { text, offsets };
}

export function windows(source) {
 const atoms = [], out = [];
 const sentencePattern = /[^.!?\n]+[.!?]?/g;
 let match;
 while ((match = sentencePattern.exec(source)) !== null) {
  const raw = match[0];
  const beginning = raw.search(/\S/);
  if (beginning < 0) continue;
  const start = match.index + beginning;
  const end = match.index + raw.trimEnd().length;
  // A long line must not cause everything in it to disappear.
  // Split on word boundaries; retain each fragment as a candidate.
  let cursor = start;
  while (cursor < end) {
   let until = Math.min(end, cursor + MAX_WINDOW);
   if (until < end) {
    const breakpoint = source.lastIndexOf(" ", until);
    if (breakpoint > cursor + 400) until = breakpoint + 1;
   }
   const piece = normalise(source, cursor, until);
   if (piece.text) atoms.push({ start: cursor, end: until });
   cursor = until;
  }
 }
 const add = (start, end, highlightStart = start, contextual = false) => {
  const part = normalise(source, start, end);
  if (!part.text || part.text.length > MAX_WINDOW) return;
  out.push({ ...part, start: highlightStart, end,
   sourceStart: start, sourceEnd: end, contextual });
 };
 for (let i = 0; i < atoms.length; i++) {
  const atom = atoms[i];
  add(atom.start, atom.end);
  // Neighbouring sentences or separate lines may comprise one argument.
  for (let count = 2; count <= 5 && i + count <= atoms.length; count++) {
   const last = atoms[i + count - 1];
   if (last.end - atom.start > CONTEXT_WINDOW) break;
   add(atom.start, last.end, last.start, true);
  }
 }
 return out;
}
