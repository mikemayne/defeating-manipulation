import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {trainFusion} from "./evaluate-reader-fusion.mjs";
import {documentFolds} from "./evaluate-reader-gum-but-cv.mjs";
import {evaluateConservativeCV,EXPECTED_ORIGINAL_BASELINES}
 from "./evaluate-reader-conservative-but.mjs";
import {conservativeButDecision,scoreButOutcomes,separationMetrics,POLICIES}
 from "./reader-conservative-but-decision.mjs";

assert.equal(POLICIES.length,6);
assert.deepEqual(Object.values(EXPECTED_ORIGINAL_BASELINES),
 [187,213,228,237,175,202,221,232]);
const decide=(keep,and,but,options)=>conservativeButDecision(
 {keep,and,but},options);
assert.deepEqual(decide(.7,.2,.1),{
 choice:"keep",advisory:null,butScore:.1,butMargin:-.6
});
assert.equal(decide(.15,.65,.2).choice,"and");
assert.equal(decide(.08,.2,.72).choice,"but");
assert.equal(decide(.10,.44,.46).choice,"and");
assert.equal(decide(.10,.44,.46).advisory,"deserves_scrutiny");
assert.equal(decide(.05,.42,.53).choice,"and");
assert.equal(decide(.1,.45,.45).choice,"and");
assert.equal(decide(.45,.10,.45).choice,"keep");
assert.equal(decide(.1,.35,.55,{minButScore:.50,minButMargin:.1}).choice,
 "but");
assert.equal(decide(.1,.35,.55,{minButScore:.8,minButMargin:.1}).choice,
 "and");
assert.throws(()=>conservativeButDecision({keep:0,and:0,but:2}),/normalized/);
assert.throws(()=>conservativeButDecision({keep:0,and:.3,but:.7},{
 minButScore:-.1}),/threshold/);
assert.throws(()=>conservativeButDecision({keep:0,and:.3,but:NaN}),/normalized/);
const observed=scoreButOutcomes([
 {gold:"and",predicted:"and",advisory:null},
 {gold:"and",predicted:"but",advisory:null},
 {gold:"but",predicted:"but",advisory:null},
 {gold:"but",predicted:"and",advisory:"deserves_scrutiny"}
]);
assert.equal(observed.butPrecision,.5);
assert.equal(observed.butRecall,.5);
assert.equal(observed.andRecall,.5);
assert.equal(observed.falseBut,1);
assert.equal(observed.advisoryCount,1);
assert.equal(observed.balancedRecall,.5);
const noBut=scoreButOutcomes([
 {gold:"and",predicted:"and",advisory:null},
 {gold:"but",predicted:"and",advisory:"deserves_scrutiny"}
]);
assert.equal(noBut.butPrecision,null);
assert.equal(noBut.butRecall,0);
assert.equal(noBut.predictedBut,0);

const ordered=[
 {id:"a",gold:"and",butScore:0.1},
 {id:"b",gold:"and",butScore:0.3},
 {id:"c",gold:"but",butScore:0.7},
 {id:"d",gold:"but",butScore:0.8}
];
assert.equal(separationMetrics(ordered).rocAuc,1);
assert.equal(separationMetrics(ordered).averagePrecision,1);
const inverse=ordered.map(r=>({...r,butScore:1-r.butScore}));
assert.equal(separationMetrics(inverse).rocAuc,0);
const tied=separationMetrics(ordered.map(r=>({...r,butScore:0.5})));
assert.equal(tied.rocAuc,.5);
assert.equal(tied.averagePrecision,.5);

function feature(gold,i){
 return {
  gptQuality:gold==="keep"?-6:-3+(i%3)*.1,
  gptContrast:gold==="but"?1.5:-1.1,
  bertContrast:gold==="but"?1.1:-1,
  semanticSimilarity:gold==="keep"?.05:.7,
  lexicalJaccard:gold==="keep"?0:.2
 };
}
const keys=["gptQuality","gptContrast","bertContrast"];
const synthetic=Array.from({length:402},(_,i)=>{
 const gold=["keep","and","but"][i%3];
 return {id:"synthetic-"+i,gold,explicit:null,features:feature(gold,i)};
});
const original=Array.from({length:120},(_,i)=>{
 const gold=i%6===0?"but":"and";
 const doc="GUM_essay_doc"+Math.floor(i/8);
 return {id:"original-"+i,gold,document:doc,
  relation:gold==="but"?"comparison.contrast":"expansion.conjunction",
  source:"Original text "+i+". Follow-up "+i+".",
  explicit:null,features:feature(gold,i)};
});
const but=Array.from({length:30},(_,i)=>({
 id:"but-"+i,gold:"but",document:i%7===0?
  "GUM_essay_doc"+Math.floor(i%15):"GUM_news_contrast"+Math.floor(i/3),
 relation:i%2?"comparison.contrast":"comparison.concession.arg2-as-denier",
 source:"First thought "+i+". Unexpected outcome "+i+".",
 explicit:null,features:feature("but",i)
}));
const and=Array.from({length:440},(_,i)=>({
 id:"and-"+i,gold:"and",document:"GUM_news_new"+(i%60),
 relation:"expansion.conjunction",
 source:"A statement "+i+". An additional fact "+i+".",
 explicit:null,features:feature("and",i)
}));
const model=trainFusion(synthetic,keys,{balanced:true});
assert.equal(typeof model.probabilities,"function");
const p=model.probabilities(original[0]);
assert.ok(Math.abs(p.keep+p.and+p.but-1)<1e-12);
assert.ok(["keep","and","but"].includes(model(original[0])));
const before=original.map(model);
const changedGold=original.map(r=>({...r,gold:r.gold==="but"?"and":"but"}));
assert.deepEqual(changedGold.map(model),before,
 "Gold must have no effect on model score/prediction");

const measured=evaluateConservativeCV(synthetic,original,but,and,{
 folds:3,featureSets:{"mini-fusion":keys}
});
assert.equal(measured.validationCount,120);
assert.equal(Object.keys(measured.outcomes).length,4);
const folds=documentFolds(original,{folds:3});
assert.deepEqual(measured.folds.map(x=>x.sourceDocuments),
 folds.map(f=>f.documents));
for(const out of Object.values(measured.outcomes)){
 assert.equal(Object.keys(out.policies).length,POLICIES.length);
 assert.equal(out.separation.positives,20);
 assert.equal(out.separation.negatives,100);
 assert.ok(out.separation.rocAuc>=0&&out.separation.rocAuc<=1);
 assert.equal(out.policies.argmax.metrics.count,120);
 const base=out.policies.argmax.metrics;
 for(const e of Object.values(out.policies)){
  assert.ok(e.metrics.predictedBut<=base.predictedBut);
  assert.equal(e.metrics.predictedKeep,base.predictedKeep);
  assert.equal(e.metrics.goldSupport.and,100);
  assert.equal(e.metrics.goldSupport.but,20);
  assert.equal(e.metrics.falseBut+e.metrics.trueBut,e.metrics.predictedBut);
 }
 assert.equal(out.folds.length,3);
 assert.ok(out.folds.every(f=>f.trainingOriginal<120));
}
const noExtra=measured.outcomes["mini-fusion__AND+0"];
assert.equal(noExtra.policies.argmax.metrics.count,120);
const onlyConservative=measured.outcomes["mini-fusion__AND+220"];
assert.ok(onlyConservative.policies.strict.metrics.predictedBut<=
 onlyConservative.policies.argmax.metrics.predictedBut);
const cli=spawnSync(process.execPath,[
 path.resolve(path.dirname(fileURLToPath(import.meta.url)),
  "evaluate-reader-conservative-but.mjs"),"--help"
],{encoding:"utf8",timeout:60000});
assert.equal(cli.status,0,cli.stderr);
assert.match(cli.stdout,/no new neural inference/);
console.log("Conservative BUT: softmax access preserves historical argmax; "+
 "KEEP and AND fallbacks, high-score/margin BUT thresholds, advisory-only "+
 "scrutiny, BUT precision/recall, rank-AUROC/AP, fixed grouped CV, "+
 "and class/source guardrails passed.");
