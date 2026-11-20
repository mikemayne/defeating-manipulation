// Structure-only evaluation for local, privately uploaded short paragraphs.
// Never infer an evidential or political truth label from argument presence.
import { extractArguments } from "../extension/src/argument-clauses.mjs";
import { normaliseClaimForNli } from "../extension/src/argument-claim-normalisation.mjs";

export const STRUCTURE_LABELS = ["argument_present", "model_conclusion_match"];

export function validateArgumentStructureCases(cases) {
 if (!Array.isArray(cases) || !cases.length)
  throw Error("No argument-structure cases. Upload a JSON/JSONL file with a cases array.");
 if (cases.length > 10000) throw Error("Argument-structure uploads are capped at 10,000 cases");
 const seen = new Set();
 for (const [i,item] of cases.entries()) {
  if (!item || typeof item.id !== "string" || !item.id.trim() ||
      typeof item.text !== "string" || !item.text.trim() ||
      typeof item.expected_argument !== "boolean" ||
      (item.expected_model_conclusion != null &&
       (item.expected_argument !== true ||
        typeof item.expected_model_conclusion !== "string" ||
        !item.expected_model_conclusion.trim())))
   throw Error("Invalid argument-structure row " + (i+1) +
    ': expected {id, text, expected_argument: boolean, expected_model_conclusion?: string}. ' +
    'This is a structure-only file, not a supported/unsupported NLI-labelled file.');
  if (seen.has(item.id)) throw Error("Duplicate argument-structure example ID: " + item.id);
  seen.add(item.id);
 }
 return cases;
}

export function inspectArgumentStructure(item) {
 const candidates = extractArguments(item.text);
 const hypotheses = candidates.map(candidate => ({
  sourceConclusion: candidate.conclusion.text,
  modelConclusion: normaliseClaimForNli(candidate).text,
  start: candidate.conclusion.start,
  end: candidate.conclusion.end,
  marker: candidate.conclusion.marker
 }));
 for (const candidate of hypotheses) {
  if (candidate.start < 0 || candidate.end > item.text.length ||
      item.text.slice(candidate.start,candidate.end) !== candidate.sourceConclusion)
   throw Error("Invalid original conclusion offset: " + item.id);
 }
 const expected = item.expected_argument ? ["argument_present"] : [];
 const predicted = hypotheses.length ? ["argument_present"] : [];
 if (item.expected_model_conclusion != null) {
  expected.push("model_conclusion_match");
  if (hypotheses.some(candidate =>
      candidate.modelConclusion === item.expected_model_conclusion))
   predicted.push("model_conclusion_match");
 }
 return { expected, predicted, hypotheses,
  expectedArgument:item.expected_argument,
  expectedModelConclusion:item.expected_model_conclusion ?? null };
}
