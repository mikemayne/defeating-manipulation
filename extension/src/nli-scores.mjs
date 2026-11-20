// Pure, testable conversion of NLI model logits to class scores.
export function softmaxScores(logits, id2label = {}) {
 const values = Array.from(logits);
 if (values.length !== 3 || values.some(value => !Number.isFinite(value)))
  throw Error("Unexpected NLI logits; expected exactly three finite scores");
 const max = Math.max(...values);
 const scaled = values.map(value => Math.exp(value - max));
 const total = scaled.reduce((sum, value) => sum + value, 0);
 const scores = {};
 for (let i = 0; i < values.length; i++) {
  const label = String(id2label[i] || id2label[String(i)] ||
   ["contradiction", "neutral", "entailment"][i]).toLowerCase();
  const key = label.includes("contradiction") || label === "label_0" ? "contradiction"
   : label.includes("neutral") || label === "label_1" ? "neutral"
   : label.includes("entailment") || label === "label_2" ? "entailment" : null;
  if (!key) throw Error("Unknown NLI output label: " + label);
  scores[key] = scaled[i] / total;
 }
 if (["contradiction", "neutral", "entailment"].some(key => scores[key] === undefined))
  throw Error("NLI model does not expose contradiction, neutral and entailment labels");
 return scores;
}

