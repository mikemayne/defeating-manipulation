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
const evaluations = [
 ["synthetic pilot", "docs/hybrid-pilot-schema-results.json"],
 ["frozen synthetic check", "docs/hybrid-frozen-results.json"]
].map(([name, path]) => [name, new Set(read(path).evaluatedIds)]);
const outside = {
 out_of_context_quote: "Original surrounding quotation",
 quote_recontextualisation: "Original and subsequent context",
 false_balance: "Relative strength of the available evidence",
 deliberate_errors: "Intent cannot be established from a spelling observation",
 selective_presentation: "Relevant omitted evidence",
 cherry_picking: "Relevant omitted evidence"
};
const pending = {
 loaded_language: ["clause", "evaluative wording", "evaluation exceeds literal description"],
 straw_man: ["paragraph", "opposing claim and alleged reformulation", "material change followed by rebuttal"],
 appeal_to_fear: ["paragraph", "frightening possibility", "fear used to support a decision or claim"],
 false_authority: ["paragraph", "authority offered as evidence", "lack of relevant expertise or established authority"],
 conspiracy_framing: ["paragraph", "hidden coordination asserted", "assertion grounded in insinuation or difficult-to-test claims"],
 priming: ["article", "earlier cue", "later material related to the association"],
 presupposition: ["clause", "assumption treated as already accepted"],
 scapegoating: ["paragraph", "complex problem attributed broadly to a target", "available other causes omitted or simplified"],
 motte_bailey: ["article", "broad and narrower versions of a claim", "shift in response to criticism"],
 gish_gallop: ["article", "volume of claims", "limited opportunity for meaningful response"],
 allegation_laundering: ["article", "attributed or uncertain allegation", "later restatement as fact without new evidence"],
 insinuation_by_juxtaposition: ["paragraph", "proximate details", "implied connection unsupported by the details"],
 blame_reversal: ["paragraph", "original conduct or complaint", "focus shifted to the complainant's response"],
 retaliatory_discrediting: ["paragraph", "report or complaint", "source credibility attacked because of the act of reporting"],
 manufactured_consensus: ["article", "asserted widespread agreement", "weak or unrepresentative support"],
 obfuscation: ["paragraph", "identifiable missing actor, action, evidence or certainty", "wording obscures that information"],
 semantic_diversion: ["paragraph", "available original claim", "minor wording dispute used in place of a response"],
 moving_goalposts: ["article", "initial criterion met", "replacement criterion introduced without justification"],
 double_standards: ["article", "comparable cases", "inconsistent criteria or evidentiary thresholds"],
 poisoning_the_well: ["paragraph", "prior attack on a source", "later claims discounted on that basis"],
 criminalising_dissent: ["paragraph", "dissent or criticism", "criminal label unsupported by the conduct described"],
 appearance_based_attack: ["paragraph", "physical trait or manner", "ridicule replaces engagement with relevant conduct or claims"],
 disgust_appeal: ["paragraph", "revulsion-related description", "description used to influence a judgement"],
 premature_closure: ["paragraph", "issue declared settled", "acknowledged or otherwise visible unresolved evidence"],
 narrative_reframing: ["article", "selected sequence, roles or causal links", "comparison context for the inferred shift"],
 public_shaming: ["paragraph", "identifiable target", "invitation to ridicule or condemn in public"],
 paternalistic_coercion_framing: ["paragraph", "restriction or coercive demand", "justification as care for the affected person"],
 incitement_to_violence: ["paragraph", "encouragement or endorsement of violence", "target identifiable by person, group or category"],
 exaggeration_minimisation: ["paragraph", "representation of magnitude or importance", "comparison evidence supporting a material discrepancy"],
 invoking_an_imagined_audience: ["paragraph", "absent audience's reaction asserted or predicted", "reaction used as pressure or implied opposition"],
 red_herring: ["paragraph", "question under discussion", "irrelevant issue used to divert attention"],
 appeal_to_emotion: ["paragraph", "emotion invoked", "emotion offered as a reason to accept a claim"],
 false_equivalence: ["paragraph", "assertion of equivalence", "material difference relevant to the comparison"],
 preference_as_moral_obligation: ["paragraph", "personal preference", "unsupported obligation and condemnation of noncompliance"],
 moral_authority_instead_of_argument: ["paragraph", "moral principle", "principle used to delegitimise questioning rather than address a claim"],
 provoking_backlash: ["paragraph", "defensible principle coupled to disproportionate pressure", "actual reaction or intent requires other evidence"],
 manufactured_inevitability: ["paragraph", "outcome presented as inevitable", "repeated naming or existence offered as its own justification"],
 proportionate_response: ["paragraph", "stated impact", "response matches the described scale"],
 supporting_informed_choice: ["paragraph", "meaningful alternatives", "material trade-offs presented"],
 respect_with_penalty: ["paragraph", "permission to disagree", "penalty tied to the same person's disagreement"],
 empathy_with_guilt: ["paragraph", "acknowledgement of feelings", "connected demand framed as loyalty or care"],
 independence_with_control: ["paragraph", "invitation to judge independently", "same person's decision restricted to the speaker's view"]
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
  context: outside[item.id] ? "information unavailable from text" : mapping ? "paragraph" : pending[item.id]?.[0],
  pendingRequired: pending[item.id]?.slice(1) ?? [],
  status: mapping ? "implemented" : outside[item.id] ? "not_inferable" : "inventoried",
  testedBy: [
   ...evaluations.filter(([, ids]) => ids.has(item.id)).map(([name]) => name),
   ...(item.id === "repetition" ? ["deterministic unit test"] : [])
  ],
  gap: outside[item.id] ?? mapping?.partial ?? (mapping ? null : "Predicate and context mapping pending."),
  existing: { extensionCopy: kind === "technique" ? Boolean(copy) : null,
   changedCopyFields: copy ? ["title", "category", "summary"].filter(key => copy[key] !== item[key]) : [],
   regex: regex.has(item.id) || positiveRules.has(item.id),
   ...(kind === "concealed" ? { positiveIds: item.positiveIds, negativeIds: item.negativeIds } : {}) }
 };
}));
const canonicalIds = new Set(records.map(row => row.id));
if (canonicalIds.size !== records.length || Object.keys(mappings).some(id => !canonicalIds.has(id)) ||
    records.some(row => !row.context)) {
 throw Error("Duplicate catalogue ID or orphan hybrid mapping");
}
const runtimeOnly = [
 { id: "orthographic_attention_hook", source: "extension/src/text-preprocessing.mjs", kind: "preprocessing_diagnostic",
  context: "sentence", status: "implemented" },
 { id: "nonstandard_vocabulary", source: "extension/src/matcher-worker.js", kind: "preprocessing_diagnostic",
  context: "clause", status: "implemented" }
];
const markdown = ["# Hybrid catalogue coverage", "",
 "The published catalogues supply canonical IDs. The extension copy supplies existing runtime evidence. An implemented row covers the registered textual construction. See the benchmark for observed performance.", "",
 "| ID | Family | Status | Context | Required | Supporting | Tested by | Gap |",
 "| --- | --- | --- | --- | --- | --- | --- | --- |", ...records.map(r =>
  "| " + [r.id, r.kind, r.status, r.context, (r.required.length ? r.required : r.pendingRequired).join(", "),
   r.supporting.join(", "), r.testedBy.join(", "), r.gap ?? ""].join(" | ") + " |"), "",
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
