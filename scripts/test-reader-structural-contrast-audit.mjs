import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {VERSION,numericComparison,structuralCV}
 from "./evaluate-reader-structural-contrast.mjs";
assert.equal(VERSION,"reader-structural-contrast-v1");
const d="different_subject_category_polarity",
 q="finding_qualified_by_unknown_explanation";
const report=numericComparison([
 {gold:"but",oldChoice:"and",newChoice:"but",cue:q},
 {gold:"and",oldChoice:"but",newChoice:"but",cue:d},
 {gold:"and",oldChoice:"and",newChoice:"and",cue:null},
 {gold:"but",oldChoice:"but",newChoice:"but",cue:null},
 {gold:"and",oldChoice:"and",newChoice:"but",cue:d},
 {gold:"but",oldChoice:"and",newChoice:"and",cue:null}
]);
assert.equal(report.cases,6);
assert.deepEqual(report.baseline,{count:6,correct:3,wrong:3});
assert.deepEqual(report.withCues,{count:6,correct:3,wrong:3});
assert.equal(report.switchedToBut,2);
assert.equal(report.byKind[d].total,2);
assert.equal(report.byKind[d].byGold.and,2);
assert.equal(report.byKind[d].hurt,1);
assert.equal(report.byKind[d].unchangedBUT,1);
assert.equal(report.byKind[q].helped,1);
assert.equal(report.byKind[q].newBUT,1);
assert.doesNotMatch(JSON.stringify(report),/sentence|case_id|originalId|first|second/);
assert.throws(()=>numericComparison([]),/require/);
assert.throws(()=>numericComparison([{
 gold:"and",oldChoice:"and",newChoice:"foo",cue:null
}]),/Invalid/);
assert.throws(()=>numericComparison([{
 gold:"and",oldChoice:"and",newChoice:"but",cue:null
}]),/only promote/);
assert.throws(()=>structuralCV([],[],[],[]),/Frozen/);
const result=spawnSync(process.execPath,[
 path.resolve(path.dirname(fileURLToPath(import.meta.url)),
  "evaluate-reader-structural-contrast.mjs"),"--help"
],{encoding:"utf8",timeout:60000});
assert.equal(result.status,0,result.stderr);
assert.match(result.stdout,/offline/);
console.log("Source-free structural contrast audit: deterministic class counts, "+
 "improvement/regression bookkeeping, validation of source-only outputs "+
 "and help CLI passed.");
