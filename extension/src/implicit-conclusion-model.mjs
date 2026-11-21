// Shared generator for the Firefox matcher and local benchmark lab.
// The text is processed in-browser; cached weights may be fetched on first use.
import { pipeline } from "@huggingface/transformers";
export const IMPLICIT_CONCLUSION_MODEL = "Xenova/flan-t5-small";
let generatorPromise;
export async function generateImpliedConclusion(prompt) {
 if (!generatorPromise) generatorPromise = pipeline(
  "text2text-generation", IMPLICIT_CONCLUSION_MODEL, { dtype: "q8" })
  .catch(error => { generatorPromise = null; throw error; });
 const generator = await generatorPromise;
 const output = await generator(prompt, { max_new_tokens: 54, do_sample: false });
 if (typeof output?.[0]?.generated_text !== "string")
  throw Error("Local conclusion model produced no text");
 return output[0].generated_text;
}
