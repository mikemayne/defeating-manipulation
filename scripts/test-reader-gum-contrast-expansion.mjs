import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";
import path from "node:path";
import {additionalContrasts,verifyExpansion,verifyExpansionManifest}
 from "./build-reader-gum-contrast-expansion.mjs";
import {compareExpansionCV,WEIGHTS}
 from "./evaluate-reader-gum-contrast-expansion.mjs";
import {evaluateTrainingOnlyCV}
 from "./evaluate-reader-gum-but-cv.mjs";
import {CONFIGURATIONS}
 from "./evaluate-reader-nonlinear-fusion.mjs";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const json=async n=>JSON.parse(await readFile(path.join(ROOT,"evaluation",n),"utf8"));
const [originalManifest,newManifest]=await Promise.all([
 json("reader-authentic-transfer-documents-v1.json"),
 json("reader-gum-contrast-expanded-documents-v1.json")
]);
assert.equal(newManifest.newTrainDocuments.length,118);
assert.equal(newManifest.futureUntouchedDocuments.length,39);
assert.deepEqual(WEIGHTS,[1,1.4,2]);
const hash=x=>createHash("sha256").update(x).digest("hex");
const roles={train:[],test:[],review:[]};
for(const byGenre of Object.values(originalManifest.genres))
 for(const role of Object.keys(roles))
  roles[role].push(...byGenre[role]);
const testText="The board met on Tuesday. The members examined the situation.";
const offset=testText.indexOf(". ");
const ex=(id,doc,gold)=>({
 id,document:doc,genre:doc.split("_")[1],family:doc,row:2,
 relation:gold==="but"?"comparison.contrast":"expansion.conjunction",
 text:testText,expected_boundaries:[{offset,choice:gold}]
});
const train=Array.from({length:120},(_,i)=>ex("train-"+i,
 roles.train[i%36],i%6===0?"but":"and"));
const test=Array.from({length:80},(_,i)=>ex("holdout-"+i,
 roles.test[i%24],i%8===0?"but":"and"));
const baseHash=hash(JSON.stringify(["train","test"].map(role=>
 (role==="train"?train:test).map(c=>
 [c.id,c.document,c.row,c.text,c.expected_boundaries[0].choice]))));
const base={meta:{
 version:"reader-gum-transfer-v1",
 sourceRevision:originalManifest.sourceRevision,
 manifestFingerprint:hash(JSON.stringify(originalManifest)),
 selectionHash:baseHash,
 docCounts:{train:36,test:24,review:12}
},train,test};
const rolesValid=verifyExpansionManifest(newManifest,base,originalManifest);
assert.equal(rolesValid.newDocs.size,118);
assert.equal(rolesValid.reserved.size,39);
const forbidden=structuredClone(newManifest);
forbidden.newTrainDocuments[0]=roles.test[0];
assert.throws(()=>verifyExpansionManifest(forbidden,base,originalManifest),
 /excluded|repeated/i);
const collision=structuredClone(newManifest);
collision.newTrainDocuments[0]=collision.futureUntouchedDocuments[0];
assert.throws(()=>verifyExpansionManifest(collision,base,originalManifest),
 /excluded|repeated/i);
const makeCandidate=(id,doc,gold="but",relation="comparison.contrast")=>({
 id,document:doc,row:2,source:"First original statement "+id+
 ". Second independent statement "+id+".",gold,relation,
 genre:doc.split("_")[1],offset:("First original statement "+id).length,
 tokenRanges:["1-4","5-10"]
});
const firstDoc=newManifest.newTrainDocuments[0];
const candidates=[
 makeCandidate("one",firstDoc),
 makeCandidate("two",firstDoc,"but","comparison.concession.arg2-as-denier"),
 makeCandidate("same",firstDoc,"but"),
 makeCandidate("same-dupe",firstDoc,"but")
];
const duplicates=candidates.map(x=>({...x}));
duplicates[3].source=duplicates[2].source;
const chosen=additionalContrasts(duplicates,new Set(),2);
assert.equal(chosen.length,2);
assert.ok(chosen.every(x=>x.gold==="but"));
const ambiguous=[
 makeCandidate("conflict",firstDoc,"but"),
 {...makeCandidate("conflict",firstDoc,"and"),
  source:makeCandidate("conflict",firstDoc,"but").source}
];
assert.equal(additionalContrasts(ambiguous,new Set()).length,0);
assert.equal(additionalContrasts([makeCandidate("known",firstDoc)],
 new Set(["known"])).length,0);
assert.throws(()=>additionalContrasts(duplicates,new Set(),0),/cap/);
const cases=[
 ex("extra-1",firstDoc,"but"),
 {...ex("extra-2",newManifest.newTrainDocuments[1],"but"),
  relation:"comparison.concession.arg2-as-denier"}
];
const categories={"comparison.contrast":1,"comparison.concession":1};
const supplement={
 meta:{
  version:"reader-gum-contrast-expansion-v1",
  sourceRevision:originalManifest.sourceRevision,
  baselineSelectionHash:baseHash,
  expansionManifestHash:hash(JSON.stringify(newManifest)),
  subtypeCounts:categories,
  selectionHash:hash(JSON.stringify(cases.map(c=>[
   c.id,c.document,c.row,c.relation,c.text,c.expected_boundaries[0]
  ])))
 },cases
};
assert.equal(verifyExpansion(supplement,base,originalManifest,newManifest).count,2);
const bad=structuredClone(supplement);
bad.cases[0].document=roles.test[0];
assert.throws(()=>verifyExpansion(bad,base,originalManifest,newManifest),
 /checksum|selection|leaked/i);
const mutated=structuredClone(supplement);
mutated.meta.subtypeCounts["comparison.contrast"]++;
assert.throws(()=>verifyExpansion(mutated,base,originalManifest,newManifest),
 /subtype/i);

// A small deterministic 3-fold synthetic simulation: each heldout document
// is compared on exactly the same originals before/after augmentation.
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
const original=Array.from({length:120},(_,i)=>{
 const gold=i%6===0?"but":"and";
 const doc="GUM_essay_doc"+Math.floor(i/8);
 return {id:"auth-"+i,document:doc,gold,relation:gold==="but"?
  (i%12===0?"comparison.contrast":"comparison.concession.arg2-as-denier"):
  "expansion.conjunction",explicit:null,features:features(gold,i)};
});
const added=Array.from({length:48},(_,i)=>({
 id:"new-but-"+i,gold:"but",
 document:i%4===0?"GUM_essay_doc"+Math.floor(i%15):"GUM_news_new"+Math.floor(i/4),
 relation:i%2===0?"comparison.contrast":
 "comparison.concession.arg2-as-denier",
 explicit:null,features:features("but",i)
}));
const tested=compareExpansionCV(synthetic,original,added,{
 folds:3,featureSets:{"full-fusion":keys},weights:[1,2]
});
const old=evaluateTrainingOnlyCV(synthetic,original,{
 folds:3,featureSets:{"full-fusion":keys},multipliers:[1,2]
});
for(const multiplier of [1,2]){
 const id="full-fusion__but-x"+multiplier;
 const x=tested.experiments[id];
 assert.equal(x.baseline.correct,old.experiments[id].pooled.correct);
 assert.equal(x.baseline.balancedRecall,
  old.experiments[id].pooled.balancedRecall);
 assert.equal(x.expanded.count,120);
 assert.equal(x.baseline.count,120);
 assert.equal(x.BUTSubtypes.contrast.support+
  x.BUTSubtypes.concession.support,20);
 assert.equal(x.folds.length,3);
 assert.equal(x.paired.net,x.paired.recovered-x.paired.regressed);
 assert.ok(x.folds.some(f=>f.extraTrainingRows<added.length),
  "Fold with added same-document examples must exclude those examples");
}
assert.equal(tested.validationCount,120);
assert.equal(tested.newContrastTrainingCount,48);
assert.equal(tested.unchangedValidationDocuments.length,3);
assert.throws(()=>compareExpansionCV(synthetic,original,
 [...added,{...added[0]}],{folds:3,featureSets:{"full-fusion":keys},
 weights:[1]}),/duplicate/i);
assert.throws(()=>compareExpansionCV(synthetic,original,
 [{...added[0],gold:"keep"},...added.slice(1)],
 {folds:3,featureSets:{"full-fusion":keys},weights:[1]}),
 /extra BUT/i);
const cli=spawnSync(process.execPath,[
 path.join(ROOT,"scripts/evaluate-reader-gum-contrast-expansion.mjs"),"--help"
],{encoding:"utf8",timeout:60000});
assert.equal(cli.status,0,cli.stderr);
console.log("Expanded contrast training: 118 new train / 39 untouched sources, "+
 "original GUM test exclusion, subtype label integrity, duplicate prevention, "+
 "same-fold comparator, no heldout-doc training leakage and CLI passed.");
