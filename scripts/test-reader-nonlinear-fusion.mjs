import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";
import {contentWords,lexicalOverlapFeatures,LEXICAL_FEATURE_NAMES}
 from "../extension/src/reader-lexical-features.mjs";
import {trainBoostedFusion,BOOSTED_DEFAULTS,softmax3}
 from "../extension/src/reader-boosted-fusion.mjs";
import {generateHoldout}
 from "./build-reader-holdout-v1.mjs";
import {makeHoldoutRows}
 from "./evaluate-reader-holdout-v1.mjs";
import {extractBoundaryProbes}
 from "../extension/src/reader-boundary-scorer.mjs";
import {sentencePair}
 from "../extension/src/reader-semantic-signals.mjs";
import {CONFIGURATIONS,attachLexicalFeatures,fitReaderModel,transferFour,
 developmentFour,compareFour}
 from "./evaluate-reader-nonlinear-fusion.mjs";
import {groupedFamilyFolds}
 from "./evaluate-reader-semantic-fusion.mjs";

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const seen=contentWords("The guitarist replaced the bass strings");
assert.ok(seen.has("bass"));
assert.ok(!seen.has("the"));
const different=lexicalOverlapFeatures(
 "The guitarist replaced the bass strings",
 "Researchers counted bass in a freshwater lake",0.10
);
assert.ok(different.lexicalJaccard>0);
assert.ok(different.lexicalSemanticMismatch>0);
const same=lexicalOverlapFeatures("Fresh boats entered harbour",
 "Fresh boats entered harbour",0.92);
assert.equal(same.lexicalJaccard,1);
assert.equal(same.lexicalContainment,1);
assert.equal(same.lexicalSemanticMismatch,0);
assert.deepEqual(Object.keys(same),LEXICAL_FEATURE_NAMES);
assert.deepEqual(Object.keys(lexicalOverlapFeatures("I am here","You are there",0.2)),
 LEXICAL_FEATURE_NAMES);
assert.throws(()=>lexicalOverlapFeatures("one","two",Number.NaN),/similarity/);
assert.throws(()=>contentWords(null),/Sentence/);
assert.deepEqual(softmax3([0,0,0]),[1/3,1/3,1/3]);

// Genuine XOR-shaped interaction: a linear classifier cannot represent
// "both absent => KEEP; exactly one present => AND; both present => BUT".
const xor=[];
for(let a=0;a<=1;a++)for(let b=0;b<=1;b++)
 for(let i=0;i<24;i++)xor.push({
  id:a+":"+b+":"+i,gold:a===0&&b===0?"keep":a===1&&b===1?"but":"and",
  features:{a,b}
 });
const opts={...BOOSTED_DEFAULTS,rounds:55,minLeaf:9,l2:3,learningRate:0.12};
const clf=trainBoostedFusion(xor,["a","b"],opts);
const correct=xor.filter(x=>clf(x)===x.gold).length;
assert.ok(correct>90,"Depth-two trees should learn pairwise XOR interactions");
const again=trainBoostedFusion(xor,["a","b"],opts);
assert.deepEqual(xor.map(clf),xor.map(again),"Tree training must be deterministic");
assert.throws(()=>trainBoostedFusion(xor,["missing"],opts),/feature/);
assert.throws(()=>trainBoostedFusion(xor,["a","a"],opts),/invalid features/);
assert.throws(()=>trainBoostedFusion(xor.slice(0,20),["a","b"],opts),/Not enough/);

// Four experimental methods keep the same fixed base feature set.
const core=CONFIGURATIONS.linear.keys;
assert.equal(core.length,11);
assert.equal(CONFIGURATIONS.boosted.keys.length,11);
assert.equal(CONFIGURATIONS["linear+lexical"].keys.length,15);
assert.equal(CONFIGURATIONS["boosted+lexical"].keys.length,15);

const oldCases=JSON.parse(readFileSync(path.join(repo,
 "evaluation/reader-strategy-synthetic-reference.json"),"utf8")).cases;
const newCases=generateHoldout().cases;
assert.equal(newCases.length,300);
const holdout=makeHoldoutRows(newCases);
const subset=holdout.filter((_,i)=>i%50<10);
assert.equal(subset.length,60);
assert.equal(new Set(subset.map(x=>x.family)).size,30);
function fakeFeatures(label){
 const k=label==="keep",a=label==="and",b=label==="but";
 return {
  gptQuality:k?-6.5:-3.8,
  gptContrast:b?0.6:a?-0.7:0,
  bertContrast:b?1.5:a?-1.1:0,
  bertHyphen:k?2:-1,
  bertPeriod:k?1.1:-1.3,
  bertSo:a?0.7:-0.2,
  semanticSimilarity:k?0.14:a?0.75:0.52,
  nliForwardContradiction:b?0.7:0.1,
  nliForwardEntailment:a?0.7:0.1,
  nliReverseContradiction:b?0.6:0.1,
  nliReverseEntailment:a?0.55:0.1
 };
}
function prepare(row){
 const source=row.source||row.text;
 const pair=row.left&&row.right?{left:row.left,right:row.right}:
  sentencePair(source,row.probe);
 return {...row,source,left:pair.left,right:pair.right,
  explicit:null,features:fakeFeatures(row.gold)};
}
const old=oldCases.flatMap(c=>c.expected_boundaries.map(b=>{
 const probe=extractBoundaryProbes(c.text,{maxPairs:8})
  .find(p=>p.punctuationStart===b.offset);
 if(!probe)throw Error("Old scenario boundary missing");
 return prepare({id:c.id,offset:b.offset,gold:b.choice,
  family:c.id,challenge:"original-102",source:c.text,probe});
}));
const newRows=subset.map(prepare);
const train=attachLexicalFeatures(old),test=attachLexicalFeatures(newRows);
assert.equal(train.length,102);
assert.equal(test.length,60);
assert.equal(train[0].features.lexicalJaccard>=0,true);
for(const cfg of Object.values(CONFIGURATIONS)){
 const model=fitReaderModel(train,cfg);
 assert.ok(["keep","and","but"].includes(model(test[0])));
}
const transfer=transferFour(train,test,{maxErrors:5});
for(const r of Object.values(transfer)){
 assert.equal(r.combined.count,60);
 assert.equal(r.predictions.length,60);
}
const bins=groupedFamilyFolds(test);
assert.deepEqual(bins.map(x=>x.length),[12,12,12,12,12]);
const cv=developmentFour(train,test,{maxErrors:3});
for(const r of Object.values(cv)){
 assert.equal(r.combined.count,60);
 assert.equal(r.predictions.length,60);
 assert.deepEqual(r.folds.map(f=>f.testBoundaries),[12,12,12,12,12]);
}
assert.equal(compareFour(cv).linear.net,0);
const firstFoldIDs=new Set(bins[0].map(r=>r.id));
const changed=test.map(r=>firstFoldIDs.has(r.id)?
 {...r,gold:r.gold==="keep"?"but":"keep"}:r);
const rerun=developmentFour(train,changed,{maxErrors:0});
for(const name of Object.keys(cv)){
 const before=cv[name].predictions.filter(p=>firstFoldIDs.has(p.id)).map(p=>p.predicted);
 const after=rerun[name].predictions.filter(p=>firstFoldIDs.has(p.id)).map(p=>p.predicted);
 assert.deepEqual(after,before,"Held-out labels must not affect that fold's fitted model");
}
const preview=spawnSync(process.execPath,[
 path.join(repo,"scripts/evaluate-reader-nonlinear-fusion.mjs"),"--preview"
],{encoding:"utf8",timeout:90000});
assert.equal(preview.status,0,preview.stderr+"\n"+preview.stdout);
assert.match(preview.stdout,/zero neural inference, no cache reads or writes/);
console.log("Nonlinear reader fusion: lexical overlap, XOR, deterministic boosting, "+
 "four configurations, 30 grouped families, CV label isolation and preview passed.");
