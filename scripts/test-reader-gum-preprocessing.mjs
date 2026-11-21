import assert from "node:assert/strict";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";
import {normaliseGumRows,compareStrategies,summarizePairs,STRATEGIES,
 EXPERIMENT_VERSION} from "./evaluate-reader-gum-preprocessing.mjs";
import {extractBoundaryProbes,buildBoundaryChoices}
 from "../extension/src/reader-boundary-scorer.mjs";
import {maskedGapPrompt} from "../extension/src/reader-mask-infill.mjs";
import {sentencePair} from "../extension/src/reader-semantic-signals.mjs";
import {explicitBoundaryConnector}
 from "../extension/src/reader-connector-normalisation.mjs";
import {ABLATIONS} from "./evaluate-reader-gum-ablations.mjs";
import {CONFIGURATIONS} from "./evaluate-reader-nonlinear-fusion.mjs";

const rawSentence="There 's a practical plan. The meeting notes describe the plan.";
const rawUnchanged="The council approved the scheme. Engineers prepared for the work.";
function sample(id,source,label="and"){
 const point=source.indexOf(". ");
 if(point<0)throw Error("Malformed synthetic test fixture");
 const probe=extractBoundaryProbes(source,{maxPairs:12})
  .find(p=>p.punctuationStart===point);
 if(!probe)throw Error("Missing test probe");
 const pair=sentencePair(source,probe);
 return {
  id,offset:point,gold:label,family:"test-family",
  document:"GUM_news_fixture",genre:"news",domain:"news",
  challenge:"expansion.conjunction",relation:"expansion.conjunction",
  source,probe,choices:buildBoundaryChoices(source,probe),
  prompt:maskedGapPrompt(source,probe).text,
  left:pair.left,right:pair.right,
  explicit:explicitBoundaryConnector(source,probe)
 };
}
assert.equal(EXPERIMENT_VERSION,"reader-gum-preprocessing-v1");
assert.deepEqual(STRATEGIES["full-fusion"],ABLATIONS.baseline);
assert.equal(STRATEGIES["without-bert-punctuation"].includes("bertPeriod"),false);
assert.equal(STRATEGIES["without-bert-punctuation"].includes("bertContrast"),true);
assert.equal(STRATEGIES["without-period-and-hyphen"].includes("bertHyphen"),false);
const [a,b]=[sample("gum-demo-a",rawSentence),sample("gum-demo-b",rawUnchanged)];
const result=normaliseGumRows([a,b]);
assert.equal(result.summary.total,2);
assert.equal(result.summary.changed,1);
assert.equal(result.summary.unchanged,1);
assert.equal(result.summary.changedPairs,1);
assert.equal(result.summary.flagsByKind.formatting_artifact,1);
assert.equal(result.normalized[0].source,
 "There's a practical plan. The meeting notes describe the plan.");
assert.equal(result.normalized[0].gold,a.gold);
assert.equal(result.normalized[0].relation,a.relation);
assert.equal(result.normalized[0].family,a.family);
assert.equal(result.normalized[0].source[result.normalized[0].offset],".");
assert.equal(result.normalized[0].prompt,
 maskedGapPrompt(result.normalized[0].source,result.normalized[0].probe).text);
assert.equal(result.normalized[1].source,rawUnchanged);
assert.equal(result.normalized[1].offset,b.offset);
assert.equal(result.observed[0].originalOffset,a.offset);
assert.equal(result.observed[0].normalizedOffset,result.normalized[0].offset);
assert.equal(result.observed[0].changedPair,true);
assert.equal(result.observed[1].changed,false);
assert.throws(()=>normaliseGumRows([a,a]),/Duplicate/);
assert.throws(()=>normaliseGumRows([{...a,offset:0}]),/boundary/);
assert.throws(()=>normaliseGumRows([]),/required/);

// The benchmark MUST NOT apply speculative spelling, dictionary, or curated
// vocabulary edits. This preserves semantic meaning for the first experiment.
const uncertain=sample("gum-typo","The analyst found an idoit. Their report mentioned the mistake.");
const ctrl=normaliseGumRows([uncertain]);
assert.equal(ctrl.normalized[0].source,uncertain.source);
assert.equal(ctrl.summary.totalFormattingEdits,0);

// Paired diagnostics do not change gold labels to optimise accuracy.
const original={predictions:[]},cleaned={predictions:[]},changes=new Map();
for(let i=0;i<250;i++){
 const id="gum-paired-"+i,gold=i%2?"and":"but";
 const before=i%5===0?"keep":gold;
 const after=i%10===0?gold:i%11===0?"keep":before;
 original.predictions.push({id,gold,predicted:before,genre:"news",relation:"expansion.conjunction"});
 cleaned.predictions.push({id,gold,predicted:after,genre:"news",relation:"expansion.conjunction"});
 changes.set(id,{id,changed:i%2===0,changedPair:i%2===0,formattingEdits:i%2});
}
const pairs=summarizePairs(original,cleaned,changes);
assert.equal(pairs.records.length,250);
assert.equal(pairs.groups.changed.total,125);
assert.equal(pairs.groups.unchanged.total,125);
assert.equal(pairs.fixed-pairs.regressed,pairs.net);
assert.throws(()=>summarizePairs(original,{predictions:cleaned.predictions.slice(0,249)},changes),
 /250 cases/);
const mismatched=structuredClone(cleaned);
mismatched.predictions[2].gold="wrong";
assert.throws(()=>summarizePairs(original,mismatched,changes),/mismatch/);

// Three frozen fit configurations, both before and after, with no data leak.
const keys=CONFIGURATIONS["linear+lexical"].keys;
function mockFeatures(label){
 const obj=Object.fromEntries(keys.map((k,i)=>[k,(i+1)/20]));
 obj.gptQuality=label==="keep"?-6.5:-2;
 obj.gptContrast=label==="but"?2:-1;
 obj.bertContrast=label==="but"?2:-1;
 obj.semanticSimilarity=label==="keep"?0.09:0.7;
 obj.lexicalJaccard=label==="keep"?0:0.4;
 return obj;
}
const train=Array.from({length:48},(_,i)=>{
 const label=["keep","and","but"][i%3];
 return {id:"train"+i,gold:label,explicit:null,features:mockFeatures(label)};
});
const dataset=Array.from({length:250},(_,i)=>{
 const label=i%2?"and":"but";
 return {id:"gum"+i,gold:label,offset:10,explicit:null,
  genre:"news",relation:"expansion.conjunction",features:mockFeatures(label)};
});
const clean=dataset.map((row,i)=>({...row,features:{
 ...row.features,gptQuality:row.features.gptQuality+(i%2===0?0.01:0)}
}));
const meta=new Map(dataset.map((r,i)=>[r.id,{changed:i%2===0,changedPair:false,
 formattingEdits:i%2===0?1:0}]));
const evaluated=compareStrategies(train,dataset,clean,meta);
assert.deepEqual(Object.keys(evaluated),Object.keys(STRATEGIES));
for(const group of Object.values(evaluated)){
 assert.equal(group.original.count,250);
 assert.equal(group.normalized.count,250);
 assert.equal(group.paired.records.length,250);
}
const fakeGold=dataset.map(row=>({...row,gold:row.gold==="and"?"but":"and"}));
const changedLabels=compareStrategies(train,fakeGold,clean,meta);
for(const name of Object.keys(evaluated)){
 assert.deepEqual(evaluated[name].original.predictions.map(x=>x.predicted),
  changedLabels[name].original.predictions.map(x=>x.predicted),
  "Held-out GUM gold cannot affect predictions");
}
const command=spawnSync(process.execPath,[
 path.join(path.dirname(fileURLToPath(import.meta.url)),
  "evaluate-reader-gum-preprocessing.mjs"),"--help"
],{encoding:"utf8",timeout:90000});
assert.equal(command.status,0,command.stderr);
assert.match(command.stdout,/No spelling substitutions/);
console.log("GUM paired preprocessing: formatting-only source transform, "+
 "exact punctuation offset round-trip, unchanged labels, separated "+
 "cached scoring, three fixed variants, paired diagnostics passed.");
