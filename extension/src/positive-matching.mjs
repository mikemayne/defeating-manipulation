import positiveCatalogue from "../../positive-patterns.json" with { type: "json" };
import ruleCatalogue from "./positive-rules.json" with { type: "json" };
import { compilePatternRules, matchText } from "./matching-core.mjs";
import { hasPositiveSemanticEvidence } from "./positive-evidence.mjs";

// Use the published JSON as the single source of truth, retaining the
// original editorial category while making colour selection unambiguous.
export const positiveTechniques = positiveCatalogue.patterns.map(pattern => ({
 ...pattern, originalCategory: pattern.category, category: "Positive"
}));
export const positiveRules = compilePatternRules(
 { techniques: positiveTechniques }, ruleCatalogue
);

// The first stage identifies individual constructive statements. It does not
// decide whether a pleasant phrase is being used to disguise manipulation.
export async function matchPositiveText(text, { prototypes = [], embed = null } = {}) {
 return matchText(text, {
  techniques: positiveTechniques,
  rules: positiveRules,
  prototypes,
  embed,
  evidence: hasPositiveSemanticEvidence,
  semanticOptions: { minSimilarity: 0.71, minMargin: 0.10 }
 });
}
