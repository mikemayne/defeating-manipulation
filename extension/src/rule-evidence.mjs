// Precision checks for broad structural rules.
// These examine the local context without sending the selected text anywhere.
const attribution = /\b(?:quoted?|quoting|reported?|listed|classified|included|terms?|words?|referred|attributed|described|recorded|catalogued?|classification|investigation|transcribed|speech)\b/i;
const genericWords = new Set([
 "about", "against", "another", "bigger", "because", "could", "debate",
 "discuss", "discussion", "examine", "focus", "have", "issues", "local",
 "many", "more", "much", "other", "problems", "problem", "public",
 "question", "report", "serious", "should", "shortages", "since",
 "there", "these", "those", "urgent", "when", "whether", "which",
 "would", "company", "companies", "council", "service", "policy",
 "people", "project", "issue", "what", "talk", "with", "some"
]);
function stems(text) {
 return new Set((text.toLowerCase().match(/[a-z]{4,}/g) || [])
  .filter(word => !genericWords.has(word))
  .map(word => word.slice(0, 5)));
}
export function hasRuleEvidence(techniqueId, windowText, matchIndex, matchText) {
 if (techniqueId === "loaded_language") {
  // A report about words that were used is not itself an instance of the
  // emotionally loaded claim being described. Match the sentence only, not
  // unrelated neighbouring sentences included in a contextual window.
  const before = windowText.slice(0, matchIndex);
  const start = Math.max(before.lastIndexOf("."), before.lastIndexOf("!"),
   before.lastIndexOf("?")) + 1;
  const after = windowText.slice(matchIndex + matchText.length);
  const ends = [after.indexOf("."), after.indexOf("!"), after.indexOf("?")]
   .filter(index => index >= 0);
  const end = matchIndex + matchText.length +
   (ends.length ? Math.min(...ends) : after.length);
  return !attribution.test(windowText.slice(start, end));
 }
 if (techniqueId === "red_herring") {
  const halves = matchText.split(/\bwhen there (?:are|is)\b/i);
  if (halves.length !== 2) return true;
  // A discussion that moves between two clearly *related* descriptions
  // should not be classified as changing the subject.
  const original = stems(halves[0]);
  const proposed = stems(halves[1]);
  if ([...original].some(root => proposed.has(root))) return false;
 }
 return true;
}
