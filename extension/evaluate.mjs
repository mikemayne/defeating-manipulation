import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compilePatternRules, prototypeEntries, matchText } from "./src/matching-core.mjs";
import { embeddingRows } from "./src/embedding-rows.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const args = process.argv.slice(2);
const semanticMode = args.includes("--semantic");
const strict = args.includes("--strict");
const json = args.includes("--json");
const opt = name => args.find(arg => arg.startsWith(name + "="))?.slice(name.length + 1);
const fixturePath = path.resolve(opt("--fixtures") || path.join(root, "evaluation/matcher-examples.json"));
const read = filepath => JSON.parse(fs.readFileSync(filepath, "utf8"));
const catalogue = read(path.join(here, "techniques.json"));
const patternCatalogue = read(path.join(here, "patterns.json"));
const rules = compilePatternRules(catalogue, patternCatalogue);
const techniques = catalogue.techniques || [];
const fixtureFile = read(fixturePath);
const seeds = fixtureFile.cases || [];
const prefix = "The meeting opened with a summary of routine administrative decisions.\n";
const suffix = "\nThe clerk recorded the date and scheduled the next ordinary meeting.";
const wrap = text => text.replace(/,\s+/g, ",\n").replace(/\s+or\s+/gi, "\nor\n")
 .replace(/\s+so\s+/gi, "\nso\n");
const variants = fixtureFile.variants || ["original"];
const expanded = seeds.flatMap(seed => variants.map(variant => {
 let value;
 switch (variant) {
  case "original": value = seed.text; break;
  case "context_before": value = prefix + seed.text; break;
  case "context_after": value = seed.text + suffix; break;
  case "surrounding_lines": value = prefix + seed.text + suffix; break;
  case "wrapped_lines": value = wrap(seed.text); break;
  default: throw Error("Unknown fixture variant: " + variant);
 }
 return { ...seed, id: seed.id + "/" + variant, text: value };
}));
// Long selections catch accidental loss of a match during chunking.
for (const seed of seeds.filter(item => item.expected.length && item.expected.length <= 2).slice(0, 5)) {
 const filler = Array.from({ length: 20 }, (_, i) =>
  "Administrative note " + (i + 1) + ": attendance records were updated.").join("\n");
 expanded.push({ ...seed, id: seed.id + "/long-selection",
  text: filler + "\n" + seed.text + "\n" + filler });
}

let prototypes = [], embed = null;
if (semanticMode) {
 const { pipeline, env } = await import("@huggingface/transformers");
 env.allowRemoteModels = true;
 env.allowLocalModels = false;
 const extractor = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", { dtype: "q8" });
 embed = async texts => {
  const result = [];
  for (let i = 0; i < texts.length; i += 32) {
   const batch = texts.slice(i, i + 32);
   const embeddings = await extractor(batch, { pooling: "mean", normalize: true });
   result.push(...embeddingRows(embeddings, batch.length));
  }
  return result;
 };
 const entries = prototypeEntries(techniques);
 const vectors = await embed(entries.map(entry => entry.text));
 prototypes = entries.map((entry, index) => ({ ...entry, vector: vectors[index] }));
}

const summary = {
 mode: semanticMode ? "semantic-and-rules" : "rules-only",
 fixtures: fixturePath, count: expanded.length,
 exact: 0, tp: 0, fp: 0, fn: 0,
 falsePositiveCases: 0, negativeCases: 0,
 gatedFailures: [], failures: [], confusion: {}, perTechnique: {}
};
for (const item of expanded) {
 const matches = await matchText(item.text, { techniques, rules, prototypes, embed });
 const predicted = [...new Set(matches.map(match => match.technique.id))].sort();
 const expected = [...new Set(item.expected || [])].sort();
 const predictedSet = new Set(predicted), expectedSet = new Set(expected);
 const found = expected.filter(id => predictedSet.has(id));
 const missing = expected.filter(id => !predictedSet.has(id));
 const extra = predicted.filter(id => !expectedSet.has(id));
 summary.tp += found.length;
 summary.fn += missing.length;
 summary.fp += extra.length;
 if (!expected.length) {
  summary.negativeCases++;
  if (predicted.length) summary.falsePositiveCases++;
 }
 if (!missing.length && !extra.length) summary.exact++;
 else {
  const failure = { id: item.id, expected, predicted, missing, extra };
  summary.failures.push(failure);
  if (strict && item.gate) summary.gatedFailures.push(failure);
  const key = (expected.join("+") || "(none)") + " -> " + (predicted.join("+") || "(none)");
  summary.confusion[key] = (summary.confusion[key] || 0) + 1;
 }
 for (const id of expected) {
  const metric = summary.perTechnique[id] ||= { expected: 0, detected: 0, missed: 0 };
  metric.expected++;
  if (predictedSet.has(id)) metric.detected++;
  else metric.missed++;
 }
 for (const match of matches) {
  if (!(match.start >= 0 && match.end <= item.text.length && match.end > match.start))
   throw Error("Invalid source offsets for " + item.id);
 }
}
const fmt = value => (value * 100).toFixed(1) + "%";
const precision = summary.tp / (summary.tp + summary.fp) || 0;
const recall = summary.tp / (summary.tp + summary.fn) || 0;
const scored = { ...summary, precision, recall, exactRate: summary.exact / summary.count,
 negativeFalsePositiveRate: summary.falsePositiveCases / summary.negativeCases || 0 };
if (opt("--output")) fs.writeFileSync(path.resolve(opt("--output")), JSON.stringify(scored, null, 2) + "\n");
if (json) {
 process.stdout.write(JSON.stringify(scored, null, 2) + "\n");
} else {
 console.log("Matcher evaluation (" + scored.mode + ", same core as Firefox)");
 console.log(scored.count + " expanded cases from " + seeds.length + " curated seeds");
 console.log("Exact: " + fmt(scored.exactRate) + " | Precision: " + fmt(precision) +
  " | Recall: " + fmt(recall) + " | Negative false positives: " + fmt(scored.negativeFalsePositiveRate));
 for (const [id, item] of Object.entries(summary.perTechnique).sort((a,b)=>b[1].missed-a[1].missed))
  console.log("  " + id.padEnd(25) + item.detected + "/" + item.expected + " detected");
 if (summary.failures.length) {
  console.log("\nExamples needing investigation (" + summary.failures.length + "):");
  for (const issue of summary.failures.slice(0, 15))
   console.log("  " + issue.id + " | expected " + (issue.expected.join(",") || "none") +
    " | got " + (issue.predicted.join(",") || "none"));
 }
}
if (strict && summary.gatedFailures.length) process.exitCode = 1;
