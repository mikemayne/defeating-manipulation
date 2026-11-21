import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {CONFIGURATIONS}
 from "./evaluate-reader-nonlinear-fusion.mjs";
import {auditContrastErrors,rankErrorRows,surfaceIndicators,
 reviewSheet,SCENARIOS,FEATURE_KEYS}
 from "./audit-reader-contrast-errors.mjs";

assert.equal(SCENARIOS.length,3);
assert.ok(FEATURE_KEYS.includes("nliForwardContradiction"));
const cues=surfaceIndicators(
 "The treatment was expensive.",
 "Surprisingly it worked quickly despite earlier failures.",
 {lexicalJaccard:.05});
assert.equal(cues.surprise,true);
assert.equal(cues.surpriseRight,true);
assert.equal(cues.adverse,true);
assert.equal(cues.favorable,true);
assert.equal(cues.lowLexicalOverlap,true);
assert.equal(surfaceIndicators("This did not work.","It failed.",{
 lexicalJaccard:.25}).negation,true);
assert.equal(surfaceIndicators("The house is blue.","The door is red.").surprise,
 false,"Do not conflate unrelated color changes with implicit contrast");
const sample=[
 {id:"higher",gold:"and",categories:["false_but"],
  explicitChoice:null,margin:.45,scores:{but:.72,and:.2},cues:{}},
 {id:"lower",gold:"and",categories:["false_but"],
  explicitChoice:null,margin:.20,scores:{but:.64,and:.3},cues:{}},
 {id:"manual",gold:"and",categories:["false_but"],
  explicitChoice:"but",margin:.85,scores:{but:.96,and:.02},cues:{}},
 {id:"miss1",gold:"but",categories:["missed_but"],
  explicitChoice:null,margin:-.50,scores:{but:.12,and:.80},cues:{}},
 {id:"miss2",gold:"but",categories:["missed_but"],
  explicitChoice:null,margin:-.10,scores:{but:.20,and:.70},cues:{}}
];
assert.deepEqual(rankErrorRows(sample,"false_but").map(r=>r.id),
 ["higher","lower"]);
assert.deepEqual(rankErrorRows(sample,"missed_but").map(r=>r.id),
 ["miss1","miss2"]);
assert.throws(()=>rankErrorRows(sample,"unknown"),/category/i);
assert.throws(()=>rankErrorRows(sample,"false_but",0),/limit/i);

// Realistic, deterministic, no-inference fixture. Supplementary data and
// heldout documents must never join validation source-document training.
const keys=CONFIGURATIONS["linear+lexical"].keys;
function features(gold,i){
 const f=Object.fromEntries(keys.map((k,j)=>[k,(j+1)/100]));
 f.gptQuality=gold==="keep"?-7:-3+(i%4)*.1;
 f.gptContrast=gold==="but"?1.3:-.8;
 f.bertContrast=gold==="but"?1.0:-1.1;
 f.semanticSimilarity=gold==="keep"?.05:.7;
 f.lexicalJaccard=.12;
 f.lexicalContainment=.3;
 return f;
}
const synthetic=Array.from({length:402},(_,i)=>{
 const gold=["keep","and","but"][i%3];
 return {id:"syn-"+i,gold,explicit:null,features:features(gold,i)};
});
const original=Array.from({length:120},(_,i)=>{
 const gold=i%6===0?"but":"and";
 const doc="GUM_news_doc"+Math.floor(i/8);
 return {id:"auth-"+i,gold,document:doc,
  relation:gold==="but"?"comparison.concession.arg2-as-denier":
   "expansion.conjunction",
  left:"The proposal was examined "+i+".",
  right:"The response raised a related question "+i+".",
  source:"The proposal was examined "+i+
   ". The response raised a related question "+i+".",
  explicit:null,features:features(gold,i)};
});
const newBut=Array.from({length:30},(_,i)=>({
 id:"new-but-"+i,gold:"but",document:"GUM_news_added"+Math.floor(i/4),
 relation:"comparison.contrast",
 source:"It looked certain "+i+". Reality differed "+i+".",
 explicit:null,features:features("but",i)
}));
const newAnd=Array.from({length:440},(_,i)=>({
 id:"new-and-"+i,gold:"and",document:"GUM_news_other"+(i%55),
 relation:"expansion.conjunction",
 source:"Fact one "+i+". The second detail "+i+".",
 explicit:null,features:features("and",i)
}));
const scenarios=[{
 id:"mini__AND+220__moderate",features:"full-fusion",
 additionalAnd:220,policy:"moderate",expectedArgmaxCorrect:null
}];
const report=auditContrastErrors(synthetic,original,newBut,newAnd,{
 scenarios,top:6,folds:3
});
assert.equal(report.validationCount,120);
assert.equal(report.scenarioCount,1);
const assessment=report.outcomes[scenarios[0].id];
assert.equal(assessment.gated.count,120);
assert.equal(assessment.gated.metrics.goldSupport.and,100);
assert.equal(assessment.gated.metrics.goldSupport.but,20);
assert.equal(assessment.gated.metrics.predictedKeep,
 assessment.gated.metrics.confusion.and.keep+
 assessment.gated.metrics.confusion.but.keep);
assert.equal(assessment.explicitOverrides,0);
assert.equal(Object.values(assessment.totalCategoryCounts).length,5);
for(const records of Object.values(assessment.cases))
 for(const r of records){
  assert.ok(r.left.startsWith("The proposal was examined"));
  assert.ok(r.right.startsWith("The response raised"));
  assert.equal(r.document.startsWith("GUM_news_doc"),true);
  assert.equal(typeof r.features.gptContrast,"number");
  assert.ok(r.fold>=1&&r.fold<=3);
 }
const sheet=reviewSheet(report);
assert.match(sheet,/and_plausible\tbut_plausible\texpectation_violation/);
assert.match(sheet,/original_gold/);
assert.doesNotMatch(sheet,/GUM_news_added/);
assert.throws(()=>auditContrastErrors(synthetic,original,newBut,newAnd,{
 scenarios,top:0,folds:3
}),/sample size/);
const cheat=newBut.map((r,i)=>i===0?{...r,
 document:"GUM_news_doc0"}:r);
const valid=auditContrastErrors(synthetic,original,cheat,newAnd,{
 scenarios,top:5,folds:3
});
assert.equal(valid.validationCount,120,
 "Same-document supplementary data must be excluded from its heldout fold");
const wrong=[{...scenarios[0],expectedArgmaxCorrect:999}];
assert.throws(()=>auditContrastErrors(synthetic,original,newBut,newAnd,{
 scenarios:wrong,top:5,folds:3
}),/Historical original GUM CV regression/);
const command=spawnSync(process.execPath,[
 path.resolve(path.dirname(fileURLToPath(import.meta.url)),
  "audit-reader-contrast-errors.mjs"),"--help"
],{encoding:"utf8",timeout:60000});
assert.equal(command.status,0,command.stderr);
assert.match(command.stdout,/--top N/);
console.log("Reader error audit: deterministic high-confidence false-positive / "+
 "false-negative ranking, surfacing cues as hypotheses only, 308-fold "+
 "provenance, heldout document isolation, local review sheet and CLI passed.");
