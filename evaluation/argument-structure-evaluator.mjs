// Single-paragraph structure checks plus optional NLI reference labels.
// Structural presence never implies an argument is sound or manipulative.
import { extractArguments } from "../extension/src/argument-clauses.mjs";
import { ARGUMENT_LABELS } from "../extension/src/argument-analysis.mjs";
import { normaliseClaimForNli } from "../extension/src/argument-claim-normalisation.mjs";

export const STRUCTURE_LABELS = ["argument_present", "model_conclusion_match"];

export function validateArgumentParagraphCases(cases) {
 if (!Array.isArray(cases) || !cases.length)
  throw Error("No single-paragraph argument cases. Upload JSON/JSONL with a cases array.");
 if (cases.length > 10000) throw Error("Single-paragraph uploads are capped at 10,000 cases");
 const seen = new Set();
 for (const [i,item] of cases.entries()) {
  if (!item || typeof item.id !== "string" || !item.id.trim() ||
      typeof item.text !== "string" || !item.text.trim() ||
      typeof item.expected_argument !== "boolean" ||
      (item.expected_model_conclusion != null &&
       (item.expected_argument !== true ||
        typeof item.expected_model_conclusion !== "string" ||
        !item.expected_model_conclusion.trim())) ||
      (Object.hasOwn(item,"expected") &&
       (!Array.isArray(item.expected) || item.expected.length > 1 ||
        item.expected.some(label => !ARGUMENT_LABELS.includes(label)) ||
        (item.expected.length > 0 && !item.expected_argument))))
   throw Error("Invalid single-paragraph row " + (i+1) +
    ': expected {id, text, expected_argument: boolean, expected_model_conclusion?: string, expected?: [] or [NLI label]}. ' +
    'The expected field is optional and requests NLI evaluation.');
  if (seen.has(item.id)) throw Error("Duplicate single-paragraph example ID: " + item.id);
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
