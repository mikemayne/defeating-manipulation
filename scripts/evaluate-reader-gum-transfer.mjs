#!/usr/bin/env node
/**
 * Transfer experiment: train the same balanced linear classifier on
 * (A) 402 labelled synthetic examples alone, or
 * (B) those SAME 402 + NEW GUM authentic AND/BUT annotations.
 * Test only on never-inspected GUM source documents, disjoint from
 * both the 250-case pilot and training/review documents.
 *
 * IMPORTANT: held-out GUM includes AND/BUT only. KEEP recall is unknown.
 * This is a first fixed experiment, not a tuned production model.
 *
 * node scripts/build-reader-gum-transfer.mjs
 * node scripts/evaluate-reader-gum-transfer.mjs --preview
 * node scripts/evaluate-reader-gum-transfer.mjs --max-errors 5
 * node scripts/evaluate-reader-gum-transfer.mjs --offline
 */
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {createHash} from "node:crypto";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {generateHoldout} from "./build-reader-holdout-v1.mjs";
import {makeHoldoutRows,heldoutFeatures} from "./evaluate-reader-holdout-v1.mjs";
import {alignModelScores,assignExplicitRules,trainFusion}
 from "./evaluate-reader-fusion.mjs";
import {originalProbeRows,attachPriorHoldoutScores,signalCacheFingerprint,
 obtainSemanticSignals,addSemanticFeatures}
 from "./evaluate-reader-semantic-fusion.mjs";
import {attachLexicalFeatures} from "./evaluate-reader-nonlinear-fusion.mjs";
import {scoreLanguageModels}
 from "./evaluate-reader-holdout-v2.mjs";
import {ABLATIONS,evaluatePredictions}
 from "./evaluate-reader-gum-ablations.mjs";
import {GENRES,GUM_COMMIT}
 from "./build-reader-gum-pilot.mjs";
import {VERSION as TRANSFER_VERSION}
 from "./build-reader-gum-transfer.mjs";
import {extractBoundaryProbes,buildBoundaryChoices}
 from "../extension/src/reader-boundary-scorer.mjs";
import {maskedGapPrompt}
 from "../extension/src/reader-mask-infill.mjs";
import {sentencePair}
 from "../extension/src/reader-semantic-signals.mjs";
import {explicitBoundaryConnector}
 from "../extension/src/reader-connector-normalisation.mjs";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const file=n=>path.join(ROOT,"evaluation",n);
export const VERSION="reader-authentic-transfer-eval-v1";
const KEYS={
 "full":ABLATIONS.baseline,
 "minus-period-and-hyphen":ABLATIONS["minus-bertPeriod-bertHyphen"],
 "minus-bert-punctuation":ABLATIONS["minus-all-bert-punctuation"]
};
const OPTIONS={
 corpus:file("reader-gum-transfer-v1.json"),
 oldJoin:file("reader-join-cross-validation.json"),
 oldMask:file("reader-mask-infill.json"),
 oldDataset:file("reader-strategy-synthetic-reference.json"),
 v1Scores:file("reader-holdout-v1-scores.json"),
 previousSemantic:file("reader-semantic-pair-scores.json"),
 trainLm:file("reader-gum-transfer-train-lm-v1.json"),
 trainSem:file("reader-gum-transfer-train-sem-v1.json"),
 testLm:file("reader-gum-transfer-test-lm-v1.json"),
 testSem:file("reader-gum-transfer-test-sem-v1.json"),
 output:file("reader-gum-transfer-results-v1.json"),
 preview:false,offline:false,maxErrors:5
};
const pct=x=>x==null?"n/a":(100*x).toFixed(1)+"%";
const sha=x=>createHash("sha256").update(x).digest("hex");
const identity=r=>JSON.stringify([r.id,r.offset]);
async function json(file){return JSON.parse(await readFile(file,"utf8"));}
function options(args){
 const o={...OPTIONS};
 const paths=new Map(Object.keys(OPTIONS).filter(k=>
  !["preview","offline","maxErrors"].includes(k))
  .map(k=>["--"+k.replace(/[A-Z]/g,x=>"-"+x.toLowerCase()),k]));
 for(let i=0;i<args.length;i++){
  const a=args[i];
  if(a==="--help"||a==="-h"){
   console.log("node scripts/evaluate-reader-gum-transfer.mjs"+
    " [--preview] [--offline] [--max-errors N]\n"+
    "Authentic GUM train/test split. Scores are cached in NEW local files.");
   process.exit(0);
  }
  if(a==="--preview"||a==="--offline"){o[a.slice(2)]=true;continue;}
  if(a==="--max-errors"){
   if(++i>=args.length)throw Error("Missing --max-errors number");
   o.maxErrors=Number(args[i]);continue;
  }
  if(!paths.has(a))throw Error("Unknown option "+a);
  if(++i>=args.length)throw Error("Missing path for "+a);
  o[paths.get(a)]=path.resolve(process.cwd(),args[i]);
 }
 if(!Number.isSafeInteger(o.maxErrors)||o.maxErrors<0||o.maxErrors>100)
  throw Error("Invalid error count");
 return o;
}
export function verifyTransferCorpus(data){
 if(data?.meta?.version!==TRANSFER_VERSION||
  data.meta.sourceRevision!==GUM_COMMIT||
  !Array.isArray(data.train)||!Array.isArray(data.test))
  throw Error("Expected pinned authentic GUM transfer corpus");
 const keys=new Set(),trainDocs=new Set(),testDocs=new Set();
 const oldDocs=new Set(Object.entries(GENRES).flatMap(([genre,docs])=>
  docs.map(name=>"GUM_"+genre+"_"+name)));
 for(const [role,cases,docs] of [
  ["train",data.train,trainDocs],["test",data.test,testDocs]
 ]){
  if(cases.length < (role==="train"?100:60))
   throw Error("Not enough "+role+" relationships");
  for(const c of cases){
   if(!c.id||keys.has(c.id)||oldDocs.has(c.document)||
    !["and","but"].includes(c.expected_boundaries?.[0]?.choice)||
    c.expected_boundaries.length!==1||
    c.text?.[c.expected_boundaries[0].offset]!==".")
    throw Error("Invalid, duplicate, or previously tested "+role+" example: "+c.id);
   keys.add(c.id);docs.add(c.document);
  }
 }
 for(const d of trainDocs)if(testDocs.has(d))
  throw Error("Source-document overlap between train/test: "+d);
 if(data.meta.docCounts?.train!==36||
    data.meta.docCounts?.test!==24||data.meta.docCounts?.review!==12)
   throw Error("Pinned manifest reserved-document counts changed");
 // Some reserved documents have no valid implicit full-sentence GDTB
 // relations. Count only contributing docs here; never invent examples.
 if(trainDocs.size<20||testDocs.size<14)
   throw Error("Too few contributing train/test documents: "+
    trainDocs.size+"/"+testDocs.size);
 const hash=sha(JSON.stringify(["train","test"].map(role=>
  data[role].map(c=>[c.id,c.document,c.row,c.text,c.expected_boundaries[0].choice]))));
 if(hash!==data.meta.selectionHash)throw Error("Training/test frozen fingerprint mismatch");
 return {trainDocuments:trainDocs,testDocuments:testDocs};
}
export function transferRows(cases){
 const rows=[];
 for(const c of cases){
  const {offset,choice}=c.expected_boundaries[0];
  const probes=extractBoundaryProbes(c.text,{maxPairs:12});
  const probe=probes.find(p=>p.punctuationStart===offset);
  if(!probe)throw Error("GUM transfer boundary lost: "+c.id);
  const choices=buildBoundaryChoices(c.text,probe);
  const mask=maskedGapPrompt(c.text,probe);
  if(!mask||choices.length!==2)
   throw Error("GUM transfer cannot make LM prompt: "+c.id);
  const {left,right}=sentencePair(c.text,probe);
  rows.push({
   id:c.id,offset,gold:choice,document:c.document,
   genre:c.genre,domain:c.genre,relation:c.relation,
   challenge:c.relation,source:c.text,
   family:c.document,probe,choices,prompt:mask.text,
   left,right,explicit:explicitBoundaryConnector(c.text,probe)
  });
 }
 if(new Set(rows.map(identity)).size!==rows.length)
  throw Error("Transfer has duplicate ID/offset");
 return rows;
}
export function compareAuthenticTraining(synthetic,realTrain,test){
 if(synthetic.length!==402||realTrain.length<100||test.length<60)
  throw Error("Missing training or held-out data");
 const trainDocs=new Set(realTrain.map(r=>r.document));
 const testDocs=new Set(test.map(r=>r.document));
 for(const doc of testDocs)if(trainDocs.has(doc))
  throw Error("Train/test document leakage: "+doc);
 const result={};
 for(const [name,keys] of Object.entries(KEYS)){
  const base=trainFusion(synthetic.filter(x=>!x.explicit),keys,{balanced:true});
  const augmented=trainFusion([...synthetic,...realTrain].filter(x=>!x.explicit),
   keys,{balanced:true});
  const a=evaluatePredictions(test,base),b=evaluatePredictions(test,augmented);
  const originalById=new Map(a.predictions.map(x=>[x.id,x]));
  let recovered=0,regressed=0,changed=0;
  for(const p of b.predictions){
   const old=originalById.get(p.id);
   if(!old||old.gold!==p.gold)throw Error("Holdout label mismatch "+p.id);
   if(old.predicted!==p.predicted)changed++;
   if(old.predicted!==p.gold&&p.predicted===p.gold)recovered++;
   if(old.predicted===p.gold&&p.predicted!==p.gold)regressed++;
  }
  result[name]={
   featureKeys:keys,
   syntheticOnly:a,
   syntheticPlusAuthentic:b,
   paired:{recovered,regressed,net:recovered-regressed,changed}
  };
 }
 return result;
}
function addFeatures(rows){return attachLexicalFeatures(addSemanticFeatures(rows.map(heldoutFeatures)));}
async function syntheticTraining(o){
 const [join,mask,source,v1]=await Promise.all([
  o.oldJoin,o.oldMask,o.oldDataset,o.v1Scores
 ].map(json));
 const originalCases=Array.isArray(source)?source:source.cases;
 const first=originalProbeRows(originalCases,
  assignExplicitRules(alignModelScores(join,mask,originalCases),
   (text,offset)=>explicitBoundaryConnector(text,{
    punctuationStart:offset,punctuationEnd:offset+1})));
 const v1Cases=generateHoldout().cases;
 const second=attachPriorHoldoutScores(makeHoldoutRows(v1Cases),v1,v1Cases);
 const rows=[...first,...second];
 if(rows.length!==402)throw Error("Original 402-case development set changed");
 for(const row of rows){
  const pair=sentencePair(row.source,row.probe);
  row.left=pair.left;row.right=pair.right;
 }
 await obtainSemanticSignals(rows,{
  file:o.previousSemantic,fingerprint:signalCacheFingerprint(rows),
  readOnly:true,log:()=>{},
  createScorer:()=>{throw Error("Previous synthetic cache required");}
 });
 return attachLexicalFeatures(addSemanticFeatures(rows));
}
async function scoreBatch(rows,{lmPath,semPath,offline,hash}){
 const {createMaskedGapScorer}=await import("../extension/src/reader-mask-infill.mjs");
 const {createBoundaryLanguageScorer}=await import("../extension/src/reader-language-model.mjs");
 const lmDigest=sha(JSON.stringify([VERSION,hash,
  rows.map(r=>[r.id,r.offset,r.source,r.prompt])]));
 await scoreLanguageModels(rows,{file:lmPath,digest:lmDigest,offline,
  createMask:createMaskedGapScorer,createGPT:createBoundaryLanguageScorer});
 const semantic=await obtainSemanticSignals(rows,{file:semPath,
  fingerprint:signalCacheFingerprint(rows),readOnly:offline});
 const [lm,sem]=await Promise.all([json(lmPath),json(semPath)]);
 if(lm.digest!==lmDigest||sem.corpusFingerprint!==signalCacheFingerprint(rows))
  throw Error("Saved training/held-out score cache metadata mismatch");
 const cachedLm=new Map(lm.predictions.map(x=>[identity(x),x]));
 const cachedSem=new Map(sem.predictions.map(x=>[identity(x),x]));
 if(cachedLm.size!==rows.length||cachedSem.size!==rows.length)
  throw Error("Cached training/held-out row count mismatch");
 for(const row of rows){
  const lmRow=cachedLm.get(identity(row)),semanticRow=cachedSem.get(identity(row));
  if(!lmRow||!semanticRow||lmRow.source!==row.source||
   lmRow.prompt!==row.prompt||semanticRow.source!==row.source||
   semanticRow.left!==row.left||semanticRow.right!==row.right)
   throw Error("Input-dependent cached model score provenance mismatch: "+row.id);
  row.scores=lmRow.scores;
  row.semantic=semanticRow.signals;
 }
 return {rows:addFeatures(rows),cache:{semantic}};
}
async function main(){
 const o=options(process.argv.slice(2));
 const corpus=await json(o.corpus);
 const documents=verifyTransferCorpus(corpus);
 const train=transferRows(corpus.train),test=transferRows(corpus.test);
 console.log("AUTHENTIC-TRAINING GUM PILOT: 402 synthetic + "+train.length+
  " authentic train relationships; "+test.length+
  " unseen GUM holdout relationships");
 console.log("Contributing train docs "+documents.trainDocuments.size+
  "/36 reserved; held-out docs "+documents.testDocuments.size+
  "/24 reserved; unchanged human GDTB AND/BUT mappings.");
 console.log("Holdout labels: AND "+test.filter(x=>x.gold==="and").length+
  ", BUT "+test.filter(x=>x.gold==="but").length+
  ", KEEP 0 (NOT TESTED).");
 if(o.preview){
  console.log("Preview: distinct source docs, exact boundary offsets and prompts validated.");
  console.log("No inference; no benchmark outcome inspected.");return;
 }
 const synthetic=await syntheticTraining(o);
 console.log("Using existing 402-case synthetic training scores.");
 const authentic=await scoreBatch(train,{
  lmPath:o.trainLm,semPath:o.trainSem,offline:o.offline,
  hash:corpus.meta.selectionHash+"|train"
 });
 console.log("Authentic training LM/semantic signals ready.");
 const holdout=await scoreBatch(test,{
  lmPath:o.testLm,semPath:o.testSem,offline:o.offline,
  hash:corpus.meta.selectionHash+"|test"
 });
 console.log("Document-disjoint held-out LM/semantic signals ready.");
 const comparisons=compareAuthenticTraining(synthetic,authentic.rows,holdout.rows);
 for(const [name,x] of Object.entries(comparisons)){
  const a=x.syntheticOnly,b=x.syntheticPlusAuthentic;
  console.log("\n"+name);
  console.log("  Synthetic-only: "+a.correct+"/"+a.count+" = "+pct(a.accuracy)+
   " | AND "+pct(a.recall.and)+", BUT "+pct(a.recall.but)+
   ", predicted KEEP "+a.predicted.keep);
  console.log("  + authentic GUM: "+b.correct+"/"+b.count+" = "+pct(b.accuracy)+
   " | AND "+pct(b.recall.and)+", BUT "+pct(b.recall.but)+
   ", predicted KEEP "+b.predicted.keep);
  console.log("  Paired recovery "+x.paired.recovered+", regressions "+
   x.paired.regressed+", net "+x.paired.net);
  for(const p of b.predictions.filter(p=>p.predicted!==p.gold)
    .slice(0,o.maxErrors)){
   const item=corpus.test.find(c=>c.id===p.id);
   console.log("  ERROR "+p.id+" "+p.gold+" -> "+p.predicted+
    " ["+item.document+", "+item.relation+"] "+item.text);
  }
 }
 const result={
  version:VERSION,
  sourceRevision:GUM_COMMIT,
  sourceSelection:corpus.meta.selectionHash,
  trainDocuments:documents.trainDocuments.size,
  testDocuments:documents.testDocuments.size,
  syntheticTraining:402,authenticTraining:authentic.rows.length,
  authenticTesting:holdout.rows.length,
  classSupport:corpus.meta.classCounts,
  constraints:"Only original GDTB mapped AND/BUT relations in authentic data, no authenticated KEEP. No model tuned on this held-out split. User review queue remains unused.",
  sourceRights:"All source text and generated model results are local gitignored files. Inspect source-specific licences before redistribution.",
  comparisons
 };
 await mkdir(path.dirname(o.output),{recursive:true});
 await writeFile(o.output,JSON.stringify(result,null,2)+"\n");
 console.log("\nSaved "+o.output+" (local; not committed).");
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
 main().catch(e=>{console.error(e?.stack||e);process.exitCode=1;});
