import assert from "node:assert/strict";
import {
 selectJoin,validateJoinThresholds,fitJoinThresholds,
 labelledJoinScores,DEFAULT_JOIN_THRESHOLDS
} from "../extension/src/reader-join-thresholds.mjs";

assert.deepEqual(validateJoinThresholds(DEFAULT_JOIN_THRESHOLDS),{
 minScore:-3.5,minMargin:0.2
});
assert.equal(selectJoin([{id:"and",score:-2},{id:"but",score:-2.5}]).choice,"and");
assert.equal(selectJoin([{id:"and",score:-5},{id:"but",score:-5.5}]).choice,"keep");
assert.equal(selectJoin([{id:"and",score:-2},{id:"but",score:-2.1}]).choice,"keep");
assert.equal(selectJoin([{id:"and",score:null},{id:"but",score:-2}]).choice,"keep");
assert.equal(selectJoin([{id:"and",score:-2},{id:"but",score:-1.2}]).choice,"but");
assert.throws(()=>validateJoinThresholds({minScore:1,minMargin:-1}),/threshold/i);
assert.throws(()=>validateJoinThresholds({minScore:"NO",minMargin:0}),/threshold/i);

// 60 independent fictional paragraphs, each with a manually chosen reference
// join. Each paragraph contributes ONE sample to avoid train/holdout leakage.
const cases=Array.from({length:60},(_,i)=>{
 const gold=["and","but","keep"][i%3];
 const scores=gold==="and"?[-2.1,-3.9]:gold==="but"?[-3.9,-2.1]:[-4.7,-4.6];
 return {
  id:"fixture-"+i,
  expected_boundaries:[{offset:42,choice:gold}],
  boundaries:[{
   punctuationStart:42,
   candidates:[{id:"and",score:scores[0]},{id:"but",score:scores[1]}]
  }]
 };
});
assert.equal(labelledJoinScores(cases).length,60);
const fit=fitJoinThresholds(cases);
assert.equal(fit.available,true);
assert.equal(fit.labels,60);
assert.equal(fit.train.cases,48);
assert.equal(fit.holdout.cases,12);
assert.equal(fit.holdout.accuracy,1);
assert.equal(fit.holdout.balancedAccuracy,1);
assert.ok(fit.fitted.minScore>=-4.6||fit.fitted.minMargin>=0.2,
 "The fit must distinguish weak KEEP cases by either score or margin");
assert.equal(fit.trainCases,48);
assert.equal(fit.holdoutCases,12);
assert.equal(fitJoinThresholds([]).available,false);
assert.equal(fitJoinThresholds(cases.slice(0,10)).available,false);
const a=labelledJoinScores([{id:"comp",expected_boundaries:[{offset:12,choice:"but"}],
 boundaries:[{punctuationStart:12,context:{candidates:[
  {id:"and",score:-4},{id:"but",score:-2}
 ]},progressive:{candidates:[
  {id:"and",score:-1},{id:"but",score:-2}
 ]}}]}]);
assert.equal(a[0].candidates[1].score,-2);
console.log("Two-score threshold fitting: keep fallback, training/holdout split, and reference metrics passed.");
