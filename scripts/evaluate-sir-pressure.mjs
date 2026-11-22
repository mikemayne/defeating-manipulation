import { fit, score } from "./sir-tree-training.mjs";
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
