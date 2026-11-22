import { analyzeHybrid } from "../extension/src/hybrid-detector.mjs";
import { createOllamaClassifier } from "../extension/src/hybrid-ollama.mjs";

const flags = process.argv.slice(2);
const budgetFlag = flags.find(flag => flag.startsWith("--budget="));
if (flags.some(flag => flag !== "--ollama" && flag !== "--complete" && flag !== budgetFlag)) {
 throw Error("Usage: node scripts/analyze-hybrid.mjs [--ollama] [--complete] [--budget=N] < passage.txt");
}
let text = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) {
 text += chunk.slice(0, 4801 - text.length);
 if (text.length >= 4801) break;
}
const mode = flags.includes("--complete") ? "complete" : "selective";
const result = await analyzeHybrid(text, {
 classify: flags.includes("--ollama") ? createOllamaClassifier() : undefined,
 mode,
 budget: budgetFlag ? Number(budgetFlag.slice(9)) : mode === "complete" ? 96 : 48
});
console.log(JSON.stringify(result, null, 2));
