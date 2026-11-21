import assert from "node:assert/strict";
import {readFile,mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";
import {readScenarioSeeds,buildCorpus,VERSION} from "./build-reader-holdout-v2.mjs";
import {makeV2Rows,corpusHash,scoreLanguageModels,frozenScores,CACHE_VERSION}
 from "./evaluate-reader-holdout-v2.mjs";
import {CONFIGURATIONS} from "./evaluate-reader-nonlinear-fusion.mjs";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const seeds=await readScenarioSeeds();
const data=buildCorpus(seeds);
const rows=makeV2Rows(data.cases);
assert.equal(data.meta.version,VERSION);
assert.equal(rows.length,1000);
assert.equal(new Set(rows.map(r=>r.id)).size,1000);
assert.equal(new Set(rows.map(r=>r.family)).size,100);
assert.equal(new Set(rows.map(r=>r.source)).size,1000);
assert.deepEqual(Object.fromEntries(["keep","and","but"].map(label=>
 [label,rows.filter(r=>r.gold===label).length])),{keep:333,and:334,but:333});
for(const domain of new Set(rows.map(r=>r.domain)))
 assert.equal(rows.filter(r=>r.domain===domain).length,100);
for(const family of new Set(rows.map(r=>r.family))){
 const members=rows.filter(r=>r.family===family);
 assert.equal(members.length,10);
 assert.equal(new Set(members.map(r=>r.challenge)).size,10);
}
for(const row of rows){
 assert.equal(row.source[row.offset],".");
 assert.ok(row.left.length>10&&row.right.length>10);
 assert.ok(row.prompt.includes("[MASK]"));
 assert.equal(row.probe.punctuationStart,row.offset);
}
assert.equal(rows.filter(r=>r.challenge==="shared_word_different_sense").length,30);
const oldData=JSON.parse(await readFile(path.join(root,
 "evaluation/reader-strategy-synthetic-reference.json"),"utf8"));
const oldTexts=new Set(oldData.cases.map(c=>c.text));
assert.ok(rows.every(r=>!oldTexts.has(r.source)));
const hash=corpusHash(data.cases);
assert.match(hash,/^[0-9a-f]{64}$/);
const preview=spawnSync(process.execPath,[path.join(root,
 "scripts/evaluate-reader-holdout-v2.mjs"),"--preview"],
 {encoding:"utf8",timeout:120000});
assert.equal(preview.status,0,preview.stderr+"\n"+preview.stdout);
assert.match(preview.stdout,/1000 boundaries, 100 scenario families/);
assert.match(preview.stdout,/no neural inference or file writes/);
const sample=rows.slice(0,4);
const tmp=await mkdtemp(path.join(tmpdir(),"reader-v2-"));
try{
 const file=path.join(tmp,"scores.json");
 let modelCalls=0;
 const scoring=await scoreLanguageModels(sample,{
  file,digest:hash,log:()=>{},
  createMask:async()=>({score:async(src,probe)=>{
   modelCalls++;
   const row=sample.find(x=>x.source===src&&x.offset===probe.punctuationStart);
   return {text:row.prompt,scores:{and:1,but:2,so:1,"-":1,".":0}};
  }}),
  createGPT:async()=>async()=>{modelCalls++;return -3.2;}
 });
 assert.deepEqual(scoring,{newCount:4,reused:0});
 assert.equal(modelCalls,12);
 const replay=await scoreLanguageModels(sample,{file,digest:hash,offline:true,
  log:()=>{},createMask:async()=>{throw Error("No inference allowed");},
  createGPT:async()=>{throw Error("No inference allowed");}});
 assert.deepEqual(replay,{newCount:0,reused:4});
 const cached=JSON.parse(await readFile(file,"utf8"));
 assert.equal(cached.version,CACHE_VERSION);
 assert.equal(cached.predictions.length,4);
 await assert.rejects(()=>scoreLanguageModels(sample,{
  file,digest:"wrong",offline:true}),/mismatch/);
}finally{await rm(tmp,{recursive:true,force:true});}
const featureNames=CONFIGURATIONS["linear+lexical"].keys;
function fake(label,i){
 const features=Object.fromEntries(featureNames.map(k=>[k,0.001*i]));
 features.gptQuality=label==="keep"?-6:-3;
 features.bertContrast=label==="but"?2:-1;
 features.semanticSimilarity=label==="keep"?0.05:0.75;
 features.lexicalJaccard=label==="keep"?0:0.4;
 return features;
}
const train=Array.from({length:402},(_,i)=>({
 id:"training-"+i,explicit:null,
 gold:["keep","and","but"][i%3],
 features:fake(["keep","and","but"][i%3],i)
}));
const test=rows.slice(0,60).map((r,i)=>({...r,features:fake(r.gold,i)}));
const baseline=frozenScores(train,test);
assert.equal(baseline.combined.count,60);
const tampered=test.map(r=>({...r,gold:r.gold==="keep"?"and":"keep"}));
const changed=frozenScores(train,tampered);
assert.deepEqual(baseline.predictions.map(r=>r.predicted),
 changed.predictions.map(r=>r.predicted),
 "New holdout gold labels must not affect model predictions");
console.log("Reader holdout v2: 1000 cases, 100 families, punctuation offsets, "+
 "LM caching, offline replay, preview and held-out gold isolation passed.");
