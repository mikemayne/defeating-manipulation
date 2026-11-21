import assert from "node:assert/strict";
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";
import {alignModelScores,assignExplicitRules,crossValidate,trainFusion,publishedBaseline}
 from "./evaluate-reader-fusion.mjs";
import {explicitBoundaryConnector}
 from "../extension/src/reader-connector-normalisation.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const datasetJson=JSON.parse(readFileSync(path.join(root,
 "evaluation/reader-strategy-synthetic-reference.json"),"utf8"));
const cases=datasetJson.cases;
const join={
 predictions:cases.map(item=>({
  id:item.id,expected_boundaries:item.expected_boundaries,
  boundaries:item.expected_boundaries.map(b=>({
   punctuationStart:b.offset,punctuation:item.text[b.offset],
   candidates:[
    {id:"and",score:b.choice==="and"?-3.2:-6.3},
    {id:"but",score:b.choice==="but"?-3.1:-6.4}
   ]
  }))
 }))
};
const mask={model:"Xenova/distilbert-base-uncased",templateVersion:"masked-gap-v1",
 predictions:cases.flatMap(item=>item.expected_boundaries.map(b=>({
  id:item.id,offset:b.offset,gold:b.choice,source:item.text,
  scores:{
   and:b.choice==="and"?11:3,
   but:b.choice==="but"?11:3,
   so:b.choice==="and"?10:2,
   "-":b.choice==="keep"?12:4,
   ".":b.choice==="keep"?12:5
  }
 })))};
assert.equal(mask.predictions.length,102);
const basePredictions=mask.predictions.map(r=>({
 id:r.id,offset:r.offset,gold:r.gold,predicted:r.gold
}));
join.ruleAssistedTwoScore={predictions:basePredictions};
mask.report={results:{"-":{assisted:{predictions:basePredictions}}}};

const rows=assignExplicitRules(alignModelScores(join,mask,cases),
 (source,offset)=>explicitBoundaryConnector(source,{
  punctuationStart:offset,punctuationEnd:offset+1
 }));
assert.equal(rows.length,102);
assert.equal(publishedBaseline(rows,join.ruleAssistedTwoScore).correct,102);
const keys=["gptQuality","gptContrast","bertContrast","bertHyphen","bertPeriod","bertSo"];
const cv=crossValidate(rows,{keys,folds:5,seed:20261121});
assert.equal(cv.combined.count,102);
assert.equal(cv.predictions.length,102);
assert.equal(new Set(cv.predictions.map(p=>p.id+":"+p.offset)).size,102);
assert.ok(cv.combined.accuracy>0.85,"Toy separable data should be mostly classified");
for(const f of cv.folds){
 const n=new Set(cv.predictions.filter(p=>p.fold===f.fold).map(p=>p.id));
 assert.equal(n.size,f.testCases);
}
const heldout=new Set(cv.predictions.filter(p=>p.fold===1).map(p=>p.id));
const tampered=rows.map(r=>heldout.has(r.id)?{...r,gold:r.gold==="keep"?"and":"keep"}:r);
const cvTampered=crossValidate(tampered,{keys,folds:5,seed:20261121});
for(const p of cv.predictions.filter(p=>p.fold===1)){
 const other=cvTampered.predictions.find(x=>x.id===p.id&&x.offset===p.offset);
 assert.equal(other.predicted,p.predicted,"Held-out gold must not affect same fold's model");
}
assert.throws(()=>alignModelScores(join,{...mask,predictions:mask.predictions.slice(1)},cases),
 /Missing masked prediction|different numbers/);
assert.throws(()=>alignModelScores(join,{
 ...mask,predictions:[{...mask.predictions[0],gold:"keep"},...mask.predictions.slice(1)]
},cases),/ground truth label/);
assert.throws(()=>alignModelScores(join,mask,[{...cases[0],text:"Changed!"},...cases.slice(1)]),
 /reference dataset/);
const trained=trainFusion(rows.slice(0,60),keys);
assert.ok(["keep","and","but"].includes(trained(rows[61])));

const dir=mkdtempSync(path.join(tmpdir(),"fusion-cv-"));
try{
 const files={
  join:path.join(dir,"join.json"),
  mask:path.join(dir,"mask.json"),
  output:path.join(dir,"report.json")
 };
 writeFileSync(files.join,JSON.stringify(join));
 writeFileSync(files.mask,JSON.stringify(mask));
 const run=spawnSync(process.execPath,[
  path.join(root,"scripts/evaluate-reader-fusion.mjs"),
  "--join",files.join,"--mask",files.mask,"--output",files.output,"--max-errors","0"
 ],{encoding:"utf8",maxBuffer:8e6,timeout:120000});
 assert.equal(run.status,0,run.stderr+"\n"+run.stdout);
 const result=JSON.parse(readFileSync(files.output,"utf8"));
 assert.equal(result.boundaryCount,102);
 assert.equal(result.baselines.gpt2.correct,102);
 assert.equal(result.baselines.bertHyphen.correct,102);
 assert.equal(Object.keys(result.results).length,6);
 for(const item of Object.values(result.results)){
  assert.equal(item.combined.count,102);
  assert.equal(item.predictions.length,102);
  assert.ok(item.combined.accuracy>=0&&item.combined.accuracy<=1);
 }
 assert.match(run.stdout,/zero language-model calls/);
 console.log("Fusion: aligned caches, group holdouts, no test-label leakage, baselines and CLI passed.");
}finally{rmSync(dir,{recursive:true,force:true});}
