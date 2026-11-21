import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";
import {eligibleAnd,documentRoundRobin,verifyAndPool,MIXTURE_SIZES}
 from "./build-reader-gum-and-mixtures.mjs";
import {compareAndMixturesCV,WEIGHT}
 from "./evaluate-reader-gum-and-mixtures.mjs";
import {compareExpansionCV}
 from "./evaluate-reader-gum-contrast-expansion.mjs";
import {CONFIGURATIONS} from "./evaluate-reader-nonlinear-fusion.mjs";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const file=n=>path.join(ROOT,"evaluation",n);
const read=async p=>JSON.parse(await readFile(file(p),"utf8"));
const hash=x=>createHash("sha256").update(x).digest("hex");
const [originalManifest,newManifest]=await Promise.all([
 read("reader-authentic-transfer-documents-v1.json"),
 read("reader-gum-contrast-expanded-documents-v1.json")
]);
assert.deepEqual(MIXTURE_SIZES,[0,110,220,440]);
assert.equal(WEIGHT,1);
assert.equal(newManifest.newTrainDocuments.length,118);
assert.equal(newManifest.futureUntouchedDocuments.length,39);
const roles={train:[],test:[],review:[]};
for(const byGenre of Object.values(originalManifest.genres))
 for(const role of Object.keys(roles))
  roles[role].push(...byGenre[role]);
const text="The first committee met yesterday. The second committee issued a report.";
const offset=text.indexOf(". ");
function item(id,doc,gold,relation=gold==="and"?
 "expansion.conjunction":"comparison.contrast",source=text){
 return {id,document:doc,genre:doc.split("_")[1],family:doc,
  row:2,relation,text:source,
  expected_boundaries:[{offset:source.indexOf(". "),choice:gold}]};
}
const train=Array.from({length:120},(_,i)=>
 item("old-train-"+i,roles.train[i%36],i%6?"and":"but"));
const holdout=Array.from({length:80},(_,i)=>
 item("old-test-"+i,roles.test[i%24],i%5?"and":"but"));
const originalHash=hash(JSON.stringify(["train","test"].map(role=>
 (role==="train"?train:holdout).map(c=>
 [c.id,c.document,c.row,c.text,c.expected_boundaries[0].choice]))));
const base={meta:{
 version:"reader-gum-transfer-v1",
 sourceRevision:originalManifest.sourceRevision,
 manifestFingerprint:hash(JSON.stringify(originalManifest)),
 selectionHash:originalHash,docCounts:{train:36,test:24,review:12}
},train,test:holdout};
const firstDoc=newManifest.newTrainDocuments[0];
const contrast=item("new-contrast",firstDoc,"but",
 "comparison.contrast",
 "A distinct contrast proposition appeared. The response challenged that proposition.");
const butExpansion={meta:{
 version:"reader-gum-contrast-expansion-v1",
 sourceRevision:originalManifest.sourceRevision,
 baselineSelectionHash:originalHash,
 expansionManifestHash:hash(JSON.stringify(newManifest)),
 selectionHash:hash(JSON.stringify([contrast].map(c=>[
  c.id,c.document,c.row,c.relation,c.text,c.expected_boundaries[0]
 ]))),
 subtypeCounts:{"comparison.contrast":1},
 newDocumentChecksums:Object.fromEntries(newManifest.newTrainDocuments.map(d=>[
  d,"fixture-sha-"+d
 ]))
},cases:[contrast]};
// Test genuine annotation group conflict handling, rather than choosing
// a convenient label from a contradictory annotation.
const cands=[
 {id:"a",document:firstDoc,source:"Sentence alpha. Sentence beta.",
  gold:"and",relation:"expansion.conjunction",row:1},
 {id:"conflict-one",document:firstDoc,source:"Sentence gamma. Sentence delta.",
  gold:"and",relation:"expansion.equivalence",row:3},
 {id:"conflict-two",document:firstDoc,source:"Sentence gamma. Sentence delta.",
  gold:"but",relation:"comparison.contrast",row:4},
 {id:"irrelevant",document:firstDoc,source:"Sentence epsilon. Sentence zeta.",
  gold:"but",relation:"comparison.contrast",row:5},
 {id:"a-duplicate",document:firstDoc,source:"Sentence alpha. Sentence beta.",
  gold:"and",relation:"expansion.conjunction",row:2}
];
const picked=eligibleAnd(cands,new Set());
assert.equal(picked.length,1);
assert.equal(picked[0].gold,"and");
assert.equal(eligibleAnd(cands,new Set([picked[0].id])).length,0);
assert.equal(eligibleAnd(cands,new Set([picked[0].source.toLowerCase()])).length,0);
assert.throws(()=>eligibleAnd(cands,new Set(),0),/cap/);
const queues=new Map([
 ["GUM_news_a",Array.from({length:5},(_,i)=>({
  id:"a"+i,document:"GUM_news_a",row:i+2
 }))],
 ["GUM_news_b",Array.from({length:5},(_,i)=>({
  id:"b"+i,document:"GUM_news_b",row:i+2
 }))]
]);
const rr=documentRoundRobin(queues,7);
assert.equal(rr.length,7);
assert.equal(new Set(rr.slice(0,2).map(x=>x.document)).size,2);
assert.deepEqual(documentRoundRobin(new Map([...queues].reverse()),7),rr);
assert.deepEqual(documentRoundRobin(queues,4),rr.slice(0,4));

// SHA-256 freezes all 440 actual training rows. Reserved/test source names
// and label changes must not pass the provenance verifier.
const poolCases=Array.from({length:440},(_,i)=>{
 const doc=newManifest.newTrainDocuments[i%118];
 const sentence="Unique proposition "+i+". A related second fact "+i+".";
 return item("new-and-"+i,doc,"and",
  i%3===0?"contingency.cause.reason":
  i%3===1?"expansion.level-of-detail.arg2-as-detail":
  "temporal.asynchronous.precedence",sentence);
});
const familyCounts={contingency:0,expansion:0,temporal:0};
for(const row of poolCases)familyCounts[row.relation.split(".")[0]]++;
const pool={
 meta:{
  version:"reader-gum-and-mixtures-v1",
  sourceRevision:originalManifest.sourceRevision,
  baselineSelectionHash:originalHash,
  butExpansionSelectionHash:butExpansion.meta.selectionHash,
  expansionManifestHash:hash(JSON.stringify(newManifest)),
  selectionHash:hash(JSON.stringify(poolCases.map(c=>[
   c.id,c.document,c.row,c.relation,c.text,c.expected_boundaries[0]
  ]))),
  sourceChecksums:butExpansion.meta.newDocumentChecksums,
  familyCounts,contributingDocuments:118
 },cases:poolCases
};
assert.equal(verifyAndPool(pool,base,originalManifest,newManifest,butExpansion)
 .poolSize,440);
const tampered=structuredClone(pool);
tampered.cases[0].document=roles.test[0];
assert.throws(()=>verifyAndPool(tampered,base,originalManifest,
 newManifest,butExpansion),/fingerprint|leaked|mismatch/i);
const wrongGold=structuredClone(pool);
wrongGold.cases[0].expected_boundaries[0].choice="but";
assert.throws(()=>verifyAndPool(wrongGold,base,originalManifest,
 newManifest,butExpansion),/fingerprint|leaked|mismatch/i);
const collision=structuredClone(pool);
collision.cases[1].text=collision.cases[0].text;
assert.throws(()=>verifyAndPool(collision,base,originalManifest,
 newManifest,butExpansion),/fingerprint|duplicate/i);

const keys=CONFIGURATIONS["linear+lexical"].keys;
function features(label,i){
 const f=Object.fromEntries(keys.map((k,j)=>[k,(j+1)/100]));
 f.gptQuality=label==="keep"?-7:-3+(i%3)/20;
 f.gptContrast=label==="but"?1.5:-1.5;
 f.bertContrast=label==="but"?1.1:-1.2;
 f.bertPeriod=label==="keep"?4:1.1;
 f.bertHyphen=label==="keep"?0.8:-1.4;
 f.semanticSimilarity=label==="keep"?0.04:0.66+(i%3)/20;
 f.lexicalJaccard=label==="keep"?0:0.25;
 f.lexicalContainment=label==="keep"?0:0.5;
 return f;
}
const synthetic=Array.from({length:402},(_,i)=>{
 const gold=["keep","and","but"][i%3];
 return {id:"syn-"+i,gold,explicit:null,features:features(gold,i)};
});
const old=Array.from({length:120},(_,i)=>{
 const gold=i%6===0?"but":"and",doc="GUM_essay_doc"+Math.floor(i/8);
 return {id:"orig-"+i,document:doc,gold,relation:gold==="but"?
  (i%12===0?"comparison.contrast":"comparison.concession.arg2-as-denier"):
  (i%3===0?"temporal.asynchronous.precedence":"expansion.conjunction"),
  explicit:null,features:features(gold,i)};
});
const extraBut=Array.from({length:48},(_,i)=>({
 id:"extra-but-"+i,document:i%4===0?"GUM_essay_doc"+
  Math.floor((i%15)):"GUM_news_new"+Math.floor(i/4),
 gold:"but",relation:i%2===0?"comparison.contrast":
 "comparison.concession.arg2-as-denier",
 source:"One thought "+i+". Another thought "+i+".",
 explicit:null,features:features("but",i)
}));
const extraAnd=Array.from({length:440},(_,i)=>({
 id:"extra-and-"+i,document:"GUM_news_new"+(i%25),
 gold:"and",relation:i%3===0?"contingency.cause.reason":
 "expansion.conjunction",
 source:"The claim "+i+". Next fact "+i+".",
 explicit:null,features:features("and",i)
}));
const comparison=compareAndMixturesCV(synthetic,old,extraBut,extraAnd,{
 folds:3,featureSets:{"full-fusion":keys}
});
assert.equal(comparison.validationCount,120);
assert.equal(comparison.andPool,440);
assert.equal(Object.keys(comparison.experiments).length,4);
const prior=compareExpansionCV(synthetic,old,extraBut,{
 folds:3,featureSets:{"full-fusion":keys},weights:[1]
}).experiments["full-fusion__but-x1"];
assert.equal(comparison.experiments["full-fusion__AND+0"].metrics.correct,
 prior.expanded.correct);
for(const size of MIXTURE_SIZES){
 const exp=comparison.experiments["full-fusion__AND+"+size];
 assert.equal(exp.metrics.count,120);
 assert.equal(exp.metrics.goldSupport.keep,0);
 assert.equal(exp.folds.length,3);
 assert.equal(exp.metrics.goldSupport.but,20);
 assert.equal(exp.paired.net,exp.paired.recovered-exp.paired.regressed);
 assert.equal(exp.categoryRecall.contrast.support+
  exp.categoryRecall.concession.support,20);
 assert.ok(exp.folds.every(f=>f.validationRows>0&&
  f.addedANDTraining<=size));
}
assert.throws(()=>compareAndMixturesCV(synthetic,old,extraBut,
 [{...extraAnd[0],gold:"but"},...extraAnd.slice(1)],
 {folds:3,featureSets:{"full-fusion":keys}}),/additional and/i);
assert.throws(()=>compareAndMixturesCV(synthetic,old,extraBut,
 [...extraAnd.slice(0,439),extraAnd[0]],
 {folds:3,featureSets:{"full-fusion":keys}}),/additional and/i);
const cli=spawnSync(process.execPath,[
 path.join(ROOT,"scripts/evaluate-reader-gum-and-mixtures.mjs"),"--help"
],{encoding:"utf8",timeout:90000});
assert.equal(cli.status,0,cli.stderr);
assert.match(cli.stdout,/AND additions 0\/110\/220\/440/);
console.log("GUM AND mixtures: 440 authentic labelled AND, deterministic "+
 "nested document sampling, immutable test/reserve split, original BUT-only "+
 "baseline, paired fixed-fold comparison, label integrity and no inference passed.");
