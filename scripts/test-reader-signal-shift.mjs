import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {signalShift,THRESHOLDS,VERSION}
 from "./audit-reader-signal-shift.mjs";

const example=(gold,bertContrast,lexicalJaccard,source="uncommitted-source")=>({
 id:"private-row-id",source,gold,features:{bertContrast,lexicalJaccard}
});
const synthetic=[
 example("and",3.1,0.0),example("but",4.7,0),
 example("but",2.4,.04),example("keep",5,.20)
];
const authentic=[
 example("and",4.1,0),example("and",.2,.2),
 example("but",1.9,0),example("but",4.2,.02)
];
const report=signalShift({synthetic,authentic});
assert.equal(report.version,VERSION);
assert.equal(report.cohorts.synthetic.count,4);
assert.deepEqual(report.cohorts.synthetic.labels,{keep:1,and:1,but:2});
assert.equal(THRESHOLDS.length,9);
const index=(cohort,bert,lexical)=>report.cohorts[cohort].grid.find(x=>
 x.bertMinimum===bert&&x.lexicalMaximum===lexical
);
assert.deepEqual(index("synthetic",3,0).matched,{keep:0,and:1,but:1});
assert.deepEqual(index("authentic",3,0).matched,{keep:0,and:1,but:0});
assert.deepEqual(index("authentic",4,.05).matched,{keep:0,and:1,but:1});
assert.deepEqual(index("synthetic",2,.10).matched,{keep:0,and:1,but:2});
// Only numeric aggregates are ever returned.
const encoded=JSON.stringify(report);
assert.doesNotMatch(encoded,/uncommitted-source|private-row-id|source:|sentence|first sentence/i);
assert.throws(()=>signalShift({}),/Datasets/);
assert.throws(()=>signalShift({synthetic:[]}),/Empty/);
assert.throws(()=>signalShift({synthetic:[example("unknown",3,0)]}),/Invalid/);
assert.throws(()=>signalShift({synthetic:[example("and",NaN,0)]}),/Invalid/);
assert.throws(()=>signalShift({synthetic:[example("and",3,-.1)]}),/Invalid/);
assert.throws(()=>signalShift({synthetic},[{bertMinimum:3,lexicalMaximum:2}]),
 /Invalid/);
const run=spawnSync(process.execPath,[
 path.resolve(path.dirname(fileURLToPath(import.meta.url)),
  "audit-reader-signal-shift.mjs"),"--help"
],{encoding:"utf8",timeout:60000});
assert.equal(run.status,0,run.stderr);
assert.match(run.stdout,/numeric aggregates|aggregate results/i);
console.log("Reader signal-shift: all nine fixed numeric probes, "+
 "source-free aggregates, malformed input rejection and CLI passed.");
