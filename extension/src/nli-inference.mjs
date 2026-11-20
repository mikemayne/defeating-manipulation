import { AutoModelForSequenceClassification, AutoTokenizer } from "@huggingface/transformers";

// One local NLI implementation for both the Firefox selection worker and the
// test lab. An NLI input consists of TWO tokenised texts, not two independently
// classified sentences. No selected text is sent to a server.
export const NLI_MODEL = "Xenova/distilbert-base-uncased-mnli";

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

export async function createNliScorer({ onStatus = () => {} } = {}) {
 onStatus("Downloading or loading local contradiction model…");
 // Loading and scoring use the same model in both worker entrypoints.
 const [tokenizer, model] = await Promise.all([
  AutoTokenizer.from_pretrained(NLI_MODEL),
  AutoModelForSequenceClassification.from_pretrained(NLI_MODEL, { dtype: "q8" })
 ]);
 onStatus("Local contradiction model ready");
 const labels = model.config?.id2label || {};
 return async function scorePair(premise, hypothesis) {
  const tokens = await tokenizer(premise, {
   text_pair: hypothesis, truncation: true, max_length: 256
  });
  const prediction = await model(tokens);
  if (!prediction?.logits?.data) throw Error("NLI model returned no logits");
  return softmaxScores(prediction.logits.data, labels);
 };
}
