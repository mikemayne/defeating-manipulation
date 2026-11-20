import { pipeline, env } from "@huggingface/transformers";
import { paraphraseParagraphs } from "./paragraph-paraphraser.mjs";

env.allowLocalModels = false;
env.allowRemoteModels = true;
env.useBrowserCache = true;
env.backends.onnx.wasm.wasmPaths = new URL("./ort/", self.location.href).href;

// An additional *generative* model is necessary: MiniLM and MNLI classify,
// but neither can produce a paraphrase.
export const PARAPHRASE_MODEL = "Xenova/flan-t5-small";
let generatorPromise;
const cancelled = new Set();
let busy = false;

function loadGenerator() {
 if (!generatorPromise) {
  generatorPromise = pipeline("text2text-generation", PARAPHRASE_MODEL, { dtype: "q8" })
   .catch(error => { generatorPromise = null; throw error; });
 }
 return generatorPromise;
}

self.addEventListener("message", async event => {
 const message = event.data || {};
 if (message.type === "cancel") {
  cancelled.add(message.id);
  return;
 }
 if (message.type !== "paraphrase") return;
 if (busy) {
  self.postMessage({ type: "error", id: message.id, error: "Paraphraser is busy" });
  return;
 }
 busy = true;
 try {
  self.postMessage({ type: "stage", id: message.id,
   message: "Loading local paraphrase model (first use may download weights)…" });
  const generator = await loadGenerator();
  const results = await paraphraseParagraphs(message.paragraphs, (text, options) =>
   generator(text, options), {
   isCancelled: () => cancelled.has(message.id),
   onProgress: progress => self.postMessage({
    type: "progress", id: message.id, ...progress
   })
  });
  if (cancelled.has(message.id)) self.postMessage({ type: "cancelled", id: message.id });
  else self.postMessage({ type: "complete", id: message.id, paragraphs: results });
 } catch (error) {
  self.postMessage(cancelled.has(message.id)
   ? { type: "cancelled", id: message.id }
   : { type: "error", id: message.id, error: String(error?.message || error) });
 } finally {
  busy = false;
  cancelled.delete(message.id);
 }
});
