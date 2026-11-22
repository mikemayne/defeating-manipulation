import { analyzeHybrid } from "../extension/src/hybrid-detector.mjs";
import { createOllamaClassifier } from "../extension/src/hybrid-ollama.mjs";

const flags = process.argv.slice(2);
const budgetFlag = flags.find(flag => flag.startsWith("--budget="));
if (flags.some(flag => flag !== "--ollama" && flag !== "--complete" && flag !== "--grammar" && flag !== "--structured" && flag !== "--pressure-tree" && flag !== "--pressure-roles" && flag !== budgetFlag)) {
 throw Error("Usage: node scripts/analyze-hybrid.mjs [--ollama] [--complete] [--grammar] [--structured] [--pressure-tree] [--pressure-roles] [--budget=N] < passage.txt");
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
 findPriorActivities: flags.includes("--grammar")
  ? (await import("../extension/src/hybrid-grammar.mjs")).findPriorActivities : undefined,
 structured: flags.includes("--structured") || flags.includes("--pressure-tree") || flags.includes("--pressure-roles"),
 mode,
 budget: budgetFlag ? Number(budgetFlag.slice(9)) : mode === "complete" ? 96 : 48
});
if (flags.includes("--pressure-tree")) {
 const { predictPressure } = await import("../extension/src/sir-pressure-tree.mjs");
 const { default: model } = await import("../extension/src/sir-pressure-model.json", { with: { type: "json" } });
 for (const scope of result.scopes) {
  scope.experimentalPressure = scope.scope.truncated ? { status: "truncated" } : predictPressure(scope.structure, model);
 }
}
if (flags.includes("--pressure-roles")) {
 const { roleFeatures, assessRoles } = await import("../extension/src/sir-pressure-roles.mjs");
 const { default: model } = await import("../extension/src/sir-pressure-role-model.json", { with: { type: "json" } });
 for (const scope of result.scopes) {
  scope.pressureRoles = scope.scope.truncated ? { status: "truncated" } : assessRoles(roleFeatures(scope.structure), model);
 }
}
console.log(JSON.stringify(result, null, 2));
