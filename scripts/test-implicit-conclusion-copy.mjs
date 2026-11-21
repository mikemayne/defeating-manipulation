import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

// Exercise the actual browser click handler without changing the DOM or
// requiring a browser model download. In particular an implicit result has
// no "incorrect" field, so it must be handled BEFORE that legacy guard.
const ui=fs.readFileSync("extension/src/benchmark-ui.mjs","utf8");
const reportStart=ui.indexOf("function implicitConclusionReport(data){");
const handlerStart=ui.indexOf('copyButton.addEventListener("click", async () => {');
const handlerEnd=ui.indexOf('downloadButton.addEventListener("click"',handlerStart);
assert.ok(reportStart>=0&&handlerStart>reportStart&&handlerEnd>handlerStart,
 "The implicit report and Copy handler must be present");
const source=ui.slice(reportStart,handlerEnd);
let clickHandler,copied=null;
const data={
 implicitMode:true,total:2,requested:2,stopped:false,
 summary:{eligibleQuestions:1,accepted:1,rejected:0,returnedNone:0,
  errors:0,labelled:0},
 predictions:[
  {id:"positive",text:"Why should we trust those figures after last year?",
   source_url:null,expected_implicit:null,expected_conclusion:null,
   predicted_implicit:true,candidates:[{start:0,end:49,
    question:"Why should we trust those figures after last year?",context:null}],
   attempts:[{status:"accepted",start:0,end:49,
    rawOutput:"Those figures should not be trusted."}],
   conclusions:[{impliedConclusion:"Those figures should not be trusted.",
    supportStatus:"no_explicit_premise"}]},
  {id:"negative",text:"The meeting concluded at noon.",source_url:null,
   expected_implicit:null,expected_conclusion:null,predicted_implicit:false,
   candidates:[],attempts:[],conclusions:[]}
 ]
};
const sandbox={
 lastResult:data,
 copyButton:{addEventListener(type,fn){
  assert.equal(type,"click");clickHandler=fn;
 }},
 copyTextToClipboard:async (text,label)=>{copied={text,label};},
 percent:value=>(value.toFixed(1)+"%"),
 comparisonReport:()=>{throw Error("wrong mode");},
 boundaryReport:()=>{throw Error("wrong mode");},
 readerReport:()=>{throw Error("wrong mode");},
 unlabelledReport:()=>{throw Error("wrong mode");},
 failureReport:()=>{throw Error("wrong mode");}
};
vm.runInNewContext(source,sandbox,{filename:"benchmark-copy-handler.js"});
assert.equal(typeof clickHandler,"function");
await clickHandler();
assert.ok(copied, "Implicit-conclusion Copy must actually invoke clipboard");
assert.equal(copied.label,"Copied all implied-conclusion results");
assert.match(copied.text,/ID: positive/);
assert.match(copied.text,/LLM accepted/);
assert.match(copied.text,/Suggested: Those figures should not be trusted/);
assert.match(copied.text,/ID: negative/);
assert.match(copied.text,/No eligible question/);
console.log("Implicit-conclusion lab Copy click handler and complete report passed.");
