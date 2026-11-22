import fs from "node:fs";
import { mappings } from "../extension/src/hybrid-mappings.mjs";
import { questions } from "../extension/src/hybrid-questions.mjs";

const read = path => JSON.parse(fs.readFileSync(new URL("../" + path, import.meta.url), "utf8"));
const sources = [
 ["techniques.json", "techniques", "technique"],
 ["positive-patterns.json", "patterns", "positive"],
 ["inconsistency-patterns.json", "patterns", "inconsistency"],
 ["extension/src/concealed-patterns.json", "patterns", "concealed"]
];
const copies = new Map(read("extension/techniques.json").techniques.map(item => [item.id, item]));
const regex = new Set(read("extension/patterns.json").patterns.map(item => item.id));
const positiveRules = new Set(read("extension/src/positive-rules.json").patterns.map(item => item.id));
const outside = {
 out_of_context_quote: "Original surrounding quotation",
 quote_recontextualisation: "Original and subsequent context",
 false_balance: "Relative strength of the available evidence",
 deliberate_errors: "Intent cannot be established from a spelling observation",
 selective_presentation: "Relevant omitted evidence",
 cherry_picking: "Relevant omitted evidence"
};
const records = sources.flatMap(([source, key, kind]) => read(source)[key].map(item => {
 const mapping = mappings[item.id];
 const required = mapping?.required ?? [];
 const supporting = mapping?.supporting ?? [];
 const incompatible = mapping?.incompatible ?? [];
 const copy = copies.get(item.id);
 return {
  id: item.id, title: item.title, category: item.category ?? kind, kind, source,
  definition: item.definition ?? item.summary, required, supporting, incompatible,
  questions: [...required, ...supporting, ...incompatible].map(id => {
   const { version, strategy } = questions.find(question => question.id === id);
   return { id, version, strategy };
  }),
  context: outside[item.id] ? "information unavailable from text" : mapping ? "paragraph" : null,
  status: mapping ? "implemented" : outside[item.id] ? "not_inferable" : "inventoried",
  gap: outside[item.id] ?? mapping?.partial ?? (mapping ? null : "Predicate and context mapping pending."),
  existing: { extensionCopy: kind === "technique" ? Boolean(copy) : null,
   changedCopyFields: copy ? ["title", "category", "summary"].filter(key => copy[key] !== item[key]) : [],
   regex: regex.has(item.id) || positiveRules.has(item.id),
   ...(kind === "concealed" ? { positiveIds: item.positiveIds, negativeIds: item.negativeIds } : {}) }
 };
}));
const canonicalIds = new Set(records.map(row => row.id));
if (canonicalIds.size !== records.length || Object.keys(mappings).some(id => !canonicalIds.has(id))) {
 throw Error("Duplicate catalogue ID or orphan hybrid mapping");
}
const runtimeOnly = [
 { id: "argument_inconsistency", source: "extension/src/consistency.mjs", kind: "legacy_runtime_alias",
  canonical: "contradictory_claims", context: "article", status: "inventoried" },
 { id: "orthographic_attention_hook", source: "extension/src/text-preprocessing.mjs", kind: "preprocessing_diagnostic",
  context: "sentence", status: "implemented" },
 { id: "nonstandard_vocabulary", source: "extension/src/matcher-worker.js", kind: "preprocessing_diagnostic",
  context: "clause", status: "implemented" }
];
const markdown = ["# Hybrid catalogue coverage", "",
 "The published catalogues supply canonical IDs. The extension copy supplies existing runtime evidence. An implemented row covers the registered textual construction. See the benchmark for observed performance.", "",
 "| ID | Family | Status | Context | Required | Supporting | Gap |",
 "| --- | --- | --- | --- | --- | --- | --- |", ...records.map(r =>
  "| " + [r.id, r.kind, r.status, r.context ?? "pending", r.required.join(", "),
   r.supporting.join(", "), r.gap ?? ""].join(" | ") + " |"), "",
 "## Extension copy reconciliation", "",
 ...records.filter(r => r.existing.extensionCopy === false || r.existing.changedCopyFields.length)
  .map(r => "- " + r.id + (r.existing.extensionCopy ? " differs in " + r.existing.changedCopyFields.join(", ") : " is absent from the extension copy.")),
 "", "The questionnaire reads the published techniques catalogue. Existing positive rules and concealed component IDs are recorded in the JSON matrix.",
 "", "## Runtime-only identifiers", "",
 ...runtimeOnly.map(row => "- " + row.id + " · " + row.kind + " · " + row.source), ""].join("\n");
for (const [name, content] of [
 ["hybrid-coverage.json", JSON.stringify({ records, runtimeOnly }, null, 2) + "\n"],
 ["hybrid-coverage.md", markdown]
]) fs.writeFileSync(new URL("../docs/" + name, import.meta.url), content);
