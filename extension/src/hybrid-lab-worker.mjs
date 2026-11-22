import { analyzeHybrid } from "./hybrid-detector.mjs";
import { createOllamaClassifier } from "./hybrid-ollama.mjs";

self.addEventListener("message", async ({ data }) => {
 const started = performance.now();
 let classify;
 if (data.model === "browser") {
  self.postMessage({ stage: "Loading the installed browser model…" });
  try {
   const { createBrowserClassifier } = await import("../hybrid-browser-model.js");
   classify = await createBrowserClassifier();
  } catch {
   self.postMessage({ error: "Could not load the installed browser model. Check the build and model installation." });
   return;
  }
 } else if (data.model === "ollama") {
  classify = createOllamaClassifier();
 }
 try {
  self.postMessage({ stage: "Analysing locally…" });
  const result = await analyzeHybrid(data.text, {
   classify,
   mode: data.complete ? "complete" : "selective",
   budget: data.complete ? 96 : data.model === "browser" ? 12 : 42,
   onCall: (calls, budget) => self.postMessage({ stage: "Analysing locally. Model call " + calls + " of up to " + budget + "…" })
  });
  self.postMessage({ result, milliseconds: Math.round(performance.now() - started) });
 } catch {
  self.postMessage({ error: "Analysis failed." });
 }
}, { once: true });
