import assert from "node:assert/strict";
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";
import {generateHoldout} from "./build-reader-holdout-v1.mjs";
import {makeHoldoutRows,sourceFingerprint}
 from "./evaluate-reader-holdout-v1.mjs";
import {sentencePair,cosineSimilarity,validateSemanticSignals,semanticFeatures}
 from "../extension/src/reader-semantic-signals.mjs";
import {originalProbeRows,attachPriorHoldoutScores,signalCacheFingerprint,
 obtainSemanticSignals,addSemanticFeatures,transferComparison,
 groupedFamilyFolds,developmentCV,EXPERIMENTS}
 from "./evaluate-reader-semantic-fusion.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const dataset=generateHoldout();
const raw=makeHoldoutRows(dataset.cases);
const old=JSON.parse(readFileSync(path.join(root,
 "evaluation/reader-strategy-synthetic-reference.json"),"utf8")).cases;
assert.equal(raw.length,300);
assert.equal(cosineSimilarity([1,0],[0,1]),0);
assert.equal(cosineSimilarity([1,0],[-1,0]),-1);
assert.equal(cosineSimilarity([1,2],[1,2]),1);
assert.throws(()=>cosineSimilarity([0,0],[1,0]),/zero/);
assert.throws(()=>cosineSimilarity([1],[1,0]),/dimensions/);
const nli={contradiction:0.1,neutral:0.7,entailment:0.2};
const semantic={similarity:0.3,forward:nli,reverse:{...nli}};
assert.equal(semanticFeatures(semantic).nliForwardEntailment,0.2);
assert.throws(()=>validateSemanticSignals({...semantic,similarity:NaN}),/similarity/);
assert.throws(()=>validateSemanticSignals({...semantic,forward:{
 contradiction:0.9,neutral:0.7,entailment:0.2}}),/sum/);
assert.equal(sentencePair(raw[0].text,raw[0].probe).left,
 "The train was scheduled to arrive before noon");

function baselineFeatures(label){
 return {
  gptQuality:label==="and"?-3.0:label==="but"?-3.1:-5.7,
  gptContrast:label==="but"?0.8:label==="and"?-0.7:0,
  bertContrast:label==="but"?1.5:label==="and"?-2.4:0,
  bertHyphen:label==="keep"?1.1:-3.5,
  bertPeriod:label==="keep"?2.3:-0.5,
  bertSo:label==="and"?1.3:-1.8
 };
}
function signalFor(text){
 const n=text.length%10;
 return {similarity:n/12,forward:{contradiction:0.1+n/100,
  neutral:0.7-n/100,entailment:0.2},
  reverse:{contradiction:0.18,neutral:0.72,entailment:0.1}};
}
const original=old.flatMap(c=>c.expected_boundaries.map(b=>({
 id:c.id,offset:b.offset,gold:b.choice,source:c.text,explicit:null,
 features:baselineFeatures(b.choice)
})));
const first=originalProbeRows(old,original);
assert.equal(first.length,102);
const fingerprint=sourceFingerprint(dataset.cases);
const cachedHoldout={
 corpusVersion:"reader-holdout-v1",fingerprint,
 predictions:raw.map(r=>({id:r.id,offset:r.offset,text:r.text,
  version:"holdout-score-v1",corpusFingerprint:fingerprint,
  scores:{
   gptAnd:r.gold==="and"?-3.1:-6.5,
   gptBut:r.gold==="but"?-3.0:-6.5,
   mask:{and:r.gold==="and"?10:2,but:r.gold==="but"?10:2,
    "-":r.gold==="keep"?12:3,".":r.gold==="keep"?12:2,so:4}
  }
 }))
};
const holdout=attachPriorHoldoutScores(raw,cachedHoldout,dataset.cases);
assert.equal(holdout.length,300);
assert.throws(()=>attachPriorHoldoutScores(raw,{...cachedHoldout,
 fingerprint:"wrong"},dataset.cases),/do not match/);
for(const r of [...first,...holdout]){
 const {left,right}=sentencePair(r.source,r.probe);
 r.left=left;r.right=right;r.semantic=signalFor(r.source);
}
const all=[...first,...holdout];
const signature=signalCacheFingerprint(all);
assert.match(signature,/^[a-f0-9]{64}$/);
assert.notEqual(signature,signalCacheFingerprint([...first,...holdout.slice(1)]));
const bins=groupedFamilyFolds(holdout);
assert.deepEqual(bins.map(x=>x.length),[60,60,60,60,60]);
for(const group of bins){
 assert.equal(new Set(group.map(x=>x.family)).size,30);
 for(const challenge of new Set(group.map(x=>x.challenge)))
  assert.equal(group.filter(x=>x.challenge===challenge).length,10);
}
const train=addSemanticFeatures(first),test=addSemanticFeatures(holdout);
assert.equal(train.length,102);
assert.equal(test.length,300);
const transfer=transferComparison(train,test);
assert.deepEqual(Object.keys(transfer),Object.keys(EXPERIMENTS));
for(const group of Object.values(transfer)){
 assert.equal(group.combined.count,300);
 assert.equal(group.predictions.length,300);
}
const cv=developmentCV(train,test);
assert.equal(Object.keys(cv).length,7);
for(const group of Object.values(cv)){
 assert.equal(group.combined.count,300);
 assert.equal(group.predictions.length,300);
 assert.deepEqual(group.folds.map(f=>f.testCases),[60,60,60,60,60]);
}
const changedTest=test.map(r=>bins[0].some(t=>t.id===r.id)?
 {...r,gold:r.gold==="keep"?"but":"keep"}:r);
const modified=developmentCV(train,changedTest);
for(const name of Object.keys(cv)){
 const originalPredictions=cv[name].predictions.filter(p=>bins[0].some(t=>t.id===p.id))
  .map(p=>p.predicted);
 const tamperedPredictions=modified[name].predictions.filter(p=>bins[0].some(t=>t.id===p.id))
  .map(p=>p.predicted);
 assert.deepEqual(tamperedPredictions,originalPredictions,
  "Test-set gold must not affect its own fold's model");
}

const folder=mkdtempSync(path.join(tmpdir(),"reader-semantic-"));
try{
 const file=path.join(folder,"semantic.json");
 const sample=all.slice(0,4),smallFingerprint=signalCacheFingerprint(sample);
 let created=0,scored=0;
 const firstRun=await obtainSemanticSignals(sample,{
  file,fingerprint:smallFingerprint,log:()=>{},
  createScorer:async()=>{created++;return async(left,right)=>{
   scored++;return signalFor(left+" "+right);};
  }
 });
 assert.equal(created,1);
 assert.equal(scored,4);
 assert.deepEqual(firstRun,{newCount:4,reused:0});
 const saved=JSON.parse(readFileSync(file,"utf8"));
 assert.equal(saved.predictions.length,4);
 const replay=await obtainSemanticSignals(sample,{
  file,fingerprint:smallFingerprint,readOnly:true,log:()=>{},
  createScorer:async()=>{throw Error("No inference in replay")}
 });
 assert.deepEqual(replay,{newCount:0,reused:4});
 assert.throws(()=>validateSemanticSignals(saved.predictions[0].signals===null?
  null:{...saved.predictions[0].signals,similarity:3}),/similarity/);
 const broken={...saved,corpusFingerprint:"bad"};
 writeFileSync(file,JSON.stringify(broken));
 await assert.rejects(()=>obtainSemanticSignals(sample,{file,
  fingerprint:smallFingerprint,readOnly:true,log:()=>{}}),/metadata mismatch/);
 const preview=spawnSync(process.execPath,[
  path.join(root,"scripts/evaluate-reader-semantic-fusion.mjs"),"--preview"
 ],{encoding:"utf8",timeout:90000});
 assert.equal(preview.status,0,preview.stderr+"\n"+preview.stdout);
 assert.match(preview.stdout,/Preview only: no models or cache required/);
 console.log("Semantic fusion: cosine, NLI shape, 402 boundaries, "+
 "150 family-grouped pairs, zero label leakage, cached replay and preview passed.");
}finally{rmSync(folder,{recursive:true,force:true});}
