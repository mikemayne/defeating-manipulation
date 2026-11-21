// Two neural scores per boundary: AND and BUT. KEEP is a deterministic
// abstention when neither is convincing. Raw causal LM log scores are NOT
// calibrated probabilities; thresholds must be validated with reference labels.
export const DEFAULT_JOIN_THRESHOLDS=Object.freeze({
 minScore:-3.5,minMargin:0.2
});
const VALID_LABELS=new Set(["keep","and","but"]);

export function validateJoinThresholds(input=DEFAULT_JOIN_THRESHOLDS){
 const minScore=Number(input?.minScore),minMargin=Number(input?.minMargin);
 if(!Number.isFinite(minScore)||minScore>0||minScore< -20||
    !Number.isFinite(minMargin)||minMargin<0||minMargin>5)
  throw Error("Join thresholds must use a score from -20 to 0 and a margin from 0 to 5");
 return {minScore,minMargin};
}
export function selectJoin(options,thresholds=DEFAULT_JOIN_THRESHOLDS){
 const {minScore,minMargin}=validateJoinThresholds(thresholds);
 const and=options.find(x=>x.id==="and"),but=options.find(x=>x.id==="but");
 const a=and?.score,b=but?.score;
 const available=Number.isFinite(a)&&Number.isFinite(b);
 const best=available?(a>=b?and:but):null;
 const runner=available?(a>=b?but:and):null;
 const margin=best?best.score-runner.score:null;
 const accepted=!!best&&best.score>=minScore&&margin>=minMargin;
 return {
  choice:accepted?best.id:"keep",
  uncertain:!accepted,
  leadingModelChoice:best?.id??null,
  topModelScore:best?.score??null,
  margin,
  thresholds:{minScore,minMargin},
  // With no KEEP model score, this only means a supported join was not found.
  keepIsDefault:true
 };
}
function confusion(rows,thresholds){
 let correct=0,counts={},hits={},predictions={};
 for(const row of rows){
  const label=row.label;
  const predicted=selectJoin(row.candidates,thresholds).choice;
  counts[label]=(counts[label]||0)+1;
  if(predicted===label){correct++;hits[label]=(hits[label]||0)+1;}
  predictions[predicted]=(predictions[predicted]||0)+1;
 }
 const groups=Object.keys(counts);
 const balancedAccuracy=groups.length?
  groups.reduce((sum,key)=>sum+(hits[key]||0)/counts[key],0)/groups.length:0;
 return {cases:rows.length,correct,
  accuracy:rows.length?correct/rows.length:null,
  balancedAccuracy,
  byGold:counts,byPrediction:predictions};
}
function splitByCase(rows){
 const ids=[...new Set(rows.map(x=>x.id))];
 const trainIDs=new Set(),holdoutIDs=new Set();
 for(let i=0;i<ids.length;i++){
  // Every fifth case reserved for the unseen holdout. Boundary pairs from
  // the same paragraph must never appear in both partitions.
  if(i%5===0)holdoutIDs.add(ids[i]);else trainIDs.add(ids[i]);
 }
 return {
  train:rows.filter(r=>trainIDs.has(r.id)),
  holdout:rows.filter(r=>holdoutIDs.has(r.id))
 };
}
export function labelledJoinScores(predictions,{strategy="context"}={}){
 const rows=[];
 for(const item of predictions||[]){
  const labels=new Map((item.expected_boundaries||[])
   .map(x=>[x.offset,x.choice]));
  for(const boundary of item.boundaries||[]){
   const label=labels.get(boundary.punctuationStart);
   if(!VALID_LABELS.has(label))continue;
   const candidates=strategy==="progressive"
    ?boundary.progressive?.candidates
    :boundary.context?.candidates||boundary.candidates;
   if(!Array.isArray(candidates))continue;
   const a=candidates.find(x=>x.id==="and")?.score;
   const b=candidates.find(x=>x.id==="but")?.score;
   if(!Number.isFinite(a)||!Number.isFinite(b))continue;
   rows.push({id:item.id,offset:boundary.punctuationStart,
    label,candidates:[{id:"and",score:a},{id:"but",score:b}]});
  }
 }
 return rows;
}
export function fitJoinThresholds(predictions,{strategy="context"}={}){
 const rows=labelledJoinScores(predictions,{strategy});
 const allLabels=new Set(rows.map(x=>x.label));
 const {train,holdout}=splitByCase(rows);
 if(rows.length<24||train.length<15||holdout.length<4||
    allLabels.size<2||new Set(train.map(x=>x.label)).size<2){
  return {available:false,reason:"Need at least 24 scored reference boundaries with two or more choices, across enough distinct cases",
   labels:rows.length,holdoutLabels:holdout.length};
 }
 // Exhaustive finite grid on saved scores: no model calls, no new model.
 // Objective uses class-balanced recall to avoid a trivial always-KEEP
 // predictor winning simply because KEEP dominates the data.
 let best=null;
 for(let minScore=-6;minScore<=-1;minScore+=.25){
  for(let step=0;step<=20;step++){
   const t={minScore,minMargin:Number((step*.05).toFixed(3))};
   const metric=confusion(train,t);
   const selection={thresholds:t,metric};
   if(!best||metric.balancedAccuracy>best.metric.balancedAccuracy+1e-9||
      (Math.abs(metric.balancedAccuracy-best.metric.balancedAccuracy)<1e-9&&
       (metric.accuracy>best.metric.accuracy+1e-9||
        (Math.abs(metric.accuracy-best.metric.accuracy)<1e-9&&
         t.minMargin>best.thresholds.minMargin)))){
    best=selection;
   }
  }
 }
 const baseline=validateJoinThresholds(DEFAULT_JOIN_THRESHOLDS);
 return {
  available:true,
  labels:rows.length,
  objective:"macro_class_recall_on_training_cases",
  thresholdGrid:"minScore -6..-1 step .25; minMargin 0..1 step .05",
  fitted:best.thresholds,
  train:best.metric,
  holdout:confusion(holdout,best.thresholds),
  defaultHoldout:confusion(holdout,baseline),
  trainCases:new Set(train.map(x=>x.id)).size,
  holdoutCases:new Set(holdout.map(x=>x.id)).size,
  note:"Developer-authored labels are not evidence of real human-reader agreement. Progressive decisions require a fresh run after changing thresholds."
 };
}
