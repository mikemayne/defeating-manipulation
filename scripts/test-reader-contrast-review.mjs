import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {
 VERSION,SEED,STRATA,LABELS,REVIEW_HEADER,
 chooseReviewCases,reviewSheet,parseReviewSheet,
 reconcileReviews,adjudicationSheet,safeCell
} from "./reader-contrast-review-core.mjs";
import {args,} from "./finalize-reader-contrast-review.mjs";
import {alreadyDisplayed}
 from "./prepare-reader-contrast-review.mjs";

assert.equal(VERSION,"reader-contrast-blind-review-v1");
assert.equal(SEED,"20261121-and-but-ambiguity-v1");
assert.deepEqual(STRATA,["false_but","missed_but",
 "correct_but","correct_and"]);
assert.deepEqual(LABELS,["and_only","but_only","both","neither","uncertain"]);
assert.equal(safeCell("=1+2"),"'=1+2");
assert.equal(safeCell("-SUM(A1:A2)"),"'-SUM(A1:A2)");
assert.equal(safeCell("ordinary text"),"ordinary text");

const buckets=[
 {gold:"and",predicted:"but"},
 {gold:"but",predicted:"and"},
 {gold:"but",predicted:"but"},
 {gold:"and",predicted:"and"}
];
const rows=buckets.flatMap(({gold,predicted},b)=>
 Array.from({length:45},(_,i)=>({
  id:"original-"+b+"-"+i,
  document:"GUM_example_doc"+Math.floor((b*45+i)%40),
  genre:"genre"+(i%11),
  gold,predicted,explicitChoice:null,
  left:i===0?"=Potential spreadsheet formula":
   "First hypothetical synthetic case "+b+"-"+i,
  right:i===0?"-Another formula":
   "Second hypothetical synthetic case "+b+"-"+i,
  modelButScore:.3
 })));
const excluded=["original-0-0","original-1-0"];
const key=chooseReviewCases(rows,{excludedIds:excluded});
assert.equal(key.count,48);
assert.equal(new Set(key.items.map(x=>x.caseId)).size,48);
assert.equal(key.items.filter(x=>x.selectionBucket==="false_but").length,12);
for(const bucket of STRATA)
 assert.equal(key.items.filter(x=>x.selectionBucket===bucket).length,12);
assert.ok(key.items.every(x=>!excluded.includes(x.originalId)));
const docs=new Map(),genres=new Map();
for(const item of key.items){
 docs.set(item.document,(docs.get(item.document)||0)+1);
 genres.set(item.genre,(genres.get(item.genre)||0)+1);
}
assert.ok([...docs.values()].every(x=>x<=3));
assert.ok([...genres.values()].every(x=>x<=8));
assert.deepEqual(key,chooseReviewCases([...rows].reverse(),{
 excludedIds:excluded
}),"Selection cannot depend on incoming array order");
const a=reviewSheet(key,"A"),b=reviewSheet(key,"B");
assert.ok(a.startsWith(REVIEW_HEADER.join("\t")));
assert.ok(b.startsWith(REVIEW_HEADER.join("\t")));
assert.equal(a.trim().split("\n").length,49);
assert.equal(b.trim().split("\n").length,49);
assert.notEqual(a,b,"Two reviewers should receive different case orders");
assert.ok(!a.includes("selectionBucket"));
assert.ok(!a.includes("originalId"));
assert.ok(!a.includes("gold"));
assert.ok(!a.includes("modelButScore"));
assert.ok(!a.includes("GUM_example_doc"));
const blank=parseReviewSheet(a,key,"A",{allowIncomplete:true});
assert.equal(blank.size,48);
assert.ok([...blank.values()].every(x=>x.judgement===null));
assert.throws(()=>parseReviewSheet(a,key,"A"),/Missing judgement/);
assert.throws(()=>parseReviewSheet(a,key,"B"),/Wrong reviewer/);
assert.throws(()=>parseReviewSheet(a.replace(
 REVIEW_HEADER.join("\t"),"bad header"),key,"A"),/columns/);
assert.throws(()=>parseReviewSheet(a.replace(
 "First hypothetical","Mutated hypothetical"),key,"A",
 {allowIncomplete:true}),/source text altered/);
assert.throws(()=>parseReviewSheet(
 a.replace("\t\t\t\n","\tinvalid\t\t\n"),key,"A"),
 /Invalid judgement/);

function fill(sheet,reviewer,override={}){
 const text=sheet.trimEnd().split("\n");
 const filled=text.map((line,i)=>{
  if(i===0)return line;
  const cols=line.split("\t");
  // We preserve the standard trailing empty fields in a sheet.
  while(cols.length<REVIEW_HEADER.length)cols.push("");
  const k=key.items.find(x=>x.caseId===cols[1]);
  const judgement=override[k.caseId]||
   (k.gold==="and"?"and_only":"but_only");
  cols[4]=judgement;cols[5]="3";
  return cols.join("\t");
 });
 return filled.join("\n")+"\n";
}
const reviewedA=parseReviewSheet(fill(a,"A"),key,"A");
const reviewedB=parseReviewSheet(fill(b,"B"),key,"B");
const metrics=reconcileReviews(key,reviewedA,reviewedB);
assert.equal(metrics.agreementRate,1);
assert.equal(metrics.cohenKappa,1);
assert.equal(metrics.usableConsensus,48);
assert.equal(metrics.gdtbCompatibleInConsensus,48);
assert.ok(metrics.modelCompatibleInConsensus<48);
assert.equal(metrics.disagreementCount,0);
const summary=JSON.stringify(metrics);
assert.ok(!summary.includes("First hypothetical"));
assert.ok(!summary.includes("Second hypothetical"));
assert.ok(!summary.includes("GUM_example_doc"));
assert.ok(!summary.includes("Potential spreadsheet"));
assert.equal(adjudicationSheet(key,reviewedA,reviewedB).split("\n").length,2);

const disagreeId=key.items[0].caseId;
const disagreementA=parseReviewSheet(fill(a,"A",{
 [disagreeId]:"both"
}),key,"A");
const m=reconcileReviews(key,disagreementA,reviewedB);
assert.equal(m.agreementCount,47);
assert.equal(m.usableConsensus,47);
assert.ok(m.cohenKappa<1);
const sheet=adjudicationSheet(key,disagreementA,reviewedB);
assert.ok(sheet.includes(disagreeId));
assert.equal(sheet.trimEnd().split("\n").length,2);
const u=key.items[1].caseId;
const uncertainA=parseReviewSheet(fill(a,"A",{
 [u]:"uncertain"
}),key,"A");
assert.equal(reconcileReviews(key,uncertainA,reviewedB)
 .usableConsensus,47);
assert.throws(()=>reconcileReviews(key,new Map(),reviewedB),/complete/);
assert.throws(()=>chooseReviewCases(rows,{perStratum:40,
 excludedIds:rows.filter(x=>x.predicted==="but").map(x=>x.id)}),
 /Too few/);
const audit={outcomes:{
 first:{cases:{false_but:[{id:"a"},{id:"b"},{id:"c"},{id:"d"}],
  missed_but:[{id:"e"}]}},
 second:{cases:{false_but:[{id:"a"}],missed_but:[{id:"e"}]}}
}};
assert.deepEqual(alreadyDisplayed(audit).sort(),["a","b","c","e"]);
assert.throws(()=>alreadyDisplayed({outcomes:{
 first:{cases:{false_but:[]}}
}}),/lacks category/);
assert.equal(args(["--reviewer-a","One","--reviewer-b","Two"]).reviewerA,"One");
assert.throws(()=>args(["--reviewer-a","Same",
 "--reviewer-b","same"]),/distinct/);
for(const script of ["prepare-reader-contrast-review.mjs",
 "finalize-reader-contrast-review.mjs"]){
 const run=spawnSync(process.execPath,[
  path.resolve(path.dirname(fileURLToPath(import.meta.url)),script),
  "--help"
 ],{encoding:"utf8",timeout:60000});
 assert.equal(run.status,0,run.stderr);
 assert.match(run.stdout,/review|Review/i);
}
console.log("Blind 48-case AND/BUT review: source-free deterministic selection, "+
 "document/genre caps, previously shown exclusion, distinct random sheet "+
 "orders, spreadsheet formula escaping, integrity checks, five-option "+
 "annotation, agreement/kappa and source-free adjudication passed.");
