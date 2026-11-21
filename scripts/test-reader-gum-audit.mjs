import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {spanAudit,range,tabulate,distribution,analyzeAudit,scoredAuditRows,SIGNALS}
 from "./audit-reader-gum-pilot.mjs";
import {candidatesFromGdtb,mapGdtbLabel}
 from "./build-reader-gum-pilot.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
assert.deepEqual(range("23-35"),{start:23,end:35});
assert.equal(range("broken"),null);
const text1="Five Panamanian players were booked in the match.";
const text2="Lukaku won the Budweiser Man of the Match award.";
const source={doc:"GUM_news_soccer",line:29,
 orig_label:"expansion.conjunction",rel_type:"implicit",
 s1_toks:"496-504",s2_toks:"505-514",
 unit1_toks:"496-504",unit2_toks:"505-514",
 unit1_sent:text1,unit2_sent:text2,
 u1_raw:text1,u2_raw:text2};
const item={id:"football",document:"GUM_news_soccer",row:29,
 tokenRanges:["496-504","505-514"],relation:"expansion.conjunction",
 text:text1+" "+text2,
 expected_boundaries:[{offset:text1.length-1,choice:"and"}]};
assert.equal(mapGdtbLabel(source.orig_label,source.rel_type).choice,"and");
const coverage=spanAudit(source,item);
assert.equal(coverage.kind,"both_whole");
assert.equal(coverage.firstUnitFraction,1);
assert.equal(coverage.secondUnitFraction,1);
const narrow=spanAudit({...source,unit1_toks:"498-504",
 unit2_toks:"505-513"},item);
assert.equal(narrow.kind,"both_partial");
assert.ok(narrow.firstUnitFraction<1);
assert.ok(narrow.secondUnitFraction<1);
assert.equal(spanAudit({...source,unit1_toks:"498-504"},item).kind,
 "first_partial");
assert.equal(spanAudit({...source,unit2_toks:"505-513"},item).kind,
 "second_partial");
assert.throws(()=>spanAudit({...source,unit1_toks:"100-200"},item),
 /outside its host/);
assert.throws(()=>spanAudit({...source,orig_label:"comparison.contrast"},item),
 /provenance/);
assert.throws(()=>spanAudit(source,{...item,text:"Changed."}),/sentence text/);
assert.throws(()=>spanAudit(source,{...item,
 expected_boundaries:[{offset:text1.length-1,choice:"but"}]}),/label mapping/);
const tab=tabulate([
 {gold:"and",predicted:"and",relation:"expansion.conjunction"},
 {gold:"and",predicted:"keep",relation:"expansion.conjunction"},
 {gold:"but",predicted:"but",relation:"comparison.contrast"}
],r=>r.relation);
assert.equal(tab["expansion.conjunction"].accuracy,0.5);
assert.equal(tab["expansion.conjunction"].predicted.keep,1);
assert.equal(tab["comparison.contrast"].accuracy,1);
assert.deepEqual(distribution([{features:{x:1}},{features:{x:3}}],"x"),
 {count:2,mean:2,median:2,min:1,max:3});
const neutral=Object.fromEntries(SIGNALS.map(k=>[k,0.25]));
const synthetic=Array.from({length:402},(_,i)=>({
 id:"synthetic"+i,gold:["keep","and","but"][i%3],
 features:{...neutral}
}));
const real=Array.from({length:250},(_,i)=>({
 id:"real"+i,gold:i%10===0?"but":"and",
 predicted:i%4===0?"keep":i%3===0?"but":"and",
 genre:i%2?"news":"fiction",relation:i%10===0?"comparison.contrast":"expansion.conjunction",
 features:{...neutral,semanticSimilarity:i/1000,bertContrast:-i/100}
}));
const byId=new Map(real.map((r,i)=>[r.id,{...coverage,
 kind:i%5===0?"first_partial":"both_whole",
 exactSentenceArguments:i%5!==0}]));
const report=analyzeAudit(real,synthetic,byId);
assert.equal(report.originalResult.total,250);
assert.equal(report.spanCoverage.wholeSentenceCount,200);
assert.equal(report.spanCoverage.partialSentenceCount,50);
assert.equal(report.byOriginalRelation["expansion.conjunction"].count,225);
assert.equal(report.byOriginalRelation["comparison.contrast"].count,25);
assert.equal(report.signals.semanticSimilarity.synthetic.median,0.25);
assert.ok(report.signals.semanticSimilarity.realWorld.median>0.1);
assert.equal(report.cases.length,250);
assert.throws(()=>analyzeAudit(real,synthetic,new Map()),/Missing original/);
assert.throws(()=>analyzeAudit(real.slice(1),synthetic,byId),/Expected complete/);

const content=[
"doc\tunit1_toks\tunit2_toks\tunit1_sent\tunit2_sent\ts1_toks\ts2_toks\tdir\trel_type\torig_label",
["GUM_news_soccer","496-504","505-514",text1,text2,
 "496-504","505-514","1<2","implicit","expansion.conjunction"].join("\t")
].join("\n");
const out=candidatesFromGdtb(content,"GUM_news_soccer","news");
assert.equal(out.candidates.length,1);
assert.equal(out.candidates[0].gold,"and");
assert.equal(out.candidates[0].relation,"expansion.conjunction");
// Exact replay from cache uses the source text/offset and unchanged prediction.
const cachedSample={
 id:"cached-sample",offset:text1.length-1,source:text1+" "+text2,
 prompt:"fixture",left:text1.slice(0,-1),right:text2,
 gold:"and",predicted:"keep",relation:"expansion.conjunction",
 challenge:"expansion.conjunction",explicit:null,
 features:{},genre:"news",document:"GUM_news_soccer",family:"GUM_news_soccer"
};
const modelResult={results:{predictions:[{id:cachedSample.id,offset:cachedSample.offset,
 gold:"and",predicted:"keep",challenge:"expansion.conjunction"}]}};
const modelLm={predictions:[{id:cachedSample.id,offset:cachedSample.offset,
 source:cachedSample.source,prompt:"fixture",scores:{
 gptAnd:-3,gptBut:-4,
 mask:{and:2,but:1,"-":0,".":0,so:1}
}}]};
const modelSemantic={predictions:[{id:cachedSample.id,offset:cachedSample.offset,
 source:cachedSample.source,
 left:cachedSample.left,right:cachedSample.right,
 signals:{similarity:0.6,
 forward:{contradiction:0.1,neutral:0.7,entailment:0.2},
 reverse:{contradiction:0.2,neutral:0.7,entailment:0.1}}
}]};
const scoredCache=scoredAuditRows([{
 id:cachedSample.id,
 text:cachedSample.source,
 expected_boundaries:[{offset:cachedSample.offset,choice:"and"}]}],
 [cachedSample],modelResult,modelLm,modelSemantic);
assert.equal(scoredCache[0].predicted,"keep");
assert.equal(scoredCache[0].features.semanticSimilarity,0.6);
assert.ok(Number.isFinite(scoredCache[0].features.lexicalJaccard));
const damaged=structuredClone(modelLm);
damaged.predictions[0].source="Different content";
assert.throws(()=>scoredAuditRows([{
 id:cachedSample.id,
 text:cachedSample.source,
 expected_boundaries:[{offset:cachedSample.offset,choice:"and"}]}],
 [cachedSample],modelResult,damaged,modelSemantic),/provenance mismatch/);

const cmd=spawnSync(process.execPath,[
 path.join(root,"scripts/audit-reader-gum-pilot.mjs"),"--help"
],{encoding:"utf8",timeout:60000});
assert.equal(cmd.status,0,cmd.stderr);
assert.match(cmd.stdout,/No model inference/);
console.log("GUM audit: authentic football AND, original argument vs sentence scope,"+
 " strict metadata checks, relation/genre summaries, feature distributions"+
 " and no-inference CLI passed.");
