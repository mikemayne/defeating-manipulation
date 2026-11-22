export function structureSignals(structure, scope, { features = true, relations = true } = {}) {
 const clauses = structure.paragraphs.flatMap(paragraph =>
  paragraph.sentences.flatMap(sentence => sentence.clauses));
 const direct = clauses.filter(clause =>
  !clause.kinds.some(kind => ["quotation", "parenthetical", "reported_speech"].includes(kind)));
 const edges = structure.paragraphs.flatMap(paragraph => paragraph.edges);
 const answers = new Map();
 const priorities = new Set();
 const find = (clause, type) => clause?.features.find(feature => feature.type === type);
 const answer = (id, spans, limit) => answers.set(id, {
  answer: "yes", status: "answered", method: "structure",
  evidence: spans.map(({ start, end, text }) => ({ id, start, end, quote: text, scope, limit }))
 });

 if (features) {
  const knowledge = direct.filter(clause => clause.speechActs.some(act => act.type === "assertion") &&
   !clause.kinds.includes("subordinate")).flatMap(clause =>
   find(clause, "addressee_lacks_knowledge")?.evidence ?? []);
  if (knowledge.length) answer("addressee_lacks_knowledge", knowledge.slice(0, 3),
   "Recognizable wording in a direct assertion.");
  if (direct.some(clause => find(clause, "unspecified_future_event") || find(clause, "negative_outcome"))) {
   priorities.add("unfavourable_future");
  }
 }
 if (relations) {
  for (const edge of edges) {
   if (edge.type === "condition_consequence") {
    priorities.add("conditional_penalty");
    priorities.add("choice_with_linked_penalty");
    priorities.add("unfavourable_future");
   }
   if (["claim_justification", "claim_evidence", "statement_conclusion"].includes(edge.type)) {
    priorities.add("reason_supports");
   }
  }
 }
 return { answers, priorities };
}
