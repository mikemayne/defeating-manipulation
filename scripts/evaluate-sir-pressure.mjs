import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { analyzeStructure } from "../extension/src/semantic-structure.mjs";
import { pressureFeatures, walkPressureTree, predictPressure } from "../extension/src/sir-pressure-tree.mjs";

const file = new URL("../classifier/artifacts/pressure/targeted/labels.jsonl", import.meta.url);
const raw = readFileSync(file, "utf8");
const rows = raw.trim().split(/\r?\n/).map(line => JSON.parse(line));
const threads = new Map();
const seen = new Set();
const parts = {};
for (const part of ["train", "calibration", "test"]) {
 parts[part] = [];
 for (const row of rows.filter(row => row.part === part)) {
  assert.ok(row.thread && row.text.trim() && Array.isArray(row.labels));
  assert.ok(!threads.has(row.thread) || threads.get(row.thread) === part, "thread crosses partitions");
  threads.set(row.thread, part);
  const key = row.text.trim().toLowerCase().replace(/\s+/g, " ");
  if (seen.has(key)) continue;
  seen.add(key);
  assert.ok(row.labels.every(label => ["fear_consequences", "judgement_doubt"].includes(label)));
  const structure = analyzeStructure(row.text);
  parts[part].push({ features: pressureFeatures(structure), structure, labels: row.labels,
   positive: Number(row.labels.length > 0) });
 }
}

const positives = sample => sample.reduce((sum, row) => sum + row.positive, 0);
const impurity = sample => {
 const p = positives(sample) / sample.length;
 return sample.length * 2 * p * (1 - p);
};
function fit(sample, depth) {
 const leaf = { count: sample.length, positive: positives(sample) };
 if (!depth || leaf.positive === 0 || leaf.positive === leaf.count) return leaf;
 const candidates = [...new Set(sample.flatMap(row => [...row.features]))].sort();
 let best, loss = impurity(sample);
 for (const feature of candidates) {
  const yes = [], no = [];
  for (const row of sample) (row.features.has(feature) ? yes : no).push(row);
  if (Math.min(yes.length, no.length) < 10) continue;
  const splitLoss = impurity(yes) + impurity(no);
  if (splitLoss < loss - 1e-9) {
   best = { feature, yes, no };
   loss = splitLoss;
  }
 }
 return best ? { feature: best.feature, yes: fit(best.yes, depth - 1), no: fit(best.no, depth - 1) } : leaf;
}
function score(sample, decide) {
 let tp = 0, fp = 0, tn = 0, fn = 0;
 for (const row of sample) {
  if (decide(row)) row.positive ? tp++ : fp++;
  else row.positive ? fn++ : tn++;
 }
 const ratio = (a, b) => b ? a / b : null;
 return { tp, fp, tn, fn, precision: ratio(tp, tp + fp), recall: ratio(tp, tp + fn),
  f1: ratio(2 * tp, 2 * tp + fp + fn), fpr: ratio(fp, fp + tn) };
}
const root = fit(parts.train, 4);
const leafScore = row => walkPressureTree(root, row.features).score;
const thresholds = [...new Set(parts.calibration.map(leafScore))].sort((a,b) => b-a);
let best = -1, threshold;
for (const cutoff of thresholds) {
 const { f1 } = score(parts.calibration, row => leafScore(row) >= cutoff);
 if (f1 > best) { best = f1; threshold = cutoff; }
}
const model = { version: 1, threshold, root };
const decide = row => predictPressure(row.structure, model).flagged;
const output = new URL("../extension/src/sir-pressure-model.json", import.meta.url);
if (process.argv.includes("--write-model")) writeFileSync(output, JSON.stringify(model, null, 2) + "\n");
else assert.deepEqual(JSON.parse(readFileSync(output)), model);
console.log(JSON.stringify({ sha256: createHash("sha256").update(raw).digest("hex"),
 sizes: Object.fromEntries(Object.entries(parts).map(([part, sample]) => [part, sample.length])),
 root: root.feature, threshold, calibration: score(parts.calibration, decide),
 test: score(parts.test, decide), alwaysPositive: score(parts.test, () => true),
 alwaysNegative: score(parts.test, () => false) }, null, 2));
