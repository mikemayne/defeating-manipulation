// Small, version-controlled vocabulary for nonstandard words.
// Candidate wording and a likely conventional reading are separate.
// Neither a listed term nor a correction demonstrates manipulative intent.
import vocabulary from "./nonstandard-vocabulary.json" with { type: "json" };

const TOKEN = /\b[a-z]+\b/gi;
const EDGE = /[_@#\p{L}\p{N}]/u;
const WORD = /^[a-z]+$/i;
const SIGNALS = new Set(["possible_engagement_bait", "potentially_derogatory",
 "possible_emotive_framing"]);

export function validateVocabularyRegistry(registry = vocabulary) {
 if (registry?.version !== 1 || !Array.isArray(registry.entries) ||
     registry.entries.length > 2000) throw Error("Unsupported vocabulary registry");
 const seen = new Set();
 for (const entry of registry.entries) {
  if (!entry || typeof entry.term !== "string" || !WORD.test(entry.term) ||
      entry.term !== entry.term.toLowerCase() || seen.has(entry.term) ||
      !Array.isArray(entry.suggestions) || entry.suggestions.length < 1 ||
      entry.suggestions.length > 5 ||
      entry.suggestions.some(value => typeof value !== "string" ||
       !WORD.test(value) || value.length > 40) ||
      !Array.isArray(entry.signals) ||
      entry.signals.some(value => !SIGNALS.has(value)) ||
      (entry.replacement != null && !entry.suggestions.includes(entry.replacement)) ||
      (entry.nextWordReplacements != null && (
       typeof entry.nextWordReplacements !== "object" ||
       Array.isArray(entry.nextWordReplacements) ||
       Object.entries(entry.nextWordReplacements).some(([key, value]) =>
        !WORD.test(key) || key !== key.toLowerCase() ||
        !entry.suggestions.includes(value)))))
   throw Error("Invalid vocabulary entry");
  seen.add(entry.term);
 }
 return registry;
}

const index = new Map(validateVocabularyRegistry().entries
 .map(entry => [entry.term, entry]));

// A contextual ambiguity is left unchanged when there is no exact cue.
// Preserve all-uppercase writing; ordinary replacements retain normal names.
function correctionFor(source, end, original, entry) {
 const next = source.slice(end).match(/^\s+([a-z]+)/i)?.[1]?.toLowerCase();
 const replacement = next && entry.nextWordReplacements &&
  Object.prototype.hasOwnProperty.call(entry.nextWordReplacements, next)
   ? entry.nextWordReplacements[next] : entry.replacement || null;
 return replacement && original === original.toUpperCase()
  ? replacement.toUpperCase() : replacement;
}

export function findVocabularyCandidates(source,
 {maxFindings = 8, isProtected = () => false} = {}) {
 if (typeof source !== "string" || !Number.isSafeInteger(maxFindings) ||
     maxFindings < 0 || maxFindings > 100 ||
     typeof isProtected !== "function") return [];
 const findings = [];
 for (const match of source.matchAll(TOKEN)) {
  if (findings.length >= maxFindings) break;
  const original = match[0], start = match.index, end = start + original.length;
  const entry = index.get(original.toLowerCase());
  if (!entry || isProtected(start, end) ||
      EDGE.test(source[start - 1] || "") || EDGE.test(source[end] || "")) continue;
  findings.push({start, end, original, suggestions:[...entry.suggestions],
   correction:correctionFor(source, end, original, entry),
   signals:[...entry.signals],
   reason:"Curated nonstandard wording: possible correction bait; intent unknown"});
 }
 return findings;
}
