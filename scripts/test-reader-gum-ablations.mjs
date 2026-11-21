import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {ABLATIONS,runConfigurations,evaluatePredictions}
 from "./evaluate-reader-gum-ablations.mjs";
import {CONFIGURATIONS}
 from "./evaluate-reader-nonlinear-fusion.mjs";

const keys=CONFIGURATIONS["linear+lexical"].keys;
assert.deepEqual(ABLATIONS.baseline,keys);
assert.equal(ABLATIONS["minus-bertPeriod"].includes("bertPeriod"),false);
assert.equal(ABLATIONS["minus-bertPeriod-bertHyphen"].includes("bertHyphen"),false);
assert.equal(ABLATIONS["minus-nli"].some(k=>k.startsWith("nli")),false);
assert.ok(ABLATIONS["gpt-semantic-lexical"].includes("gptQuality"));
assert.ok(ABLATIONS["gpt-semantic-lexical"].includes("semanticSimilarity"));
assert.equal(ABLATIONS["semantic-lexical-only"].some(k=>k.startsWith("gpt")),false);
for(const [name,features] of Object.entries(ABLATIONS)){
 assert.ok(features.length>=3,"Empty/sparse features for "+name);
 assert.equal(new Set(features).size,features.length,"Duplicate features in "+name);
 assert.ok(features.every(k=>keys.includes(k)),"Unknown feature in "+name);
}
const features=label=>{
 const x=Object.fromEntries(keys.map((k,i)=>[k,0.2*(i+1)]));
 x.gptQuality=label==="keep"?-7:-2.9;
 x.gptContrast=label==="but"?3:-2;
 x.bertContrast=label==="but"?2:-1;
 x.semanticSimilarity=label==="keep"?0.09:0.83;
 x.lexicalJaccard=label==="keep"?0:0.3;
 x.lexicalContainment=label==="keep"?0:0.6;
 x.lexicalSharedCount=label==="keep"?0:0.4;
 x.lexicalSemanticMismatch=label==="keep"?0.2:0;
 x.nliForwardEntailment=label==="and"?0.2:0;
 x.nliForwardContradiction=label==="but"?0.1:0;
 x.nliReverseEntailment=label==="and"?0.3:0;
 x.nliReverseContradiction=label==="but"?0.1:0;
 return x;
};
const train=Array.from({length:90},(_,i)=>({
 id:"train-"+i,gold:["keep","and","but"][i%3],explicit:null,
 features:features(["keep","and","but"][i%3])
}));
const real=Array.from({length:15},(_,i)=>({
 id:"real-"+i,gold:i%5===0?"but":"and",explicit:null,
 genre:"news",relation:"expansion.conjunction",
 features:features(i%5===0?"but":"and")
}));
const syn=Array.from({length:30},(_,i)=>({
 id:"syn-"+i,gold:["keep","and","but"][i%3],explicit:null,
 genre:"science",relation:"related_follow_on",
 features:features(["keep","and","but"][i%3])
}));
const out=runConfigurations(train,{gum:real,syntheticV2:syn});
assert.deepEqual(Object.keys(out),Object.keys(ABLATIONS));
for(const r of Object.values(out)){
 assert.equal(r.datasets.gum.count,15);
 assert.equal(r.datasets.syntheticV2.count,30);
 assert.equal(r.datasets.gum.goldSupport.keep,0);
 assert.equal(r.datasets.syntheticV2.goldSupport.keep,10);
 assert.ok(r.datasets.gum.accuracy>=0&&r.datasets.gum.accuracy<=1);
 assert.ok(r.datasets.syntheticV2.accuracy>=0&&r.datasets.syntheticV2.accuracy<=1);
}
const direct=evaluatePredictions(real,()=> "and");
assert.equal(direct.correct,12);
assert.equal(direct.predicted.keep,0);
assert.equal(direct.recall.but,0);
const other=evaluatePredictions(real.map(r=>({...r,gold:"keep"})),()=> "and");
assert.deepEqual(other.predictions.map(p=>p.predicted),
 direct.predictions.map(p=>p.predicted),
 "Holdout gold labels must never affect model predictions");
const trigger=spawnSync(process.execPath,[
 path.resolve(path.dirname(fileURLToPath(import.meta.url)),
 "evaluate-reader-gum-ablations.mjs"),"--help"
],{encoding:"utf8",timeout:90000});
assert.equal(trigger.status,0,trigger.stderr);
assert.match(trigger.stdout,/No model inference|only previously cached/);
console.log("GUM ablation: fixed unique feature groups, balanced synthetic training, "+
 "per-class and two-class mapped metrics, and held-out label isolation passed.");
