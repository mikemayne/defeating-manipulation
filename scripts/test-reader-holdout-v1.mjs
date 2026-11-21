import assert from "node:assert/strict";
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from "node:fs";
import path from "node:path";
import {tmpdir} from "node:os";
import {fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";
import {generateHoldout,HOLDOUT_VERSION}
 from "./build-reader-holdout-v1.mjs";
import {makeHoldoutRows,sourceFingerprint,heldoutFeatures,
 obtainHoldoutScores,scoreFrozenHoldout,HOLDOUT_SCORER_VERSION}
 from "./evaluate-reader-holdout-v1.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const dataset=generateHoldout();
const rows=makeHoldoutRows(dataset.cases);
assert.equal(dataset.meta.version,HOLDOUT_VERSION);
assert.equal(rows.length,300);
assert.equal(new Set(rows.map(x=>x.id)).size,300);
assert.equal(new Set(rows.map(x=>x.family)).size,150);
for(const label of ["keep","and","but"])
 assert.equal(rows.filter(x=>x.gold===label).length,100);
for(const challenge of new Set(rows.map(x=>x.challenge)))
 assert.equal(rows.filter(x=>x.challenge===challenge).length,50);
const original=JSON.stringify(dataset.cases);
const trainingData=JSON.parse(readFileSync(path.join(root,
 "evaluation/reader-strategy-synthetic-reference.json"),"utf8"));
const previous=new Set(trainingData.cases.map(x=>x.text.toLowerCase()));
assert.ok(rows.every(x=>!previous.has(x.text.toLowerCase())));
const fingerprint=sourceFingerprint(dataset.cases);
assert.match(fingerprint,/^[a-f0-9]{64}$/);

function scoresFor(label){
 const keep=label==="keep",and=label==="and",but=label==="but";
 return {
  gptAnd:and?-2.7:keep?-6.9:-5.8,
  gptBut:but?-2.5:keep?-6.9:-5.8,
  mask:{and:and?11:but?5:6,but:but?11:and?4:5,
   "-":keep?12:2,".":keep?12:3,so:and?9:2}
 };
}
const scored=rows.map(r=>({...r,scores:scoresFor(r.gold)}));
const e=heldoutFeatures(scored[0]);
assert.ok(Number.isFinite(e.features.bertContrast));
const training=trainingData.cases.flatMap(c=>
 c.expected_boundaries.map(b=>{
  const r={gold:b.choice,scores:scoresFor(b.choice)};
  return {id:c.id,gold:b.choice,explicit:null,features:heldoutFeatures(r).features};
 }));
assert.equal(training.length,102);
const result=scoreFrozenHoldout(training,scored);
assert.equal(Object.keys(result).length,3);
for(const group of Object.values(result)){
 assert.equal(group.combined.count,300);
 assert.equal(group.predictions.length,300);
 assert.ok(group.combined.accuracy>0.90,"Toy strong separation should classify well");
 for(const category of Object.values(group.byChallenge))
  assert.equal(category.count,50);
}
const predictionMap=result.fusion.predictions.map(p=>p.predicted);
const tampered= scored.map(r=>({...r,gold:r.gold==="keep"?"but":"keep"}));
const changed=scoreFrozenHoldout(training,tampered);
assert.deepEqual(changed.fusion.predictions.map(p=>p.predicted),predictionMap,
 "Holdout gold must have no effect on fitted weights or predictions");
assert.equal(original,JSON.stringify(dataset.cases),"Source corpus must be immutable");

const dir=mkdtempSync(path.join(tmpdir(),"reader-holdout-check-"));
try{
 const file=path.join(dir,"cached.json");
 const cacheEntries=rows.map(r=>({
  version:HOLDOUT_SCORER_VERSION,corpusFingerprint:fingerprint,
  modelMask:"Xenova/distilbert-base-uncased",maskTemplate:"masked-gap-v1",
  gptModel:"Xenova/distilgpt2",
  id:r.id,offset:r.offset,text:r.text,prompt:r.prompt,scores:scoresFor(r.gold)
 }));
 writeFileSync(file,JSON.stringify({
  corpusVersion:HOLDOUT_VERSION,fingerprint,predictions:cacheEntries
 }));
 const loaded=makeHoldoutRows(dataset.cases);
 const before={gpt:0,mask:0};
 const reuse=await obtainHoldoutScores(loaded,{
  fingerprint,cache:file,scores:file,log:()=>{},
  createGPT:async()=>{before.gpt++;throw Error("No inference allowed");},
  createMask:async()=>{before.mask++;throw Error("No inference allowed");}
 });
 assert.deepEqual(reuse,{newCount:0,reused:300});
 assert.deepEqual(before,{gpt:0,mask:0});
 assert.equal(loaded[100].scores.gptAnd,scoresFor(loaded[100].gold).gptAnd);
 const preview=spawnSync(process.execPath,[
  path.join(root,"scripts/evaluate-reader-holdout-v1.mjs"),"--preview"
 ],{encoding:"utf8",timeout:120000});
 assert.equal(preview.status,0,preview.stderr+"\n"+preview.stdout);
 assert.match(preview.stdout,/300 novel labelled boundaries/);
 assert.match(preview.stdout,/no scoring, no file writes/);
 console.log("Frozen holdout: 300 cases, balanced labels, offsets, no gold leakage, replay cache and preview passed.");
}finally{rmSync(dir,{force:true,recursive:true});}
