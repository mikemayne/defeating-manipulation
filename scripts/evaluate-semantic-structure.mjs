import { readFileSync } from "node:fs";
import { cpus } from "node:os";
import { analyzeStructure } from "../extension/src/semantic-structure.mjs";
import { analyzeHybrid } from "../extension/src/hybrid-detector.mjs";
import { createOllamaClassifier } from "../extension/src/hybrid-ollama.mjs";
import { compilePatternRules, matchText } from "../extension/src/matching-core.mjs";
import { matchPositiveText } from "../extension/src/positive-matching.mjs";
import { findConcealedPatterns } from "../extension/src/concealed-matching.mjs";
import { findScrutinyWarnings } from "../extension/src/scrutiny-signals.mjs";
import { preprocessText } from "../extension/src/text-preprocessing.mjs";

const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const cases = read("../evaluation/semantic-structure-holdout.json");
const frozen = read("../evaluation/hybrid-frozen-examples.json").map(([id, text, patterns, answers]) =>
 ({ id: "frozen-" + id, text, patterns, answers }));
const catalogue = read("../extension/techniques.json");
const rules = compilePatternRules(catalogue, read("../extension/patterns.json"));
const active = [...cases, ...frozen];
const labels = new Set(active.flatMap(item => item.patterns));
const opts = new Set(process.argv.slice(2));
const ollama = opts.has("--ollama");
const replay = opts.has("--replay");
const repeats = ollama ? 1 : 25;
const classifier = ollama ? createOllamaClassifier() : undefined;
const complete = opts.has("--complete");
const budget = complete ? 96 : 3;
const fmt = (key, start, end) => [key, start, end].join(":");

function metrics(expected, observed) {
 let tp = 0, fp = 0, fn = 0;
 for (const key of expected) observed.has(key) ? tp++ : fn++;
 for (const key of observed) if (!expected.has(key)) fp++;
 const ratio = (a, b) => b ? +(a / b).toFixed(4) : null;
 return { tp, fp, fn, precision: ratio(tp, tp + fp), recall: ratio(tp, tp + fn),
  f1: ratio(2 * tp, 2 * tp + fp + fn) };
}
const latency = samples => {
 const sorted = [...samples].sort((a, b) => a - b);
 const percentile = p => +sorted[Math.ceil(sorted.length * p) - 1].toFixed(4);
 return { medianMs: percentile(0.5), p95Ms: percentile(0.95), samples: sorted.length };
};

const structuralExpected = { clauses: new Set(), speechActs: new Set(), features: new Set(), relationships: new Set() };
const structuralObserved = Object.fromEntries(Object.keys(structuralExpected).map(key => [key, new Set()]));
const structuralTimes = [], sizes = [], structuralErrors = [];
for (let cycle = -1; cycle < repeats; cycle++) for (const item of active) {
 const start = performance.now();
 const structure = analyzeStructure(item.text);
 if (cycle >= 0) structuralTimes.push(performance.now() - start);
 if (cycle !== 0) continue;
 sizes.push(Buffer.byteLength(JSON.stringify(structure)));
 if (!item.clauses) continue;
 const expected = new Map();
 let from = 0;
 for (const [quote, acts, features] of item.clauses) {
  const begin = item.text.indexOf(quote, from);
  if (begin < 0) throw Error("Missing gold span for " + item.id);
  const end = begin + quote.length;
  expected.set(expected.size, [begin, end]);
  // Clauses can contain nested spans from the same sentence.
  from = begin;
  structuralExpected.clauses.add(fmt(item.id, begin, end));
  acts.forEach(type => structuralExpected.speechActs.add(fmt(item.id + ":" + type, begin, end)));
  features.forEach(type => structuralExpected.features.add(fmt(item.id + ":" + type, begin, end)));
 }
 for (const [type, left, right] of item.edges) {
  structuralExpected.relationships.add([item.id, type, ...expected.get(left), ...expected.get(right)].join(":"));
 }
 const actual = new Map();
 for (const paragraph of structure.paragraphs) {
  for (const sentence of paragraph.sentences) for (const clause of sentence.clauses) {
   const { start, end } = clause;
   actual.set(clause.id, [start, end]);
   structuralObserved.clauses.add(fmt(item.id, start, end));
   clause.speechActs.forEach(({ type }) => structuralObserved.speechActs.add(fmt(item.id + ":" + type, start, end)));
   clause.features.forEach(({ type }) => structuralObserved.features.add(fmt(item.id + ":" + type, start, end)));
  }
  for (const { type, from, to } of paragraph.edges) {
   structuralObserved.relationships.add([item.id, type, ...actual.get(from), ...actual.get(to)].join(":"));
  }
 }
 for (const key of Object.keys(structuralExpected)) {
  const prefix = item.id + ":";
  const want = [...structuralExpected[key]].filter(value => value.startsWith(prefix));
  const found = [...structuralObserved[key]].filter(value => value.startsWith(prefix));
  if (want.some(value => !found.includes(value)) || found.some(value => !want.includes(value))) {
   structuralErrors.push({ id: item.id, task: key, missing: want.filter(value => !found.includes(value)),
    extra: found.filter(value => !want.includes(value)) });
  }
 }
}

async function baseline(text) {
 const preprocessing = preprocessText(text, { correctSpelling: false });
 const working = preprocessing.analysisText;
 const negativeMatches = await matchText(working, { techniques: catalogue.techniques, rules });
 const positiveMatches = await matchPositiveText(working);
 const concealed = findConcealedPatterns(working, { negativeMatches, positiveMatches });
 const findings = [...negativeMatches, ...positiveMatches, ...concealed];
 const orange = findScrutinyWarnings(working, { findings, preprocessingFlags: preprocessing.flags });
 return { predicted: [...findings, ...orange].map(item => item.technique?.id ?? item.id), calls: 0 };
}
const arms = [
 ["A", null], ["B", null], ["C", {}], ["C_without_features", { features: false }],
 ["C_without_relations", { relations: false }], ["C_without_adapter", { features: false, relations: false }]
];
const report = {};
for (const [name, structureOptions] of arms) {
 const samples = [], expected = new Set(), observed = new Set(), positivesOnNegatives = [], changes = [];
 let calls = 0, resolved = 0;
 for (let cycle = -1; cycle < repeats; cycle++) for (const item of active) {
  const start = performance.now();
  let row;
  if (name === "A") row = await baseline(item.text);
  else {
   // Replay measures routing and call counts with an ideal response for
   // annotated questions. Its latency is JS overhead, not model latency.
   const classify = classifier ?? (replay ? async messages => {
    const { question_id, passage } = JSON.parse(messages[1].content);
    const answer = item.answers?.[question_id] ?? "unknown";
    return JSON.stringify({ question_id, answer, evidence: answer === "yes" ? [passage] : [] });
   } : undefined);
   const result = await analyzeHybrid(item.text, {
    structured: Boolean(structureOptions), structureOptions, classify, budget, scopeEvidence: replay,
    mode: complete ? "complete" : "selective"
   });
   row = { calls: result.calls,
    resolved: result.scopes.reduce((count, scope) => count + scope.trace.filter(({ id }) =>
     ["yes", "no"].includes(scope.answers[id].answer)).length, 0),
    predicted: result.scopes.flatMap(scope => scope.patterns.filter(pattern => pattern.state === "supported")
     .map(pattern => pattern.id)) };
  }
  if (cycle >= 0) samples.push(performance.now() - start);
  if (cycle !== 0) continue;
  calls += row.calls;
  resolved += row.resolved ?? 0;
  const predicted = [...new Set(row.predicted.filter(pattern => labels.has(pattern)))];
  item.patterns.forEach(pattern => expected.add(item.id + ":" + pattern));
  predicted.forEach(pattern => observed.add(item.id + ":" + pattern));
  if (!item.patterns.length && predicted.length) positivesOnNegatives.push(item.id);
  if (predicted.length !== item.patterns.length || item.patterns.some(pattern => !predicted.includes(pattern))) {
   changes.push({ id: item.id, expected: item.patterns, predicted });
  }
 }
 const negativeCount = active.filter(item => !item.patterns.length).length;
 report[name] = { ...metrics(expected, observed), ...latency(samples), modelCalls: calls,
  resolvedSemanticQuestions: resolved, positivesOnNegatives, negativeCount,
  falsePositiveRate: positivesOnNegatives.length / negativeCount, errors: changes };
}
console.log(JSON.stringify({ cpu: cpus()[0]?.model, node: process.version, cases: active.length,
 structuralCases: cases.filter(item => item.clauses).length, patternIds: [...labels].sort(),
 condition: ollama ? "ollama" : replay ? "labelled routing replay" : "rules only", budget, mode: complete ? "complete" : "selective",
 structure: { ...latency(structuralTimes), maxSerializedBytes: Math.max(...sizes),
  metrics: Object.fromEntries(Object.keys(structuralExpected).map(key =>
   [key, metrics(structuralExpected[key], structuralObserved[key])])),
  errors: structuralErrors }, arms: report }, null, 2));
