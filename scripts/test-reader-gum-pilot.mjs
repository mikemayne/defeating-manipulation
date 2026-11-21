import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {GENRES,GUM_COMMIT,VERSION,parseGdtbRels,
 mapGdtbLabel,candidatesFromGdtb,selectPilot}
 from "./build-reader-gum-pilot.mjs";
import {pilotRows,calculateMappedMetrics}
 from "./evaluate-reader-gum-pilot.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
assert.equal(Object.keys(GENRES).length,10);
assert.equal(mapGdtbLabel("comparison.contrast","implicit").choice,"but");
assert.equal(mapGdtbLabel("comparison.concession.arg2-as-denier","implicit").choice,"but");
assert.equal(mapGdtbLabel("contingency.cause.result","implicit").choice,"and");
assert.equal(mapGdtbLabel("expansion.conjunction","implicit").choice,"and");
assert.equal(mapGdtbLabel("expansion.level-of-detail.arg2-as-detail","implicit").choice,"and");
assert.equal(mapGdtbLabel("temporal.asynchronous.precedence","implicit").choice,"and");
assert.equal(mapGdtbLabel("expansion.substitution.arg2-as-subst","implicit").choice,null);
assert.equal(mapGdtbLabel("comparison.contrast","explicit").choice,null);
assert.equal(mapGdtbLabel("norel","implicit").choice,null);

const header="doc\tunit1_toks\tunit2_toks\tunit1_sent\tunit2_sent\t"+
 "s1_toks\ts2_toks\tdir\trel_type\torig_label";
const makeLine=({doc="GUM_news_fixture",i=1,first="The station was closed yesterday.",
 second="Engineers inspected the platform this morning.",rel="expansion.conjunction",
 type="implicit",dir="1<2",a="1-8",b="9-18"}={})=>
 [doc,a,b,first,second,a,b,dir,type,rel].join("\t");
const file=[
 header,makeLine(),makeLine({i:2,a:"20-25",b:"26-33",
  first:"The museum said visitors would return.","second":"This is not used"}),
 makeLine({i:3,a:"40-48",b:"49-55",
  first:"The forecast was for clear weather.",
  second:"A thunderstorm flooded the camp.",
  rel:"comparison.contrast"}),
 makeLine({i:4,a:"60-67",b:"68-71",
  first:"The office promised clean desks.",
  second:"The cleaners were unable to finish.",
  rel:"expansion.substitution.arg2-as-subst"})
].slice(0,2).concat([
 makeLine({a:"40-48",b:"49-55",first:"The forecast was for clear weather.",
  second:"A thunderstorm flooded the camp.",rel:"comparison.contrast"}),
 makeLine({a:"60-67",b:"68-71",first:"The office promised clean desks.",
  second:"The cleaners were unable to finish.",
  rel:"expansion.substitution.arg2-as-subst"})
]).join("\n");
const parsed=parseGdtbRels(file,"GUM_news_fixture");
assert.equal(parsed.length,3);
const extracted=candidatesFromGdtb(file,"GUM_news_fixture","news");
assert.equal(extracted.candidates.length,2);
assert.deepEqual(extracted.candidates.map(x=>x.gold),["and","but"]);
assert.equal(extracted.stats.unmapped,1);
const invalid=file.replace(/\t1<2\t/u,"\t1>2\t");
assert.equal(candidatesFromGdtb(invalid,"GUM_news_fixture","news").candidates.length,1);
assert.throws(()=>parseGdtbRels(file,"GUM_news_different"),/Document mismatch/);

const grouped={};
for(const genre of Object.keys(GENRES)){
 grouped[genre]=[];
 for(let i=0;i<32;i++){
  grouped[genre].push({
   id:genre+":"+i,document:"GUM_"+genre+"_"+(i%3),
   genre,source:"The item "+i+" was discussed. A related example followed.",
   row:i,offset:29, gold:i%6===0?"but":"and"
  });
 }
}
const selection=selectPilot(grouped);
assert.equal(selection.selected.length,250);
for(const [genre,s] of Object.entries(selection.summary)){
 assert.equal(s.sampled,25);
 assert.ok(s.but>0);
 assert.ok(s.documents>=2);
 assert.equal(selection.selected.filter(r=>r.genre===genre).length,25);
}
const args=[];
for(let i=0;i<250;i++){
 const doc="GUM_"+Object.keys(GENRES)[Math.floor(i/25)]+"_"+(i%5);
 const left="The first claim mentioned the station number "+i+".";
 const right="The next sentence explained the station number "+i+".";
 args.push({
  id:"gum-test-"+i,document:doc,genre:"news",row:i+2,
  relation:i%2?"expansion.conjunction":"comparison.contrast",
  text:left+" "+right,
  expected_boundaries:[{offset:left.length-1,choice:i%2?"and":"but"}]
 });
}
const hash=createHash("sha256").update(JSON.stringify(args.map(c=>[
 c.id,c.document,c.row,c.text,c.expected_boundaries[0].choice
]))).digest("hex");
const data={meta:{version:VERSION,sourceRevision:GUM_COMMIT,
 selectionHash:hash},cases:args};
assert.equal(pilotRows(data).length,250);
const changed=structuredClone(data);
changed.cases[0].expected_boundaries[0].choice="keep";
assert.throws(()=>pilotRows(changed),/Unmapped relation/);
const tampered=structuredClone(data);
tampered.cases[0].text+=" changed";
assert.throws(()=>pilotRows(tampered),/fingerprint mismatch/);

const confusion={
 keep:{keep:0,and:0,but:0},
 and:{keep:1,and:3,but:1},
 but:{keep:2,and:1,but:2}
};
const metrics=calculateMappedMetrics({combined:{count:10,matrix:confusion}});
assert.equal(metrics.mappedCorrect,5);
assert.equal(metrics.predictedKeepCount,3);
assert.equal(metrics.mappedAccuracy,0.5);
assert.ok(metrics.mappedMacroF1>=0&&metrics.mappedMacroF1<=1);
const bogus=structuredClone(confusion);
bogus.keep.keep=1;
assert.throws(()=>calculateMappedMetrics({combined:{count:10,matrix:bogus}}),/no KEEP/);
const preview=spawnSync(process.execPath,[
 path.join(root,"scripts/build-reader-gum-pilot.mjs"),"--help"
],{encoding:"utf8",timeout:60000});
assert.equal(preview.status,0,preview.stderr);
assert.match(preview.stdout,/--offline/);
console.log("Authentic GUM pilot: explicit mapping, 250-case selection, "+
 "original annotation preservation, rejection of KEEP gold, source hash and "+
 "confusion metrics passed. No network or model calls.");
