import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {spawnSync} from "node:child_process";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {validateManifest,makeReviewItems,pickCandidates,VERSION}
 from "./build-reader-gum-transfer.mjs";
import {verifyTransferCorpus,transferRows,compareAuthenticTraining}
 from "./evaluate-reader-gum-transfer.mjs";
import {CONFIGURATIONS}
 from "./evaluate-reader-nonlinear-fusion.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const data=JSON.parse(await readFile(path.join(root,
 "evaluation/reader-authentic-transfer-documents-v1.json"),"utf8"));
const partitions=validateManifest(data);
assert.deepEqual(Object.fromEntries(Object.entries(partitions).map(([k,v])=>
 [k,v.length])),{train:36,test:24,review:12});
const all=Object.values(partitions).flat().map(x=>x.document);
assert.equal(new Set(all).size,72);
assert.throws(()=>validateManifest({...data,sourceRevision:"wrong"}),/manifest mismatch/i);
const contaminated=structuredClone(data);
contaminated.genres.academic.test[0]=contaminated.genres.academic.train[0];
assert.throws(()=>validateManifest(contaminated),/Nonunique/);

const header="doc\tunit1_toks\tunit2_toks\tunit1_txt\tunit2_txt\t"+
 "u1_raw\tu2_raw\ts1_toks\ts2_toks\tunit1_sent\tunit2_sent\t"+
 "dir\trel_type\torig_label\tlabel";
function relLine({doc="GUM_reddit_card",a="1-8",b="9-16",type="explicit",
 relation="expansion.conjunction"}={}){
 const left="The advisory group approved a new policy.";
 const right="The team published the policy on Monday.";
 return [doc,a,b,left,right,left,right,a,b,left,right,
  "1<2",type,relation,relation].join("\t");
}
const source=header+"\n"+relLine()+"\n"+
 relLine({a:"20-27",b:"28-39",type:"implicit"})+"\n";
const reviewed=makeReviewItems(source,"GUM_reddit_card","reddit");
assert.equal(reviewed.length,1);
assert.equal(reviewed[0].label,null);
assert.equal(reviewed[0].status,"unreviewed");
assert.equal(reviewed[0].first,"The advisory group approved a new policy.");
assert.ok(!("relation" in reviewed[0]),"Original reference label is concealed");
const inputs=Array.from({length:20},(_,i)=>({
 id:"example"+i,document:"GUM_reddit_card",
 source:"The advisory group met. This was followed by a report "+i+".",
 gold:i%2?"and":"but",row:i
}));
assert.equal(pickCandidates(inputs,"train").length,12);
assert.deepEqual(pickCandidates(inputs,"train").map(x=>x.id),
 pickCandidates([...inputs].reverse(),"train").map(x=>x.id),
 "Selection never depends on source iteration order");
assert.equal(pickCandidates([...inputs,inputs[0]],"test").length,12);

// Synthetic corpus metadata mock: verify that IDs, gold and source documents
// cannot leak between authentic training and held-out partition.
const sha=s=>createHash("sha256").update(s).digest("hex");
const originalText="The advisory board met on Thursday. The participants prepared a report.";
const offset=originalText.indexOf(". ");
const make=(id,doc,gold)=>({
 id,document:doc,genre:"reddit",family:doc,row:2,
 relation:gold==="but"?"comparison.contrast":"expansion.conjunction",
 text:originalText,expected_boundaries:[{offset,choice:gold}]
});
const cTrain=Array.from({length:120},(_,i)=>make("train"+i,
 partitions.train[i%36].document,i%5?"and":"but"));
const cTest=Array.from({length:80},(_,i)=>make("test"+i,
 partitions.test[i%24].document,i%4?"and":"but"));
const hash=sha(JSON.stringify(["train","test"].map((role,i)=>
 [cTrain,cTest][i].map(c=>[c.id,c.document,c.row,c.text,c.expected_boundaries[0].choice]))));
const corpus={meta:{version:VERSION,
 sourceRevision:data.sourceRevision,selectionHash:hash},
 train:cTrain,test:cTest};
const verified=verifyTransferCorpus(corpus);
assert.equal(verified.trainDocuments.size,36);
assert.equal(verified.testDocuments.size,24);
assert.equal(transferRows(corpus.train).length,120);
assert.equal(transferRows(corpus.test).length,80);
assert.throws(()=>verifyTransferCorpus({...corpus,
 test:[...corpus.test,{...corpus.test[0],id:"dup"}]}),/fingerprint/);
const leaked=structuredClone(corpus);
leaked.test[0].document=leaked.train[0].document;
assert.throws(()=>verifyTransferCorpus(leaked),/overlap/);

const keys=CONFIGURATIONS["linear+lexical"].keys;
function feature(label){
 const f=Object.fromEntries(keys.map((k,i)=>[k,(i+1)/50]));
 f.gptContrast=label==="but"?2:-2;
 f.bertContrast=label==="but"?1.2:-1.3;
 f.gptQuality=label==="keep"?-8:-3.5;
 f.semanticSimilarity=label==="keep"?0.12:0.65;
 f.lexicalJaccard=label==="keep"?0.01:0.3;
 f.lexicalContainment=label==="keep"?0.01:0.5;
 return f;
}
const synthetic=Array.from({length:402},(_,i)=>{
 const label=["keep","and","but"][i%3];
 return {id:"synthetic"+i,gold:label,explicit:null,features:feature(label)};
});
const realTrain=cTrain.map(c=>({...c,features:feature(c.expected_boundaries[0].choice),
 gold:c.expected_boundaries[0].choice,explicit:null}));
const realTest=cTest.map(c=>({...c,features:feature(c.expected_boundaries[0].choice),
 gold:c.expected_boundaries[0].choice,explicit:null,offset,relation:c.relation}));
const observed=compareAuthenticTraining(synthetic,realTrain,realTest);
assert.deepEqual(Object.keys(observed),
 ["full","minus-period-and-hyphen","minus-bert-punctuation"]);
for(const val of Object.values(observed)){
 assert.equal(val.syntheticOnly.count,80);
 assert.equal(val.syntheticPlusAuthentic.count,80);
 assert.equal(val.syntheticOnly.goldSupport.keep,0);
 assert.equal(val.syntheticPlusAuthentic.goldSupport.keep,0);
 assert.equal(val.paired.net,val.paired.recovered-val.paired.regressed);
}
const changedGold=realTest.map(x=>({...x,gold:x.gold==="but"?"and":"but"}));
const identical=compareAuthenticTraining(synthetic,realTrain,changedGold);
for(const name of Object.keys(observed)){
 assert.deepEqual(observed[name].syntheticOnly.predictions.map(x=>x.predicted),
  identical[name].syntheticOnly.predictions.map(x=>x.predicted));
 assert.deepEqual(observed[name].syntheticPlusAuthentic.predictions.map(x=>x.predicted),
  identical[name].syntheticPlusAuthentic.predictions.map(x=>x.predicted));
}
assert.throws(()=>compareAuthenticTraining(synthetic,realTrain,
 realTest.map((row,i)=>i===0?{...row,document:realTrain[0].document}:row)),
 /leakage/);
const cmd=spawnSync(process.execPath,[
 path.join(root,"scripts/evaluate-reader-gum-transfer.mjs"),"--help"
],{encoding:"utf8",timeout:60000});
assert.equal(cmd.status,0,cmd.stderr);
console.log("Authentic GUM transfer: 72 disjoint source documents, original annotation "+
 "integrity, human KEEP review blind queue, frozen 402 synthetic comparator, "+
 "document leakage checks, and held-out gold isolation passed.");
