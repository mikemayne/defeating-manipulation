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
  const grammar = /\bstop(?:s|ped|ping)?\b/i.test(data.text)
   ? await import("../hybrid-grammar.js").catch(() => null) : null;
  const result = await analyzeHybrid(data.text, {
   classify,
   structured: data.structured === true,
   findPriorActivities: grammar?.findPriorActivities,
   scopeEvidence: data.model === "browser",
   mode: data.complete ? "complete" : "selective",
   budget: data.complete ? 96 : data.model === "browser" ? 6 : 42,
   onCall: (calls, budget) => self.postMessage({ stage: "Analysing locally. Model call " + calls + " of up to " + budget + "…" })
  });
  self.postMessage({ result, milliseconds: Math.round(performance.now() - started) });
 } catch {
  self.postMessage({ error: "Analysis failed." });
 }
}, { once: true });
