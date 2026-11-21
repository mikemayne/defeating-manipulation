import assert from "node:assert/strict";
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from "node:fs";
import path from "node:path";
import {tmpdir} from "node:os";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {MASK_MODEL,MASK_TEMPLATE_VERSION,MASK_WORDS,NEUTRAL_WORDS,
 maskedGapPrompt,scoreMaskLogits,listEligibleMaskWords,extractBoundaryProbes}
 from "../extension/src/reader-mask-infill.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
assert.ok(NEUTRAL_WORDS.includes("-"));
assert.ok(NEUTRAL_WORDS.includes("—"));
assert.ok(NEUTRAL_WORDS.includes("."));
assert.ok(MASK_WORDS.includes("and")&&MASK_WORDS.includes("but"));

const sentence="The manager promised delivery. However, the package arrived late.";
const probes=extractBoundaryProbes(sentence);
assert.equal(probes.length,1);
const text=maskedGapPrompt(sentence,probes[0]);
assert.equal(text.text,"The manager promised delivery [MASK] the package arrived late.");
assert.equal(text.strippedConnector,"however");
assert.equal(text.sourceOffset,sentence.indexOf("."));
assert.equal(sentence,"The manager promised delivery. However, the package arrived late.");

const ids=[101,11,103,102],vocab=256;
const fake=new Float32Array(ids.length*vocab);
fake[2*vocab+201]=4;
fake[2*vocab+202]=8;
const ranked=scoreMaskLogits(ids,103,
 {dims:[1,4,vocab],data:fake},{and:201,but:202});
assert.equal(ranked.and,4);
assert.equal(ranked.but,8);
assert.throws(()=>scoreMaskLogits(ids,999,{dims:[1,4,vocab],data:fake},{and:201}),
 /Exactly one mask/);
const fakeTokenizer=(word)=>{
 const values=word==="erm"?[201,202]:word==="—"?[100]:[word.charCodeAt(0)];
 return {input_ids:{data:new Int32Array(values)}};
};
fakeTokenizer.unk_token_id=100;
const validation=listEligibleMaskWords(fakeTokenizer,["and","erm","-","—","."]);
assert.ok(validation.tokenIds.and>0);
assert.ok(validation.tokenIds["-"]>0);
assert.ok(validation.tokenIds["."]>0);
assert.equal(validation.excluded["—"],"Token is unavailable/unknown");
assert.match(validation.excluded.erm,/2 WordPiece/);

const data=JSON.parse(readFileSync(path.join(root,
 "evaluation/reader-strategy-synthetic-reference.json"),"utf8"));
const cases=data.cases;
const predictions=[];
for(const item of cases){
 const expected=new Map(item.expected_boundaries.map(x=>[x.offset,x.choice]));
 for(const probe of extractBoundaryProbes(item.text,{maxPairs:8})){
  const gold=expected.get(probe.punctuationStart);
  if(!gold)continue;
  const prompt=maskedGapPrompt(item.text,probe);
  const score={and:gold==="and"?10:2,but:gold==="but"?10:1,so:0,
   erm:gold==="keep"?10:-4,um:gold==="keep"?10:-4,
   uh:gold==="keep"?10:-4,well:gold==="keep"?10:-4,
   anyway:gold==="keep"?10:-4,
   "-":gold==="keep"?10:-4,"—":gold==="keep"?10:-4,
   ".":gold==="keep"?10:-4};
  predictions.push({id:item.id,offset:probe.punctuationStart,gold,
   source:item.text,punctuation:item.text[probe.punctuationStart],
   prompt:prompt.text,model:MASK_MODEL,
   templateVersion:MASK_TEMPLATE_VERSION,scores:score});
 }
}
assert.equal(predictions.length,102);
const folder=mkdtempSync(path.join(tmpdir(),"reader-mask-infill-test-"));
try{
 const input=path.join(folder,"mock-cache.json"),output=path.join(folder,"output.json");
 writeFileSync(input,JSON.stringify({predictions}),"utf8");
 const run=spawnSync(process.execPath,[
  path.join(root,"scripts/evaluate-reader-mask-infill.mjs"),
  "--scores",input,"--output",output,"--max-errors","0"
 ],{encoding:"utf8",maxBuffer:8e6});
 assert.equal(run.status,0,run.stderr+"\n"+run.stdout);
 const report=JSON.parse(readFileSync(output,"utf8"));
 assert.equal(report.boundaryCount,102);
 assert.equal(report.predictions.length,102);
 assert.ok(report.report.results["-"]);
 assert.ok(report.report.results["—"]);
 assert.ok(report.report.results["."]);
 assert.ok(report.report.results.erm);
 assert.ok(report.report.results["best-neutral"]);
 for(const scores of Object.values(report.report.results)){
  assert.equal(scores.plain.combined.count,102);
  assert.equal(scores.assisted.combined.count,102);
  assert.equal(scores.plain.predictions.length,102);
  assert.equal(scores.assisted.predictions.length,102);
  assert.equal(scores.assisted.combined.accuracy,1,"Fake perfect labels should classify exactly");
 }
 console.log("Masked FIM: candidate token checks, source offsets, dash fillers, cached grouped CV and report passed.");
}finally{rmSync(folder,{recursive:true,force:true});}
