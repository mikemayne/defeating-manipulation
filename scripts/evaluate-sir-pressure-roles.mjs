import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import { analyzeStructure } from "../extension/src/semantic-structure.mjs";
import { predictPressure } from "../extension/src/sir-pressure-tree.mjs";
import { roleFeatures, assessRoles } from "../extension/src/sir-pressure-roles.mjs";
import { fit, score } from "./sir-tree-training.mjs";
import baseline from "../extension/src/sir-pressure-model.json" with { type: "json" };

const cache = new URL("../classifier/artifacts/pressure/", import.meta.url);
const read = name => readFileSync(new URL(name, cache), "utf8").trim().split(/\r?\n/).map(JSON.parse);
const targets = { fear: "fear_consequences", doubt: "judgement_doubt" };
const key = r => r.text.trim().toLowerCase().replace(/\s+/g, " ");
function prepare(row) {
 const sir = analyzeStructure(row.text);
 return { ...row, roles: roleFeatures(sir), original: predictPressure(sir, baseline),
  positive: Number(Object.values(targets).some(t => row.labels.includes(t))) };
}
const targeted = read("targeted/labels.jsonl");
const seen = new Set(), threads = new Map();
function partition(name) {
 return targeted.filter(r => r.part === name).filter(r => {
  assert.ok(!threads.has(r.thread) || threads.get(r.thread) === name);
  threads.set(r.thread, name);
  if (seen.has(key(r))) return false;
  seen.add(key(r)); return true;
 }).map(prepare);
}
const train = partition("train"), cal = partition("calibration");
const model = { version: 2, threshold: 0 };
for (const [family, label] of Object.entries(targets))
 model[family] = fit(train.map(r => ({ features: r.roles[family], positive: Number(r.labels.includes(label)) })), 4);
const targetRecall = score(cal, r => r.original.flagged).recall;
const value = r => assessRoles(r.roles, model).score;
const cuts = [...new Set(cal.map(value))].sort((a,b) => b-a);
model.threshold = cuts.find(t => score(cal, r => value(r) >= t).recall >= targetRecall);
const modelFile = new URL("../extension/src/sir-pressure-role-model.json", import.meta.url);
if (process.argv.includes("--write-model")) writeFileSync(modelFile, JSON.stringify(model,null,2)+"\n");
else assert.deepEqual(JSON.parse(readFileSync(modelFile)), model);
const oldTest = partition("test");
const fresh = read("labels.jsonl").filter(r => {
 if (threads.has(r.thread) || seen.has(key(r)) || r.labels.includes("insufficient_context")) return false;
 seen.add(key(r)); return true;
}).map(prepare);
function compare(sample) {
 const original = score(sample,r => r.original.flagged);
 const revised = score(sample,r => value(r) >= model.threshold);
 // Linear interpolation across the tied leaf at the original recall.
 const thresholds = [Infinity,...new Set(sample.map(value).sort((a,b)=>b-a))];
 let previous = {tp:0,fp:0}, matched;
 for (const t of thresholds) {
  const point = score(sample, r=>value(r)>=t);
  if (point.tp >= original.tp) {
   matched = previous.fp + (point.fp-previous.fp)*(original.tp-previous.tp)/(point.tp-previous.tp || 1);
   break;
  }
  previous = point;
 }
 return { n: sample.length, original, revised, matchedExpectedFP: matched };
}
console.log(JSON.stringify({ targetRecall, calibration:compare(cal), diagnostic:compare(oldTest),
 trainingCueCounts: Object.fromEntries(["consequence/listener_condition","consequence/speaker_penalty",
  "consequence/listener_loss","consequence/offered_help","judgement/direct_dismissal","judgement/listener_belief"]
  .map(cue=>[cue,train.filter(row=>row.roles.fear.has(cue)||row.roles.doubt.has(cue)).length])),
 independent:compare(fresh) },null,2));
if (process.argv.includes("--review")) {
 // Deterministic blind sample independent of model predictions and teacher labels.
 const review = [...fresh].sort((a,b)=>a.id.localeCompare(b.id)).slice(0,60)
  .map(({id,text})=>({id,text,fear:null,doubt:null,context:null}));
 for (const reviewer of ["a","b"]) {
  const path = new URL("role-review-"+reviewer+".jsonl",cache);
  try { writeFileSync(path,review.map(r=>JSON.stringify(r)).join("\n")+"\n",{flag:"wx"}); }
  catch(error) { if(error.code !== "EEXIST") throw error; }
 }
}
