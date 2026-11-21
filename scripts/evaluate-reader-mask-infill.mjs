#!/usr/bin/env node
// Independent, experimental masked-language-model infill benchmark.
// No production thresholds, punctuation or original source offsets change.
// One forward pass scores all available one-token fillers at each gap.
import {readFile,writeFile,mkdir} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {extractBoundaryProbes,maskedGapPrompt,MASK_MODEL,
 MASK_TEMPLATE_VERSION,NEUTRAL_WORDS,createMaskedGapScorer}
 from "../extension/src/reader-mask-infill.mjs";
import {explicitBoundaryConnector}
 from "../extension/src/reader-connector-normalisation.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const LABELS=["keep","and","but"];
const defaults={
 dataset:path.join(root,"evaluation/reader-strategy-synthetic-reference.json"),
 output:path.join(root,"evaluation/reader-mask-infill.json"),
 scores:null,folds:5,seed:20261121,maxErrors:5,preview:false
};
function usage(){
 console.log("Usage: node scripts/evaluate-reader-mask-infill.mjs [options]\n"+
 "  --preview         Validate dataset and display sample gap prompts (no model)\n"+
 "  --scores PATH     Replay an existing completed mask-score file (no model)\n"+
 "  --dataset PATH    Input labelled cases\n"+
 "  --output PATH     Score cache/report (default evaluation/reader-mask-infill.json)\n"+
 "  --folds N         Number of grouped CV folds (default 5)\n"+
 "  --seed N          Seed (default 20261121)\n"+
 "  --max-errors N    Error examples per variant (default 5)\n"+
 "  --help            Show help\n"+
 "Compares erm, um, uh, well, anyway, hyphen (-), em dash (—), period (.)\n"+
 "as possible KEEP stand-ins. SO is reported for diagnostics but is not\n"+
 "silently relabelled to AND/BUT/KEEP.\n"+
 "Model downloads on first scoring run; scores are saved for instant replay.");
}
function parseArgs(argv){
 const o={...defaults};
 const files=new Map([["--dataset","dataset"],["--output","output"],["--scores","scores"]]);
 const nums=new Map([["--folds","folds"],["--seed","seed"],["--max-errors","maxErrors"]]);
 for(let i=0;i<argv.length;i++){
  const a=argv[i];
  if(a==="--help"||a==="-h"){usage();process.exit(0);}
  if(a==="--preview"){o.preview=true;continue;}
  if(!files.has(a)&&!nums.has(a))throw Error("Unknown argument: "+a);
  if(++i>=argv.length)throw Error("Missing value after "+a);
  if(files.has(a))o[files.get(a)]=path.resolve(process.cwd(),argv[i]);
  else {
   const n=Number(argv[i]);if(!Number.isSafeInteger(n))throw Error("Invalid "+a);
   o[nums.get(a)]=n;
  }
 }
 if(o.folds<2||o.folds>20||o.maxErrors<0||o.maxErrors>100)throw Error("Invalid fold/error count");
 return o;
}
const isNum=n=>typeof n==="number"&&Number.isFinite(n);
const pct=n=>n==null?"n/a":(n*100).toFixed(1)+"%";
function shuffled(values,seed){
 let s=seed>>>0;
 const rand=()=>{s=(s+0x6D2B79F5)>>>0;let z=s;
  z=Math.imul(z^(z>>>15),z|1);z^=z+Math.imul(z^(z>>>7),z|61);
  return ((z^(z>>>14))>>>0)/4294967296;};
 const a=[...values];
 for(let i=a.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
 return a;
}
function extractCases(cases){
 const rows=[],ids=new Set(),missing=[];
 for(const item of cases){
  if(!item||typeof item.id!=="string"||typeof item.text!=="string"||
   !Array.isArray(item.expected_boundaries)||ids.has(item.id))
   throw Error("Invalid or duplicate labelled case");
  ids.add(item.id);
  const gold=new Map();
  for(const entry of item.expected_boundaries){
   if(!Number.isSafeInteger(entry?.offset)||gold.has(entry.offset)||!LABELS.includes(entry.choice))
    throw Error("Invalid or duplicated reference boundary: "+item.id);
   gold.set(entry.offset,entry.choice);
  }
  const seen=new Set();
  for(const probe of extractBoundaryProbes(item.text,{maxPairs:8})){
   const label=gold.get(probe.punctuationStart);
   if(label===undefined)continue;
   const prompt=maskedGapPrompt(item.text,probe);
   if(!prompt){missing.push(item.id+":"+probe.punctuationStart);continue;}
   const offset=probe.punctuationStart;
   if(seen.has(offset))throw Error("Duplicated probe offset");
   seen.add(offset);
   rows.push({id:item.id,offset,gold:label,source:item.text,
    punctuation:item.text.slice(offset,probe.punctuationEnd),
    probe,prompt,explicit:explicitBoundaryConnector(item.text,probe)});
  }
  for(const offset of gold.keys())if(!seen.has(offset))missing.push(item.id+":"+offset);
 }
 if(missing.length)throw Error("Unmatched gold labels: "+missing.join(", "));
 return rows;
}
function validStored(item,row){
 return item&&item.model===MASK_MODEL&&item.templateVersion===MASK_TEMPLATE_VERSION&&
  item.source===row.source&&item.offset===row.offset&&item.gold===row.gold&&
  item.prompt===row.prompt.text&&isNum(item.scores?.and)&&isNum(item.scores?.but);
}
function snapshot(row){
 return {id:row.id,offset:row.offset,gold:row.gold,source:row.source,
  punctuation:row.punctuation,prompt:row.prompt.text,model:MASK_MODEL,
  templateVersion:MASK_TEMPLATE_VERSION,scores:row.scores};
}
async function readCache(file){
 try{
  const obj=JSON.parse(await readFile(file,"utf8"));
  return new Map((obj.predictions||[]).map(item=>[item.id+":"+item.offset,item]));
 }catch(e){if(e.code==="ENOENT")return new Map();throw e;}
}
async function writeCache(o,rows,report=null){
 await mkdir(path.dirname(o.output),{recursive:true});
 await writeFile(o.output,JSON.stringify({
  description:"Experimental masked-token infill; developer-authored synthetic labels only",
  model:MASK_MODEL,templateVersion:MASK_TEMPLATE_VERSION,
  caseCount:new Set(rows.map(r=>r.id)).size,boundaryCount:rows.length,
  predictions:rows.filter(r=>r.scores).map(snapshot),...(report?{report}:{})
 },null,2)+"\n");
}
async function scoreRows(rows,o){
 const cache=await readCache(o.scores||o.output);
 let scorer=null,reused=0,newCount=0;
 for(const row of rows){
  const prior=cache.get(row.id+":"+row.offset);
  if(validStored(prior,row)){row.scores=prior.scores;reused++;continue;}
  if(o.scores)throw Error("Missing valid cached score at "+row.id+":"+row.offset+
   "; omit --scores to calculate it.");
  if(!scorer)scorer=await createMaskedGapScorer({onStatus:console.log});
  const output=await scorer.score(row.source,row.probe);
  if(!output||!isNum(output.scores?.and)||!isNum(output.scores?.but))
   throw Error("Model failed to produce required scores at "+row.id+":"+row.offset);
  row.scores=output.scores;newCount++;
  if(newCount%10===0||newCount+reused===rows.length){
   await writeCache(o,rows);
   console.log("Scored "+newCount+" new; reused "+reused+" cached (checkpoint saved)");
  }
 }
 const fillers=NEUTRAL_WORDS.filter(w=>rows.every(r=>isNum(r.scores[w])));
 if(!fillers.length)throw Error("No neutral candidate is a valid single token for "+MASK_MODEL);
 console.log("Eligible fillers: "+fillers.join(", ")+
  "; excluded: "+NEUTRAL_WORDS.filter(w=>!fillers.includes(w)).join(", "));
 return {fillers,newCount,reused};
}
function getNeutral(row,filler){
 if(filler==="best-neutral"){
  const vals=NEUTRAL_WORDS.map(w=>row.scores[w]).filter(isNum);
  return vals.length?Math.max(...vals):null;
 }
 return row.scores[filler];
}
function predict(row,filler,{keepBias=0,butBias=0}={}){
 const neutral=getNeutral(row,filler);
 if(!isNum(neutral))throw Error("Unscored candidate "+filler);
 const scores={keep:neutral+keepBias,and:row.scores.and,but:row.scores.but+butBias};
 return LABELS.reduce((winner,label)=>
  scores[label]>scores[winner]?label:winner,"keep");
}
function metrics(rows,choose){
 const matrix=Object.fromEntries(LABELS.map(g=>[g,Object.fromEntries(LABELS.map(p=>[p,0]))]));
 let correct=0;
 for(const r of rows){
  const value=choose(r);
  matrix[r.gold][value]++;
  if(r.gold===value)correct++;
 }
 const recall={};
 for(const gold of LABELS){
  const total=LABELS.reduce((sum,p)=>sum+matrix[gold][p],0);
  recall[gold]=total?matrix[gold][gold]/total:null;
 }
 const valid=LABELS.filter(g=>recall[g]!==null);
 return {count:rows.length,correct,accuracy:rows.length?correct/rows.length:null,
  balancedAccuracy:valid.length?valid.reduce((s,g)=>s+recall[g],0)/valid.length:null,
  recall,matrix};
}
function fit(train,filler){
 let best=null;
 // The only fitted parameters are per-class logit biases. No test cases
 // enter this search; penalties favour smaller biases on an exact tie.
 for(let k=-12;k<=12;k++)for(let b=-12;b<=12;b++){
  const params={keepBias:k,butBias:b};
  const m=metrics(train,r=>predict(r,filler,params));
  const score=m.balancedAccuracy??0,penalty=Math.abs(k)+Math.abs(b);
  if(!best||score>best.score+1e-10||
   (Math.abs(score-best.score)<1e-10&&(m.accuracy>best.metric.accuracy+1e-10||
     (Math.abs(m.accuracy-best.metric.accuracy)<1e-10&&penalty<best.penalty))))
   best={score,metric:m,penalty,params};
 }
 return best.params;
}
function crossValidate(rows,o,filler,useRules){
 const ids=shuffled([...new Set(rows.map(r=>r.id))],o.seed);
 if(ids.length<o.folds)throw Error("Not enough distinct case IDs");
 const groups=Array.from({length:o.folds},()=>new Set());
 ids.forEach((id,i)=>groups[i%o.folds].add(id));
 const folds=[],all=[];
 for(let i=0;i<groups.length;i++){
  const train=rows.filter(r=>!groups[i].has(r.id));
  const test=rows.filter(r=>groups[i].has(r.id));
  const effectiveTrain=useRules?train.filter(r=>!r.explicit):train;
  if(effectiveTrain.length<3)throw Error("Too few implicit examples to fit biases");
  const params=fit(effectiveTrain,filler);
  const decide=r=>useRules&&r.explicit?r.explicit.choice:predict(r,filler,params);
  const metric=metrics(test,decide);
  folds.push({fold:i+1,parameters:params,testCases:groups[i].size,
   testBoundaries:test.length,accuracy:metric.accuracy,
   balancedAccuracy:metric.balancedAccuracy});
  all.push(...test.map(r=>({r,predicted:decide(r),fold:i+1})));
 }
 if(all.length!==rows.length)throw Error("Missing CV boundaries");
 const combined=metrics(all.map(x=>({...x.r,predicted:x.predicted})),x=>x.predicted);
 const errors=all.filter(x=>x.r.gold!==x.predicted).map(x=>({
  id:x.r.id,offset:x.r.offset,gold:x.r.gold,predicted:x.predicted,
  scores:x.r.scores,fold:x.fold,snippet:x.r.source}));
 return {filler,ruleAssisted:useRules,folds,combined,errors,
  predictions:all.map(x=>({id:x.r.id,offset:x.r.offset,
   gold:x.r.gold,predicted:x.predicted,fold:x.fold}))};
}
function printResult(cv,o){
 const c=cv.combined;
 console.log("\n"+cv.filler.toUpperCase()+(cv.ruleAssisted?" + explicit rules":"")+
  ": "+pct(c.accuracy)+" accuracy; "+pct(c.balancedAccuracy)+
  " balanced; "+c.correct+"/"+c.count+" correct");
 console.log("  Fold biases: "+cv.folds.map(f=>
  JSON.stringify(f.parameters)).join(" | "));
 for(const gold of LABELS)console.log("  "+gold+": "+
  JSON.stringify(c.matrix[gold])+" recall="+pct(c.recall[gold]));
 for(const e of cv.errors.slice(0,o.maxErrors))
  console.log("  Error "+e.id+" @"+e.offset+" "+e.gold+" => "+
   e.predicted+" "+JSON.stringify(e.scores));
}
async function main(){
 const o=parseArgs(process.argv.slice(2));
 const json=JSON.parse(await readFile(o.dataset,"utf8"));
 const cases=Array.isArray(json)?json:json.cases;
 if(!Array.isArray(cases))throw Error("Expected JSON cases array");
 const rows=extractCases(cases);
 console.log("Masked infill experiment: "+cases.length+" cases, "+rows.length+
  " labelled boundaries; gold "+
  JSON.stringify(Object.fromEntries(LABELS.map(g=>[g,rows.filter(r=>r.gold===g).length]))));
 if(o.preview){
  for(const r of rows.slice(0,6))console.log("  "+r.id+" @"+r.offset+": "+r.prompt.text);
  console.log("Preview only, no model calls or file writes.");return;
 }
 const ready=await scoreRows(rows,o);
 const results={};
 for(const filler of [...ready.fillers,"best-neutral"]){
  const raw=metrics(rows,r=>predict(r,filler));
  const plain=crossValidate(rows,o,filler,false);
  const assisted=crossValidate(rows,o,filler,true);
  console.log("\n"+filler+": raw/unfitted "+pct(raw.accuracy)+
   " (balanced "+pct(raw.balancedAccuracy)+")");
  printResult(plain,o);printResult(assisted,o);
  results[filler]={raw,plain,assisted};
 }
 const ranked=Object.entries(results).sort((a,b)=>
  b[1].assisted.combined.balancedAccuracy-a[1].assisted.combined.balancedAccuracy);
 console.log("\nExploratory ranking by held-out rule-assisted balanced accuracy:");
 ranked.forEach(([f,v],i)=>console.log("  "+(i+1)+". "+f+
  " accuracy "+pct(v.assisted.combined.accuracy)+
  ", balanced "+pct(v.assisted.combined.balancedAccuracy)));
 console.log("Reference: previous two-score plus explicit rules = 72.5% on this synthetic corpus.");
 const report={fillers:ready.fillers,excluded:NEUTRAL_WORDS.filter(w=>!ready.fillers.includes(w)),
  scoring:{newCalls:ready.newCount,reused:ready.reused},results,rankedFillers:ranked.map(x=>x[0]),
  caveat:"Exploratory comparisons on developer-authored synthetic labels, not independent validation. Filler selection on this corpus is itself model selection; confirm on fresh cases."};
 await writeCache(o,rows,report);
 console.log("Saved scores and reports: "+o.output);
 console.log("Production detector, join thresholds and source text unchanged.");
}
main().catch(e=>{console.error(e?.stack||e);process.exitCode=1;});
