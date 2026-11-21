import { windows } from "./text-windows.mjs";
import { isSemanticCandidate, selectSemanticTechnique, semanticMatchStrength } from "./semantic-policy.mjs";
import { hasSemanticEvidence } from "./semantic-evidence.mjs";
import { hasRuleEvidence } from "./rule-evidence.mjs";

// Shared by the Firefox worker and the stand-alone evaluation runner.
export function compilePatternRules(catalogue, patternCatalogue) {
 const byId = new Map((catalogue.techniques || catalogue.patterns || []).map(item => [item.id, item]));
 return (patternCatalogue.patterns || []).flatMap(rule => {
  const technique = byId.get(rule.id);
  if (!technique) return [];
  return (rule.expressions || []).flatMap(expression => {
   try {
    return [{ technique, regex: new RegExp(expression, "ig") }];
   } catch (error) {
    console.warn("Invalid pattern:", rule.id, expression, error);
    return [];
   }
  });
 });
}

export function prototypeTexts(technique) {
 return [...new Set([technique.example, ...(technique.examples || [])]
  .filter(value => typeof value === "string" && value.trim())
  .map(value => value.trim()))];
}

export function prototypeEntries(techniques) {
 return techniques.flatMap((technique, techniqueIndex) =>
  // A misspelling is orthographic evidence, not semantic similarity.
  // Otherwise a correctly spelled example could trigger a false warning.
  technique.id === "deliberate_errors" ? [] :
   prototypeTexts(technique).map(text => ({ techniqueIndex, text })));
}

export function cosineSimilarity(a, b) {
 let dot = 0, normA = 0, normB = 0;
 for (let i = 0; i < a.length; i++) {
  dot += a[i] * b[i];
  normA += a[i] * a[i];
  normB += b[i] * b[i];
 }
 return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
}

export async function matchText(text, { techniques, rules, prototypes = [], embed = null,
  evidence = hasSemanticEvidence, semanticOptions = {}, onNearMiss = null }) {
 const parts = windows(text);
 const patterned = [];
 const alreadyMatched = new Set();
 for (const part of parts) {
  for (const rule of rules) {
   rule.regex.lastIndex = 0;
   let found;
   while ((found = rule.regex.exec(part.text)) !== null) {
    if (!found[0]) {
     rule.regex.lastIndex++;
     continue;
    }
    if (!hasRuleEvidence(rule.technique.id, part.text, found.index, found[0])) continue;
    const start = part.offsets[found.index];
    const end = part.offsets[found.index + found[0].length - 1] + 1;
    if (start === undefined || end === undefined) continue;
    const key = rule.technique.id + ":" + start + ":" + end;
    if (alreadyMatched.has(key)) continue;
    alreadyMatched.add(key);
    patterned.push({ start, end, technique: rule.technique, score: 1,
     method: "pattern", contextual: Boolean(part.contextual) });
  }
 }
 }

 const semantic = [];
 if (embed && prototypes.length) {
  try {
   const candidates = parts.filter(part =>
    isSemanticCandidate(part.text, techniques) &&
    !patterned.some(match => match.start < part.sourceEnd && match.end > part.sourceStart));
   const embedded = candidates.length ? await embed(candidates.map(part => part.text)) : [];
   for (let i = 0; i < candidates.length; i++) {
    const result = selectSemanticTechnique(embedded[i], prototypes, cosineSimilarity, semanticOptions);
    const matchedTechnique = result ? techniques[result.techniqueIndex] : null;
    if (matchedTechnique && evidence(matchedTechnique.id, candidates[i].text)) {
     semantic.push({ start: candidates[i].start, end: candidates[i].end,
      technique: matchedTechnique, score: result.score,
      method: "semantic", strength: semanticMatchStrength(result.score, result.margin) });
    } else if (onNearMiss) {
     // Reuse the existing embedding, never issue another model call.
     // Similarity alone is not evidence of a recognised technique.
     let best = -Infinity;
     for (const prototype of prototypes)
      best = Math.max(best, cosineSimilarity(embedded[i], prototype.vector));
     if (best >= 0.63) onNearMiss({
      start: candidates[i].start, end: candidates[i].end, score: best
     });
    }
   }
  } catch (error) {
   // A model error must not erase exact matches already found by the rules.
   console.warn("Semantic match failed; keeping deterministic matches:", error);
  }
 }

 // Prefer rule matches within individual sentences over rules that extend into
 // adjacent sentences. A long contextual match must not hide another distinct
 // technique in the neighbouring sentence. Keep score-based ordering for AI.
 const ranked = [...patterned, ...semantic].sort((a, b) => {
  const methodOrder = (a.method === "pattern" ? 0 : 1) -
   (b.method === "pattern" ? 0 : 1);
  if (methodOrder) return methodOrder;
  if (a.method === "pattern") {
   return Number(a.contextual) - Number(b.contextual) ||
    (a.end - a.start) - (b.end - b.start);
  }
  return b.score - a.score;
 });
 const selected = [];
 for (const candidate of ranked) {
  if (!selected.some(existing => candidate.start < existing.end && candidate.end > existing.start))
   selected.push(candidate);
 }
 return selected.sort((a, b) => a.start - b.start);
}
