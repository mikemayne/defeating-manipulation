import { AutoModelForSequenceClassification, AutoTokenizer } from "@huggingface/transformers";
import { softmaxScores } from "./nli-scores.mjs";

// One local NLI implementation for both the Firefox selection worker and the
// test lab. An NLI input consists of TWO tokenised texts, not two independently
// classified sentences. No selected text is sent to a server.
export const NLI_MODEL = "Xenova/distilbert-base-uncased-mnli";

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
