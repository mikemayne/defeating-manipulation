import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {trainFusion} from "./evaluate-reader-fusion.mjs";
import {evaluateTrainingOnlyCV,documentFolds,BUT_MULTIPLIERS,FEATURE_SETS}
 from "./evaluate-reader-gum-but-cv.mjs";
import {CONFIGURATIONS} from "./evaluate-reader-nonlinear-fusion.mjs";

const K=CONFIGURATIONS["linear+lexical"].keys;
assert.deepEqual(BUT_MULTIPLIERS,[1,1.4,2,3]);
assert.deepEqual(Object.keys(FEATURE_SETS),["full-fusion","no-period-hyphen"]);
function features(label,i){
 const f=Object.fromEntries(K.map((key,j)=>[key,(j+1)/100]));
 f.gptQuality=label==="keep"?-7:-3+(i%3)/20;
 f.gptContrast=label==="but"?1.8:-1.5;
 f.bertContrast=label==="but"?1.2:-1.2;
 f.bertPeriod=label==="keep"?4:1.2;
 f.bertHyphen=label==="keep"?0.9:-1.4;
 f.semanticSimilarity=label==="keep"?0.05:0.62+(i%3)/20;
 f.lexicalJaccard=label==="keep"?0:0.22;
 f.lexicalContainment=label==="keep"?0:0.4;
 return f;
}
const synthetic=Array.from({length:402},(_,i)=>{
 const gold=["keep","and","but"][i%3];
 return {id:"synthetic-"+i,offset:10,gold,explicit:null,
  features:features(gold,i)};
});
const real=Array.from({length:120},(_,i)=>{
 const doc="GUM_essay_example"+Math.floor(i/8),gold=i%6===0?"but":"and";
 return {id:"real-"+i,document:doc,offset:10,gold,
  family:doc,relation:"expansion.conjunction",explicit:null,
  features:features(gold,i)};
});
const folds=documentFolds(real,{folds:3});
assert.equal(folds.length,3);
assert.equal(folds.reduce((sum,f)=>sum+f.rows.length,0),120);
assert.equal(folds.reduce((sum,f)=>sum+f.but,0),20);
assert.ok(folds.every(x=>x.rows.length>0));
const membership=new Set();
for(const f of folds)for(const doc of f.documents){
 assert.ok(!membership.has(doc),"Each source document must appear in one fold");
 membership.add(doc);
}
assert.equal(membership.size,15);
assert.deepEqual(documentFolds([...real].reverse(),{folds:3})
 .map(f=>f.documents),folds.map(f=>f.documents));
assert.throws(()=>documentFolds(real,{folds:20}),/Invalid/);
assert.throws(()=>documentFolds(real.slice(0,8),{folds:3}),/Too few/);
assert.throws(()=>documentFolds([{...real[0],gold:"keep"},...real.slice(1)],
 {folds:3}),/AND\/BUT gold/);

const equal={keep:1,and:1,but:1};
const original=trainFusion(synthetic,K,{balanced:true});
const identical=trainFusion(synthetic,K,{balanced:true,classWeights:equal});
const probe=real.slice(0,12);
assert.deepEqual(probe.map(original),probe.map(identical),
 "All-ones class weights must reproduce the frozen model exactly");
assert.throws(()=>trainFusion(synthetic,K,{balanced:true,
 classWeights:{keep:1,and:1,but:Infinity}}),/Invalid/);
assert.throws(()=>trainFusion(synthetic,K,{balanced:true,
 classWeights:{keep:1,and:1,but:1,arbitrary:1}}),/Invalid/);
assert.throws(()=>trainFusion(synthetic,K,{balanced:true,
 classWeights:{keep:1,and:1,but:0}}),/Invalid/);

// Prove withheld row labels do not affect their own fold's predictions.
const heldout=new Set(folds[0].documents);
const visible=real.filter(r=>!heldout.has(r.document));
const fitted=trainFusion([...synthetic,...visible],K,{
 balanced:true,classWeights:{keep:1,and:1,but:2}});
const prediction=folds[0].rows.map(fitted);
const relabelled=folds[0].rows.map(r=>({...r,gold:
 r.gold==="and"?"but":"and"}));
assert.deepEqual(relabelled.map(fitted),prediction);

const outcome=evaluateTrainingOnlyCV(synthetic,real,{
 folds:3,featureSets:{"full-fusion":K},multipliers:[1,2]
});
assert.equal(Object.keys(outcome.experiments).length,2);
for(const x of Object.values(outcome.experiments)){
 assert.equal(x.pooled.count,120);
 assert.equal(x.pooled.goldSupport.keep,0);
 assert.equal(x.folds.length,3);
 assert.equal(x.predictions.length,120);
 assert.ok(x.pooled.balancedRecall>=0&&x.pooled.balancedRecall<=1);
 for(const group of x.folds){
  assert.equal(group.testCount,
   group.support.and+group.support.but);
  assert.ok(group.trainingRealRows<real.length);
 }
}
assert.ok(outcome.bestOnTrainingCV.id.startsWith("full-fusion"));
const cli=spawnSync(process.execPath,[
 path.resolve(path.dirname(fileURLToPath(import.meta.url)),
  "evaluate-reader-gum-but-cv.mjs"),"--help"
],{encoding:"utf8",timeout:60000});
assert.equal(cli.status,0,cli.stderr);
assert.match(cli.stdout,/No neural inference/);
console.log("GUM BUT training CV: frozen all-ones baseline, validated loss weights, "+
 "document-disjoint grouped folds, held-out gold isolation, paired "+
 "three-class fusion, and 2-candidate offline development tuning passed.");
