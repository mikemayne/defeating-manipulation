import { ARGUMENT_LABELS } from "../extension/src/argument-analysis.mjs";
const INTRO = [
 "The article opened with general background information.",
 "A separate introduction explained the history of the organisation.",
 "The publication date appeared in the header.",
 "A preliminary note gave the meeting location."
];
const OUTRO = [
 "A later section listed the contact details.",
 "A final note provided the timetable for next month.",
 "An unrelated appendix listed older publications.",
 "The editor thanked the contributors."
];

export function validateArgumentCases(cases) {
 if (!Array.isArray(cases) || !cases.length) throw Error("No argument-support examples provided");
 const seen = new Set();
 for (const [i, item] of cases.entries()) {
  if (typeof item?.id !== "string" || !item.id.trim() ||
      typeof item.text !== "string" || !item.text.trim() ||
      !Array.isArray(item.expected) || item.expected.length > 1 ||
      item.expected.some(label => !ARGUMENT_LABELS.includes(label)))
   throw Error("Invalid argument-support example at row " + (i + 1));
  if (seen.has(item.id)) throw Error("Duplicate argument-support example ID: " + item.id);
  seen.add(item.id);
 }
 return cases;
}

export function generatedArgumentCase(cases, index, seed = 2026) {
 if (!cases.length) throw Error("No argument-support cases");
 const item = cases[index % cases.length];
 const variant = Math.floor(index / cases.length) % 5;
 const h = (Math.imul(index + 1, 1664525) + (seed >>> 0)) >>> 0;
 let text = item.text;
 // Three blank lines isolate ordinary surrounding prose from the actual
 // argument, preventing unrelated context from becoming an invented premise.
 if (variant === 1) text = INTRO[h % INTRO.length] + "\n\n\n\n" + text;
 else if (variant === 2) text = text + "\n\n\n\n" + OUTRO[(h >>> 4) % OUTRO.length];
 else if (variant === 3) text = INTRO[h % INTRO.length] + "\n\n\n\n" +
  text + "\n\n\n\n" + OUTRO[(h >>> 4) % OUTRO.length];
 else if (variant === 4) text = text.split(/\n\s*\n/).map(paragraph =>
  paragraph.replace(/\. +(?=[A-Z])/g, ".\n")).join("\n\n");
 return { ...item, id: item.id + "/generated-" + index, variant, text };
}
