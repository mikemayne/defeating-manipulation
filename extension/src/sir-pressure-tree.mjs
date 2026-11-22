/** Binary splits use only observed SIR categories. Each decision can be inspected. */
export function pressureFeatures(structure) {
 const features = new Set();
 for (const paragraph of structure.paragraphs) {
  for (const edge of paragraph.edges) features.add("relation/" + edge.type);
  for (const sentence of paragraph.sentences) {
   if (sentence.attributedTo) features.add("attributed");
   if (sentence.clauses.length > 1) features.add("multiple_clauses");
   for (const clause of sentence.clauses) {
    for (const kind of clause.kinds) features.add("kind/" + kind);
    for (const act of clause.speechActs) features.add("act/" + act.type);
    for (const feature of clause.features) features.add("feature/" + feature.type);
   }
  }
 }
 return features;
}

export function walkPressureTree(root, features) {
 let node = root;
 const path = [];
 while (node.feature) {
  const present = features.has(node.feature);
  path.push({ feature: node.feature, present });
  node = present ? node.yes : node.no;
 }
 return { path, score: node.positive / node.count };
}

export function predictPressure(structure, model) {
 const result = walkPressureTree(model.root, pressureFeatures(structure));
 return { ...result, flagged: result.score >= model.threshold };
}
