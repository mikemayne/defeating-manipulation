import assert from "node:assert/strict";
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";
import {DISCOURSE_SIMPLIFIER_VERSION}
 from "../extension/src/reader-discourse-simplifier.mjs";

// Exercise the actual CLI, including A/B refitting and cached-score reuse,
// without downloading a model or committing large generated model score files.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const dataset=JSON.parse(readFileSync(path.join(root,
 "evaluation/reader-strategy-synthetic-reference.json"),"utf8")).cases;
const predictions=dataset.map(item=>({
 id:item.id,expected_boundaries:item.expected_boundaries,
 boundaries:item.expected_boundaries.map(({offset,choice})=>{
  const candidates=[
   {id:"and",score:choice==="and"?-2:-6},
   {id:"but",score:choice==="but"?-2:-6}
  ];
  return {
   punctuationStart:offset,punctuation:item.text[offset],
   candidates,simplifiedCandidates:candidates.map(c=>({...c})),
   simplifiedScoreVersion:DISCOURSE_SIMPLIFIER_VERSION,
   keepScore:choice==="keep"?-2:-6
  };
 })
}));
const dir=mkdtempSync(path.join(tmpdir(),"reader-join-cv-"));
try{
 const input=path.join(dir,"input.json");
 const output=path.join(dir,"report.json");
 writeFileSync(input,JSON.stringify({predictions}),"utf8");
 const child=spawnSync(process.execPath,[
  path.join(root,"scripts/cross-validate-reader-joins.mjs"),
  "--scores",input,"--output",output,"--score-simplified","--max-errors","0"
 ],{encoding:"utf8",maxBuffer:4e6});
 assert.equal(child.status,0,child.stderr+"\n"+child.stdout);
 assert.match(child.stdout,/0 new model calls/u);
 const report=JSON.parse(readFileSync(output,"utf8"));
 assert.equal(report.boundaryCount,102);
 assert.equal(report.simplifiedModelVersion,DISCOURSE_SIMPLIFIER_VERSION);
 assert.equal(report.twoScore.combined.cases,102);
 assert.equal(report.ruleAssistedTwoScore.combined.cases,102);
 assert.equal(report.simplifiedTwoScore.combined.cases,102);
 assert.equal(report.ruleAssistedSimplifiedTwoScore.combined.cases,102);
 assert.equal(report.simplifiedTwoScore.combined.accuracy,
  report.twoScore.combined.accuracy,"Identical scores should yield identical A/B results");
 assert.equal(report.ruleAssistedSimplifiedTwoScore.combined.accuracy,
  report.ruleAssistedTwoScore.combined.accuracy,"Rules held constant across A/B modes");
 console.log("Cross-validation A/B metrics, versioned cache and no-model replay passed.");
}finally{rmSync(dir,{recursive:true,force:true});}
