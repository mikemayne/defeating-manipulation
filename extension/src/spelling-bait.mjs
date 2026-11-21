// Conservative, local spelling-error flag for selected English text.
// Spelling is a possible attention hook, never evidence of author intent.
const MAX_FINDINGS = 8;
const TOKEN = /\b[a-z]{4,}(?:['’][a-z]+)?\b/gi;
const WEB_PARTS = /(?:https?:\/\/|www\.)[^\s<>]+|\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b|\b[a-z0-9-]+\.(?:com|org|net|co\.uk|gov\.uk|io|uk|dev)\b/gi;
const COMMON_NAMES = new Set([
 'reddit', 'youtube', 'tiktok', 'whatsapp', 'chatgpt', 'openai',
 'instagram', 'facebook', 'bluesky', 'linkedin', 'firefox', 'github',
 'brexit', 'covid', 'wifi', 'podcast', 'memes'
]);

function oneEditAway(source, target) {
 if (source === target || Math.abs(source.length - target.length) > 1) return false;
 // Transposed adjacent letters, e.g. 'idoit' -> 'idiot'.
 if (source.length === target.length) {
  const differences = [];
  for (let i = 0; i < source.length; i++) if (source[i] !== target[i]) differences.push(i);
  if (differences.length === 2 && differences[1] === differences[0] + 1 &&
   source[differences[0]] === target[differences[1]] &&
   source[differences[1]] === target[differences[0]]) return true;
 }
 let i = 0, j = 0, changes = 0;
 while (i < source.length && j < target.length) {
  if (source[i] === target[j]) { i++; j++; continue; }
  if (++changes > 1) return false;
  if (source.length > target.length) i++;
  else if (source.length < target.length) j++;
  else { i++; j++; }
 }
 return changes + Number(i < source.length || j < target.length) === 1;
}

export function findSpellingCandidates(text, spellchecker, maxFindings = MAX_FINDINGS) {
 if (typeof text !== 'string' || !spellchecker?.correct || !spellchecker?.suggest ||
   !Number.isInteger(maxFindings) || maxFindings < 1) return [];
 const protectedRanges = [...text.matchAll(WEB_PARTS)].map(hit =>
  [hit.index, hit.index + hit[0].length]);
 const matches = [], checked = new Map();
 for (const hit of text.matchAll(TOKEN)) {
  if (matches.length >= maxFindings) break;
  const original = hit[0], word = original.toLowerCase();
  const start = hit.index, end = start + original.length;
  const before = text[start - 1] || '', after = text[end] || '';
  // Don't guess spellings of proper names, brands, hashtags, handles or identifiers.
  if (original !== word || COMMON_NAMES.has(word) || /[_@#\p{L}\p{N}]/u.test(before) ||
   /[_\p{L}\p{N}]/u.test(after) || protectedRanges.some(([a, b]) => a < end && b > start)) continue;
  if (!checked.has(word)) {
   let options = [];
   try {
    if (!spellchecker.correct(word)) {
     options = [...new Set(spellchecker.suggest(word).slice(0, 5)
      .map(suggestion => suggestion.toLowerCase())
      .filter(suggestion => /^[a-z]+$/i.test(suggestion) &&
       oneEditAway(word, suggestion)))];
    }
   } catch { /* A dictionary issue must not cause a false warning. */ }
   checked.set(word, options);
  }
  const suggestions = checked.get(word);
  if (!suggestions?.length) continue;
  matches.push({ start, end, original, suggestions,
   // A single one-edit suggestion is only a candidate for a working-copy
   // correction. It is never proof the author intended that word.
   correction: suggestions.length === 1 ? suggestions[0] : null });
 }
 return matches;
}

 // separate semantic output layer, retaining old callers and match shape
export function findSpellingBait(text, spellchecker, technique, maxFindings = MAX_FINDINGS) {
 if (!technique) return [];
 return findSpellingCandidates(text, spellchecker, maxFindings)
  .map(({start, end}) => ({start, end, technique, kind:'spelling',
   method:'spellcheck', score:0.5}));
}
