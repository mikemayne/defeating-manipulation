import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {
 VERSION,GUM_SHA,TARGET,extractConlluParagraphs,
 selectGumTrainingDocs,chooseGumSample,evaluateRows,AUTHORED
} from "./evaluate-implicit-real-gum.mjs";

assert.equal(VERSION,"implicit-gum-real-e2e-v1");
assert.equal(TARGET,180);
const DOC="GUM_news_fixture";
const short=[
 "# newdoc id = "+DOC,
 "# meta::sourceURL = https://example.invalid/fictional",
 "# newpar",
 "# newpar_block = head (1 s)",
 "# sent_id = "+DOC+"-1",
 "# text = A short title for the article",
 "",
 "# newpar",
 "# newpar_block = p (2 s)",
 "# sent_id = "+DOC+"-2",
 "# text = The municipal committee met in the community hall and discussed the final estimates.",
 "",
 "# sent_id = "+DOC+"-3",
 "# text = The independent audit found unexpected gaps in its submitted financial records.",
 "",
 "# newpar",
 "# newpar_block = p (1 s)",
 "# sent_id = "+DOC+"-4",
 "# text = And we are supposed to trust the committee's new estimates after what happened last year?",
 ""
].join("\n");
const parsed=extractConlluParagraphs(short,DOC,"news");
assert.equal(parsed.length,2);
assert.match(parsed[0].text,/committee met/);
assert.match(parsed[0].text,/audit found/);
assert.ok(!parsed[0].text.includes("A short title"));
assert.equal(parsed[1].text.split("?").length,2);
assert.equal(parsed[0].document,DOC);
assert.throws(()=>extractConlluParagraphs(short,"GUM_news_wrong","news"),/Invalid/);
assert.throws(()=>extractConlluParagraphs(short,DOC,"!bad"),/Invalid/);

const manifest={version:"reader-authentic-transfer-docs-v1",
 sourceRevision:GUM_SHA,genres:{}};
for(const genre of [
 "academic","bio","conversation","court","essay","fiction","letter",
 "news","reddit","vlog","interview","textbook"]){
 manifest.genres[genre]={
  train:[0,1,2].map(i=>"GUM_"+genre+"_fixture"+i),
  test:["GUM_"+genre+"_testcase"],
  review:["GUM_"+genre+"_reviewcase"]
 };
}
const train=selectGumTrainingDocs(manifest);
assert.equal(train.length,33);
assert.ok(train.every(r=>r.genre!=="reddit"));
assert.throws(()=>selectGumTrainingDocs({...manifest,
 sourceRevision:"wrong"}),/mismatch/);
assert.throws(()=>selectGumTrainingDocs({...manifest,
 genres:{...manifest.genres,
  news:{...manifest.genres.news,
   train:[manifest.genres.news.train[0],
    manifest.genres.news.train[1],"GUM_news_testcase"]}}}),
 /Disallowed/);

const artificial=[];
for(const [j,item] of train.entries()){
 for(let i=0;i<10;i++){
  artificial.push({id:"case"+j+"-"+i,genre:item.genre,
   document:item.document,text:i===0?
   "The committee lost the report. And we are supposed to trust its findings after what happened last year?":
   "The committee met and voted on its proposal after a long public debate. The meeting finished after the planned discussion."});
 }
}
assert.equal(artificial.length,330);
const s=chooseGumSample(artificial);
assert.equal(s.selected,180);
assert.equal(s.rows.length,180);
assert.ok(s.selectedCandidates>0);
assert.equal(new Set(s.rows.map(r=>r.id)).size,180);
assert.ok(s.documents>=12);
assert.deepEqual(s,chooseGumSample([...artificial].reverse()));
assert.ok(s.rows.every(r=>r.text.length>50));
assert.throws(()=>chooseGumSample([],{}),/100/);
assert.throws(()=>chooseGumSample(artificial,{target:250}),/100/);

const authored=AUTHORED.map(x=>({...x}));
assert.equal(authored.length,16);
assert.equal(authored.filter(r=>r.expected_implicit===true).length,8);
assert.equal(authored.filter(r=>r.expected_implicit===false).length,8);
// The end-to-end evaluator invokes exactly the production inference gates
// and validator; the generator is mocked ONLY in this deterministic unit test.
let generated=0,checked=0;
const report=await evaluateRows(authored,async()=>{
 generated++;return "NONE";
},async()=>{
 checked++;return {label:"unsupported_conclusion"};
});
assert.equal(report.cases,16);
assert.equal(report.authoredOnly,true);
assert.ok(report.summary.eligibleQuestions>0);
assert.equal(report.summary.accepted,0);
assert.equal(report.summary.errors,0);
assert.equal(report.summary.tp,0);
assert.equal(report.summary.fp,0);
assert.equal(report.summary.tn,8);
assert.equal(checked,0);
assert.equal(generated,report.summary.eligibleQuestions);
assert.doesNotMatch(JSON.stringify(report),
 /committee missed|audit exposed|bridge inspection|supplier promised/);
assert.ok(Object.hasOwn(report.byGenre,"authored"));
const help=spawnSync(process.execPath,[
 path.resolve(path.dirname(fileURLToPath(import.meta.url)),
  "evaluate-implicit-real-gum.mjs"),"--help"
],{encoding:"utf8",timeout:60000});
assert.equal(help.status,0,help.stderr);
assert.match(help.stdout,/sample-only/);
console.log("Implicit genuine-paragraph pilot: 33 training docs, "+
 "clean CoNLLU paragraphs, 180 diverse selections, candidate gates, "+
 "16 safe authored controls, abstention, source-free summaries passed.");
