import assert from "node:assert/strict";
import { extractBoundaryProbes } from "../extension/src/reader-boundary-scorer.mjs";
import {
 compareReaderStrategies,summarizeStrategyComparison,validateStrategyCases
} from "../extension/src/reader-strategy-comparison.mjs";

// Synthetic fixtures; not the private 1000-example real-world corpus.
const source="He promised lower taxes. He raised them. His supporters protested.";
const pairs=extractBoundaryProbes(source,{maxPairs:8});
assert.equal(pairs.length,2);
assert.equal(pairs[0].punctuationStart,23);
assert.equal(source.slice(pairs[0].punctuationStart,pairs[0].punctuationEnd),".");
for(const pair of pairs){
 assert.equal(source.slice(pair.first.start,pair.first.end),pair.first.text);
 assert.equal(source.slice(pair.second.start,pair.second.end),pair.second.text);
}
const initial=source;
let calls=[];
const lm=async (prefix,completion)=>{
 calls.push([prefix,completion]);
 if(completion.startsWith(" but "))return -1;
 if(completion.startsWith(" and "))return -2;
 if(completion.startsWith(". "))return -3;
 return -4;
};
const out=await compareReaderStrategies(source,lm,{maxPairs:8});
assert.equal(source,initial);
assert.equal(out.length,2);
assert.equal(out[0].context.choice,"but");
assert.equal(out[0].progressive.choice,"but");
assert.equal(out[1].context.choice,"but");
assert.equal(out[1].progressive.choice,"but");
assert.equal(out[0].contextChangedByEarlierJoins,false);
assert.equal(out[1].contextChangedByEarlierJoins,true);
assert.ok(out[1].progressive.candidates.some(c=>c.analysisText.includes(
 "but he raised them")), "Second join should carry previous inferred but");
assert.equal(out[1].punctuationStart,39);
assert.equal(calls.length,12,
 "Identical first-boundary candidates cached: 4+4+4, not 16");
const summary=summarizeStrategyComparison([{
 id:"a",text:source,boundaries:out,
 expected_boundaries:[
  {offset:pairs[0].punctuationStart,choice:"but"},
  {offset:pairs[1].punctuationStart,choice:"and"}
 ],
 modelCalls:calls.length
}]);
assert.equal(summary.pairs,2);
assert.equal(summary.labelled,2);
assert.equal(summary.correctContext,1);
assert.equal(summary.correctProgressive,1);
assert.equal(summary.changedContext,1);
assert.equal(summary.modelCalls,12);
const tie=await compareReaderStrategies(source,async()=>-2);
assert.equal(tie.length,2);
assert.ok(tie.every(x=>x.context.uncertain && x.progressive.uncertain));
assert.ok(tie.every(x=>x.context.choice==="keep"&&x.progressive.choice==="keep"));
assert.ok(tie.every(x=>!x.contextChangedByEarlierJoins));
assert.equal(validateStrategyCases([{
 id:"a",text:source,expected_boundaries:[{offset:pairs[0].punctuationStart,choice:"but"}]
}]).length,1);
assert.throws(()=>validateStrategyCases([{
 id:"b",text:source,expected_boundaries:[{offset:999,choice:"but"}]
}]),/Invalid/);
assert.throws(()=>validateStrategyCases([{
 id:"b",text:source,expected_boundaries:[{offset:pairs[0].punctuationStart,choice:"because"}]
}]),/Invalid/);
assert.throws(()=>validateStrategyCases([{id:"a",text:"X"},{id:"a",text:"Y"}]),/duplicate|unique/);
const repeated="Alpha was late. Beta had already arrived. Gamma waited. Delta made a call. Epsilon left. Zeta came back.";
const long=await compareReaderStrategies(repeated,async (_a,b)=>b.startsWith(" and ")?-1:-3);
assert.equal(long.length,5,"All five boundaries should be scored, not just two");
assert.ok(long.at(-1).contextChangedByEarlierJoins);
assert.ok(long.every(x=>x.punctuationStart>=0 && x.punctuationEnd>x.punctuationStart));
console.log("Strategy comparison: context/progressive, growing joins, caching, ties, gold metrics and multiple boundaries passed.");
