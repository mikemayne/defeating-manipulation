// Independent of the manipulation generator: all inconsistency labels are
// about contradictions between statements *inside the same selected passage*.
const INTRO = [
 "The report included the following statements.",
 "A short introduction summarised the public information.",
 "The discussion turned to the availability of local services.",
 "The clerk recorded the competing descriptions in the notes."
];
const OUTRO = [
 "The report was published on the following morning.",
 "The next meeting date was announced separately.",
 "An appendix contained ordinary administrative details.",
 "The minutes were filed for future reference."
];

export function validateConsistencyCases(cases) {
 if (!Array.isArray(cases) || !cases.length) throw Error("The inconsistency dataset has no examples");
 const seen = new Set();
 for (const [index, item] of cases.entries()) {
  if (!item || typeof item.id !== "string" || !item.id.trim() ||
      typeof item.text !== "string" || !item.text.trim() ||
      !Array.isArray(item.expected) ||
      item.expected.some(id => id !== "argument_inconsistency") ||
      new Set(item.expected).size !== item.expected.length) {
   throw Error("Invalid inconsistency example or label at row " + (index + 1) +
    ". Use expected: [\"argument_inconsistency\"] or expected: [].");
  }
  if (seen.has(item.id)) throw Error("Duplicate example ID: " + item.id);
  seen.add(item.id);
 }
 return cases;
}

export function generatedConsistencyCase(cases, index, seed = 2026) {
 if (!cases.length) throw Error("No consistency seeds supplied");
 const item = cases[index % cases.length];
 const variant = Math.floor(index / cases.length) % 5;
 const h = Math.abs((index * 1664525 + seed * 1013904223) | 0);
 const intro = INTRO[h % INTRO.length], outro = OUTRO[(h >>> 4) % OUTRO.length];
 let text = item.text;
 if (variant === 1) text = intro + "\n" + text;
 else if (variant === 2) text += "\n" + outro;
 else if (variant === 3) text = intro + "\n" + text + "\n" + outro;
 else if (variant === 4) text = text.replace(/\.\s+(?=[A-Z])/g, ".\n");
 return { ...item, id: item.id + "/generated-" + index, text, variant };
}
