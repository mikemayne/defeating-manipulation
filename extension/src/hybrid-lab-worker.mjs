import { analyzeHybrid } from "./hybrid-detector.mjs";
import { createOllamaClassifier } from "./hybrid-ollama.mjs";

self.addEventListener("message", async ({ data }) => {
 try {
  const result = await analyzeHybrid(data.text, {
   classify: data.useOllama ? createOllamaClassifier() : undefined,
   mode: data.complete ? "complete" : "selective",
   budget: data.complete ? 96 : 42
  });
  self.postMessage({ result });
 } catch {
  self.postMessage({ error: "Analysis failed." });
 }
}, { once: true });
