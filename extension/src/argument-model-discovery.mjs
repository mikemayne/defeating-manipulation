// Experimental model-assisted argument relationship discovery.
//
// This module runs only after deterministic extraction found no argument.
// It reuses the browser's local NLI scorer to rank *possible* links between
// nearby original statements. NLI entailment is NOT argument intent, proof,
// or author attribution: these candidates are for diagnostics and later
// human-labelled evaluation. No inferred candidate creates a red underline.
const TOKEN = /[\p{L}\p{N}]+/gu;
const MAX_STATEMENT_LENGTH = 320;
const MIN_WORDS = 5;
const MAX_MODEL_PAIRS = 4;
const MAX_MODEL_CANDIDATES = 2;

function words(value) {
 return (value.match(TOKEN) || []).length;
}
function usable(source, statement) {
 if (!statement || !Number.isSafeInteger(statement.start) ||
     !Number.isSafeInteger(statement.end) ||
     statement.start < 0 || statement.end <= statement.start ||
     statement.end > source.length ||
     source.slice(statement.start, statement.end) !== statement.text ||
     statement.text.length > MAX_STATEMENT_LENGTH ||
     words(statement.text) < MIN_WORDS ||
     /[?!]\s*$/.test(statement.text) ||
     /["“”]/.test(statement.text) ||
     /^(?:according to|as reported by|as quoted by|he said|she said|they said|the reporter said)\b/i.test(statement.text)) return false;
 return true;
}
function validScores(scores) {
 return scores && ["contradiction", "neutral", "entailment"]
  .every(key => typeof scores[key] === "number" &&
   Number.isFinite(scores[key]) && scores[key] >= 0 && scores[key] <= 1);
}
function oneWayEntailment(forward, reverse) {
 return forward.entailment >= 0.82 &&
  forward.entailment >= forward.neutral + 0.15 &&
  forward.entailment >= forward.contradiction + 0.15 &&
  reverse.entailment <= 0.64 &&
  forward.entailment - reverse.entailment >= 0.22;
}
function stripTerminal(text) {
 return text.replace(/[.!?;]+\s*$/, "").trim();
}
function makeCandidate(premise, conclusion, direction, confidence, forward, reverse) {
 const connector = direction === "forward" ? "therefore" : "because";
 // This is an analysis-only reconstruction: never use it as a premise
 // for the NLI model or as a source of text offsets.
 const analysisText = direction === "forward"
  ? stripTerminal(premise.text) + ". Therefore, " + conclusion.text
  : stripTerminal(conclusion.text) + " because " + stripTerminal(premise.text) + ".";
 return {
  premise: premise.text, premises: [premise],
  conclusion: { ...conclusion, marker: connector, inline: false },
  start: Math.min(premise.start, conclusion.start),
  end: Math.max(premise.end, conclusion.end),
  inferred: true, provisional: true,
  inferredConnector: connector,
  reconstructionMethod: "model_nli_directional_entailment",
  relationScore: confidence,
  modelEvidence: { forward, reverse },
  analysisText
 };
}

// Statements are offset-bearing objects returned by the deterministic parser.
// scorePair is the same locally cached NLI inference function used elsewhere.
// A maximum of 2*maxPairs neural calls is enforced, even on long paragraphs.
export async function discoverModelArgumentCandidates(source, statements, scorePair, {
 existing = [], maxPairs = MAX_MODEL_PAIRS,
 maxCandidates = MAX_MODEL_CANDIDATES
} = {}) {
 if (typeof source !== "string" || !Array.isArray(statements) ||
     typeof scorePair !== "function") return [];
 const pairLimit = Math.min(MAX_MODEL_PAIRS, Math.max(0, Number.isSafeInteger(maxPairs) ? maxPairs : 0));
 const candidateLimit = Math.min(MAX_MODEL_CANDIDATES,
  Math.max(0, Number.isSafeInteger(maxCandidates) ? maxCandidates : 0));
 if (!pairLimit || !candidateLimit) return [];
 const occupied = new Set(existing.map(a =>
  a.conclusion.start + ":" + a.conclusion.end));
 const candidates = [];
 let scoredPairs = 0;
 // Nearest neighbours first; don't pair across a paragraph break.
 for (let distance = 1; distance <= 2 && scoredPairs < pairLimit; distance++) {
  for (let i = 0; i + distance < statements.length && scoredPairs < pairLimit; i++) {
   const left = statements[i], right = statements[i + distance];
   if (!usable(source, left) || !usable(source, right) ||
       /\n\s*\n/.test(source.slice(left.end, right.start))) continue;
   scoredPairs++;
   const forward = await scorePair(left.text, right.text);
   const reverse = await scorePair(right.text, left.text);
   if (!validScores(forward) || !validScores(reverse)) continue;
   let candidate = null;
   if (oneWayEntailment(forward, reverse)) {
    candidate = makeCandidate(left, right, "forward",
     forward.entailment, forward, reverse);
   } else if (oneWayEntailment(reverse, forward)) {
    candidate = makeCandidate(right, left, "reverse",
     reverse.entailment, forward, reverse);
   }
   if (candidate && !occupied.has(candidate.conclusion.start + ":" +
       candidate.conclusion.end)) {
    // Preserve the exact evidence and conclusion offsets.
    if (source.slice(candidate.conclusion.start, candidate.conclusion.end) !==
        candidate.conclusion.text) continue;
    candidates.push(candidate);
    occupied.add(candidate.conclusion.start + ":" + candidate.conclusion.end);
   }
  }
 }
 return candidates.sort((a, b) => b.relationScore - a.relationScore)
  .slice(0, candidateLimit);
}
