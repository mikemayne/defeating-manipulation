import { createInterface } from "node:readline";
import { analyzeStructure } from "../extension/src/semantic-structure.mjs";
import { roleFeatures } from "../extension/src/sir-pressure-roles.mjs";
import { predictPressure } from "../extension/src/sir-pressure-tree.mjs";
import model from "../extension/src/sir-pressure-model.json" with { type: "json" };

// Local JSONL bridge for the offline encoder experiment.
for await (const line of createInterface({ input: process.stdin })) {
 const structure = analyzeStructure(JSON.parse(line));
 const roles = roleFeatures(structure), links = [];
 for (const paragraph of structure.paragraphs) {
  const clauses = new Map(paragraph.sentences.flatMap(s => s.clauses.map(c => [c.id, c])));
  for (const edge of paragraph.edges.filter(e => e.type === "condition_consequence")) {
   links.push([clauses.get(edge.from).text, clauses.get(edge.to).text]);
  }
 }
 console.log(JSON.stringify({ links, cues: [...new Set([...roles.fear, ...roles.doubt])],
  baseline: predictPressure(structure, model).flagged }));
}
