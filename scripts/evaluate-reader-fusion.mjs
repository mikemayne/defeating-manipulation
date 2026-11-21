#!/usr/bin/env node
/**
 * Experimental late fusion of the two existing cached model scores.
 * ZERO model inference. Grouped five-fold CV; each scaler and softmax model is
 * fitted on the training cases only. Production code/thresholds untouched.
 *
 * node scripts/evaluate-reader-fusion.mjs
 * node scripts/evaluate-reader-fusion.mjs --max-errors 5
 *
 * Inputs, by default:
 *   evaluation/reader-join-cross-validation.json
 *   evaluation/reader-mask-infill.json
 * Output: evaluation/reader-fusion.json
 */
import {readFile,writeFile,mkdir} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const LABELS=["keep","and","but"];
const GROUPS={
 "gpt2-only":["gptQuality","gptContrast"],
 "bert-only":["bertContrast","bertHyphen","bertPeriod","bertSo"],
 "fusion":["gptQuality","gptContrast","bertContrast","bertHyphen","bertPeriod","bertSo"]
};
const DEFAULTS={
 join:path.join(root,"evaluation/reader-join-cross-validation.json"),
 mask:path.join(root,"evaluation/reader-mask-infill.json"),
 dataset:path.join(root,"evaluation/reader-strategy-synthetic-reference.json"),
 output:path.join(root,"evaluation/reader-fusion.json"),
 folds:5,seed:20261121,maxErrors:5
};
const isNumber=x=>typeof x==="number"&&Number.isFinite(x);
const percent=x=>x==null?"n/a":(x*100).toFixed(1)+"%";
const rowKey=(id,offset)=>JSON.stringify([id,offset]);
function options(argv){
 const o={...DEFAULTS};
 const files=new Map([["--join","join"],["--mask","mask"],["--dataset","dataset"],["--output","output"]]);
 const nums=new Map([["--folds","folds"],["--seed","seed"],["--max-errors","maxErrors"]]);
 for(let i=0;i<argv.length;i++){
  const key=argv[i];
  if(key==="--help"||key==="-h"){
   console.log("Usage: node scripts/evaluate-reader-fusion.mjs "+
    "[--join PATH] [--mask PATH] [--dataset PATH] [--output PATH] [--folds N] [--seed N] [--max-errors N]\n"+
    "No model download. Inputs must contain complete scored predictions. "+
    "Production thresholds unchanged.");process.exit(0);
  }
  if(!files.has(key)&&!nums.has(key))throw Error("Unknown option: "+key);
  if(++i>=argv.length)throw Error("Missing value for "+key);
  if(files.has(key))o[files.get(key)]=path.resolve(process.cwd(),argv[i]);
  else{
   const n=Number(argv[i]);
   if(!Number.isSafeInteger(n))throw Error("Invalid integer for "+key);
   o[nums.get(key)]=n;
  }
 }
 if(o.folds<2||o.folds>20||o.maxErrors<0||o.maxErrors>100)throw Error("Bad folds/max-errors");
 return o;
}
export function alignModelScores(join,mask,dataset){
 if(!Array.isArray(dataset)||!dataset.length)throw Error("Missing reference dataset");
 const sources=new Map(dataset.map(c=>[c.id,c.text]));
 if(!Array.isArray(join?.predictions)||!Array.isArray(mask?.predictions))
  throw Error("Both JSON files must have a predictions array");
 if(mask.model!=="Xenova/distilbert-base-uncased"||
    mask.templateVersion!=="masked-gap-v1")
  throw Error("Unexpected masked model/template; re-run infill benchmark");
 const maskRows=new Map();
 for(const r of mask.predictions){
  const key=rowKey(r.id,r.offset);
  if(maskRows.has(key))throw Error("Duplicate masked prediction "+key);
  maskRows.set(key,r);
 }
 const rows=[],matched=new Set(),cases=new Set();
 for(const item of join.predictions){
  if(!item||typeof item.id!=="string"||cases.has(item.id))
   throw Error("Duplicate or invalid GPT case");
  cases.add(item.id);
  const gold=new Map();
  for(const b of item.expected_boundaries||[]){
   if(gold.has(b.offset)||!LABELS.includes(b.choice))
    throw Error("Invalid GPT labels for "+item.id);
   gold.set(b.offset,b.choice);
  }
  const seen=new Set();
  for(const b of item.boundaries||[]){
   if(!gold.has(b.punctuationStart))continue;
   const key=rowKey(item.id,b.punctuationStart);
   if(seen.has(key))throw Error("Duplicate GPT boundary "+key);
   seen.add(key);
   const target=maskRows.get(key);
   if(!target)throw Error("Missing masked prediction "+key);
   if(target.source!==sources.get(item.id))
    throw Error("Masked input differs from reference dataset at "+key);
   if(target.gold!==gold.get(b.punctuationStart))
    throw Error("Different ground truth label at "+key);
   if(target.source?.[target.offset]!==b.punctuation)
    throw Error("Different source punctuation at "+key);
   const gAnd=b.candidates?.find(c=>c.id==="and")?.score;
   const gBut=b.candidates?.find(c=>c.id==="but")?.score;
   const m=target.scores;
   for(const val of [gAnd,gBut,m?.and,m?.but,m?.["-"],m?.["."],m?.so])
    if(!isNumber(val))throw Error("Nonfinite or missing model score at "+key);
   const best=Math.max(m.and,m.but);
   rows.push({
    id:item.id,offset:b.punctuationStart,gold:target.gold,
    explicit:null,
    source:target.source,
    features:{
     gptQuality:Math.max(gAnd,gBut),
     gptContrast:gBut-gAnd,
     bertContrast:m.but-m.and,
     bertHyphen:m["-"]-best,
     bertPeriod:m["."]-best,
     bertSo:m.so-best
    }
   });
   matched.add(key);
  }
  for(const keyOffset of gold.keys())if(!seen.has(rowKey(item.id,keyOffset)))
   throw Error("Unscored GPT boundary "+rowKey(item.id,keyOffset));
 }
 if(rows.length===0||maskRows.size!==matched.size)
  throw Error("The two caches have different numbers of boundaries; regenerate complete scores");
 // Explicit connector decisions use the current, pre-existing JS rules.
 // Read from the original source using only the punctuation offset.
 return rows;
}
export function assignExplicitRules(rows,findConnector){
 return rows.map(r=>({...r,explicit:findConnector(r.source,r.offset)}));
}
function shuffle(values,seed){
 let s=seed>>>0;
 const rand=()=>{s=(s+0x6D2B79F5)>>>0;let z=s;
  z=Math.imul(z^(z>>>15),z|1);z^=z+Math.imul(z^(z>>>7),z|61);
  return ((z^(z>>>14))>>>0)/4294967296;};
 const a=[...values];
 for(let i=a.length-1;i>0;i--){
  const j=Math.floor(rand()*(i+1));[a[i],a[j]]=[a[j],a[i]];
 }
 return a;
}
function metrics(rows,choose){
 const matrix=Object.fromEntries(LABELS.map(g=>
  [g,Object.fromEntries(LABELS.map(p=>[p,0]))]));
 let correct=0;
 for(const row of rows){
  const choice=choose(row);
  if(!LABELS.includes(choice))throw Error("Unknown predicted label "+choice);
  matrix[row.gold][choice]++;
  if(row.gold===choice)correct++;
 }
 const recall={};
 for(const g of LABELS){
  const total=LABELS.reduce((sum,p)=>sum+matrix[g][p],0);
  recall[g]=total?matrix[g][g]/total:null;
 }
 const present=LABELS.filter(g=>recall[g]!==null);
 return {count:rows.length,correct,accuracy:rows.length?correct/rows.length:null,
  balancedAccuracy:present.length?present.reduce((s,g)=>s+recall[g],0)/present.length:null,
  matrix,recall};
}
function makeScaler(train,keys){
 const mean=keys.map(k=>train.reduce((s,r)=>s+r.features[k],0)/train.length);
 const sd=keys.map((key,j)=>{
  const variance=train.reduce((s,r)=>s+(r.features[key]-mean[j])**2,0)/train.length;
  return Math.max(Math.sqrt(variance),0.001);
 });
 return row=>[1,...keys.map((key,j)=>Math.max(-5,Math.min(5,
  (row.features[key]-mean[j])/sd[j])))];
}
function softmax(scores){
 const top=Math.max(...scores);
 const weights=scores.map(s=>Math.exp(s-top));
 const sum=weights.reduce((a,b)=>a+b,0);
 return weights.map(x=>x/sum);
}
export function trainFusion(train,keys,{balanced=false,classWeights=null}={}){
 if(train.length<6)throw Error("Too few training rows");
 // Class weights are an optional EXPERIMENTAL loss multiplier. An omitted
 // value is exactly equivalent to the established frozen classifier.
 // Keys are explicit; model output can never supply executable weight code.
 if(classWeights!==null){
  if(!classWeights||typeof classWeights!=="object"||
   Array.isArray(classWeights)||Object.keys(classWeights).some(
    k=>!LABELS.includes(k))||
   LABELS.some(k=>!Number.isFinite(classWeights[k])||
    classWeights[k]<=0||classWeights[k]>10))
   throw Error("Invalid fixed class weights");
 }
 const scale=makeScaler(train,keys);
 const vectors=train.map(scale);
 const classes=LABELS.map(g=>train.filter(r=>r.gold===g).length);
 if(classes.some(x=>x===0))throw Error("Training fold has no examples of a class");
 const sampleWeights=train.map(r=>(balanced?
  Math.sqrt(train.length/(LABELS.length*classes[LABELS.indexOf(r.gold)])):1)*
  (classWeights?classWeights[r.gold]:1));
 const denominator=sampleWeights.reduce((s,x)=>s+x,0);
 const width=keys.length+1;
 const weights=LABELS.map(()=>new Float64Array(width));
 const learningRate=0.15,lambda=0.10;
 for(let epoch=0;epoch<650;epoch++){
  const gradient=LABELS.map(()=>new Float64Array(width));
  for(let i=0;i<train.length;i++){
   const x=vectors[i],y=LABELS.indexOf(train[i].gold);
   const p=softmax(weights.map(w=>x.reduce((s,v,j)=>s+v*w[j],0)));
   for(let k=0;k<LABELS.length;k++){
    const diff=(p[k]-(y===k?1:0))*sampleWeights[i]/denominator;
    for(let j=0;j<width;j++)gradient[k][j]+=diff*x[j];
   }
  }
  const rate=learningRate/(1+epoch/400);
  for(let k=0;k<LABELS.length;k++)for(let j=0;j<width;j++){
   const decay=j===0?0:lambda*weights[k][j];
   weights[k][j]-=rate*(gradient[k][j]+decay);
  }
 }
 return row=>{
  const x=scale(row);
  const scores=weights.map(w=>x.reduce((s,v,j)=>s+v*w[j],0));
  return LABELS[scores.indexOf(Math.max(...scores))];
 };
}
export function crossValidate(rows,{folds=5,seed=20261121,balanced=false,keys=GROUPS.fusion,explicit=true}={}){
 const ids=shuffle([...new Set(rows.map(r=>r.id))],seed);
 if(ids.length<folds)throw Error("Too few distinct cases for folds");
 const groups=Array.from({length:folds},()=>new Set());
 ids.forEach((id,i)=>groups[i%folds].add(id));
 const predictions=[],foldSummaries=[];
 for(let i=0;i<folds;i++){
  const training=rows.filter(r=>!groups[i].has(r.id));
  const test=rows.filter(r=>groups[i].has(r.id));
  const fit=explicit?training.filter(r=>!r.explicit):training;
  const model=trainFusion(fit,keys,{balanced});
  const results=test.map(row=>({
   ...row,fold:i+1,predicted:explicit&&row.explicit?row.explicit.choice:model(row)
  }));
  predictions.push(...results);
  const summary=metrics(results,r=>r.predicted);
  foldSummaries.push({fold:i+1,testCases:groups[i].size,
   testBoundaries:test.length,accuracy:summary.accuracy,
   balancedAccuracy:summary.balancedAccuracy,
   trainCases:new Set(training.map(r=>r.id)).size});
 }
 if(predictions.length!==rows.length)throw Error("Cross validation omitted rows");
 const combined=metrics(predictions,r=>r.predicted);
 return {features:keys,balanced,explicit,
  combined,folds:foldSummaries,
  errors:predictions.filter(r=>r.gold!==r.predicted)
   .map(r=>({id:r.id,offset:r.offset,fold:r.fold,gold:r.gold,
    predicted:r.predicted,features:r.features,snippet:r.source})),
  predictions:predictions.map(r=>({id:r.id,offset:r.offset,
   fold:r.fold,gold:r.gold,predicted:r.predicted}))};
}
export function publishedBaseline(rows,section){
 const predictions=section?.predictions;
 if(!Array.isArray(predictions))return null;
 const found=new Map();
 for(const p of predictions){
  const key=rowKey(p.id,p.offset);
  if(found.has(key))throw Error("Duplicate published baseline "+key);
  found.set(key,p);
 }
 if(found.size!==rows.length)return null;
 return metrics(rows,r=>{
  const p=found.get(rowKey(r.id,r.offset));
  if(!p||p.gold!==r.gold)throw Error("Baseline label mismatch at "+r.id+":"+r.offset);
  return p.predicted;
 });
}
async function main(){
 const o=options(process.argv.slice(2));
 const [join,mask,datasetJson]=await Promise.all([o.join,o.mask,o.dataset].map(p=>
  readFile(p,"utf8").then(JSON.parse)));
 const dataset=Array.isArray(datasetJson)?datasetJson:datasetJson.cases;
 const {explicitBoundaryConnector}=await import("../extension/src/reader-connector-normalisation.mjs");
 const rows=assignExplicitRules(alignModelScores(join,mask,dataset),
  (source,offset)=>explicitBoundaryConnector(source,{
   punctuationStart:offset,punctuationEnd:offset+1
  }));
 console.log("Fusion: "+new Set(rows.map(r=>r.id)).size+" cases, "+rows.length+
  " paired, labelled boundaries; zero language-model calls.");
 const gptBaseline=publishedBaseline(rows,join.ruleAssistedTwoScore);
 const bertBaseline=publishedBaseline(rows,mask.report?.results?.["-"]?.assisted);
 if(gptBaseline)console.log("Existing GPT2 + rules baseline: "+percent(gptBaseline.accuracy)+
  " accuracy, "+percent(gptBaseline.balancedAccuracy)+" balanced");
 else console.log("GPT2 baseline missing; run cross-validate-reader-joins.mjs first");
 if(bertBaseline)console.log("Existing BERT hyphen + rules: "+percent(bertBaseline.accuracy)+
  " accuracy, "+percent(bertBaseline.balancedAccuracy)+" balanced");
 else console.log("BERT baseline missing; rerun masked infill benchmark first");
 const results={};
 for(const [name,keys] of Object.entries(GROUPS)){
  for(const balanced of [false,true]){
   const label=name+(balanced?"-balanced":"");
   const cv=crossValidate(rows,{folds:o.folds,seed:o.seed,keys,balanced,explicit:true});
   results[label]=cv;
   console.log("\n"+label+": "+cv.combined.correct+"/"+cv.combined.count+
    " accuracy "+percent(cv.combined.accuracy)+
    "; balanced "+percent(cv.combined.balancedAccuracy));
   console.log("  Folds: "+cv.folds.map(f=>percent(f.accuracy)).join(", "));
   for(const g of LABELS)console.log("  "+g+": "+JSON.stringify(cv.combined.matrix[g])+
    " recall="+percent(cv.combined.recall[g]));
   for(const err of cv.errors.slice(0,o.maxErrors))
    console.log("  ERROR "+err.id+" @"+err.offset+" gold="+err.gold+
     " predicted="+err.predicted+" "+JSON.stringify(err.features));
  }
 }
 const ordered=Object.entries(results).sort((a,b)=>
  b[1].combined.balancedAccuracy-a[1].combined.balancedAccuracy);
 const report={
  description:"Exploratory 5-fold grouped regularized softmax fusion; train-only normalization; no model inference",
  caveat:"The gold labels are developer-authored synthetic examples. These model and feature choices were informed by prior performance on this same corpus; an independent unseen corpus is needed.",
  sourceFiles:{join:o.join,mask:o.mask},caseCount:new Set(rows.map(r=>r.id)).size,
  boundaryCount:rows.length,folds:o.folds,seed:o.seed,
  baselines:{gpt2:gptBaseline,bertHyphen:bertBaseline},
  results,ranking:ordered.map(([k])=>k)
 };
 await mkdir(path.dirname(o.output),{recursive:true});
 await writeFile(o.output,JSON.stringify(report,null,2)+"\n");
 console.log("\nExploratory ranking (held-out class-balanced recall): "+
  ordered.map(([name,cv])=>name+" "+percent(cv.combined.balancedAccuracy)).join(" | "));
 console.log("Saved "+o.output+"; production behaviour and thresholds unchanged.");
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
 main().catch(error=>{console.error(error?.stack||error);process.exitCode=1;});
