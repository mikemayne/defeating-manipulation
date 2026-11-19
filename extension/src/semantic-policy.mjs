// Conservative semantic matching: abstain on labels, definitions, and
// ambiguous similarities rather than forcing every passage into a category.
function normalise(text) {
 return text.trim().toLowerCase().replace(/\s+/g, " ")
  .replace(/^[\s"'‘’“”`]+|[\s"'‘’“”`.,!?;:]+$/g, "");
}

export function isSemanticCandidate(text, catalogue) {
 const phrase = normalise(text);
 if (phrase.length < 45 || phrase.split(/\s+/).length < 8) return false;
 // Technique names and catalogue descriptions are not themselves tactics.
 if (catalogue.some(item => [item.title, item.summary, item.definition,
  ...(item.observable_features || [])].some(value =>
   typeof value === "string" && normalise(value) === phrase))) return false;
 // Definitions such as "Drawing a broad conclusion from too little evidence"
 // explain a technique rather than using it on a reader.
 if (/^(?:drawing|attacking|claiming|treating|invoking|misrepresenting|suggesting|presenting|reframing|recasting|using|implying|arguing|asserting|selecting|repeating|attributing|dismissing|appealing)\s/i.test(phrase)) return false;
 return true;
}

export function selectSemanticTechnique(vector, prototypes, dot, options = {}) {
 const minSimilarity = options.minSimilarity ?? 0.58;
 const minMargin = options.minMargin ?? 0.065;
 const scores = new Map();
 for (const prototype of prototypes) {
  const similarity = dot(vector, prototype.vector);
  const previous = scores.get(prototype.techniqueIndex) ?? -Infinity;
  if (similarity > previous) scores.set(prototype.techniqueIndex, similarity);
 }
 const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
 if (!ranked.length || ranked[0][1] < minSimilarity) return null;
 // Competing categories within the margin are not reliable classifications.
 if (ranked.length > 1 && ranked[0][1] - ranked[1][1] < minMargin) return null;
 const margin = ranked.length > 1 ? ranked[0][1] - ranked[1][1] : 1;
 return { techniqueIndex: ranked[0][0], score: ranked[0][1], margin };
}

// Qualitative match strength, not a calibrated probability.
export function semanticMatchStrength(score, margin) {
 if (score >= 0.75 && margin >= 0.12) return "High";
 if (score >= 0.68 && margin >= 0.09) return "Mid";
 return "Low";
}
