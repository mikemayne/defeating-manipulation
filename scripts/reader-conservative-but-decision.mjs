/**
 * Conservative BUT gate for *experimental* three-class reader softmax.
 *
 * KEEP remains the predicted class when its score is highest. Connected
 * statements default to AND, and BUT requires BOTH high relative softmax
 * score and sufficient separation from competing labels. Borderline top
 * BUT is an advisory only, not an accusation and not a fourth gold class.
 *
 * Normalized softmax scores are NOT calibrated probabilities of truth.
 * No live browser extension logic is changed by this module.
 */
export const VERSION="reader-conservative-but-gate-v1";
export const POLICIES=Object.freeze([
 Object.freeze({id:"argmax",minButScore:0,minButMargin:0}),
 Object.freeze({id:"low",minButScore:0.40,minButMargin:0.05}),
 Object.freeze({id:"moderate",minButScore:0.50,minButMargin:0.10}),
 Object.freeze({id:"cautious",minButScore:0.60,minButMargin:0.15}),
 Object.freeze({id:"strict",minButScore:0.70,minButMargin:0.20}),
 Object.freeze({id:"very-strict",minButScore:0.80,minButMargin:0.25})
]);
const LABELS=Object.freeze(["keep","and","but"]);
const valid=x=>typeof x==="number"&&Number.isFinite(x);

/**
 * This remains deterministic for any input score triplet, including ties.
 * Ties favour KEEP (when KEEP tied for max), then AND; NEVER BUT.
 */
export function conservativeButDecision(prob,{
 minButScore=0.60,minButMargin=0.15
}={}){
 if(!prob||typeof prob!=="object"||
  LABELS.some(key=>!valid(prob[key])||prob[key]<0||prob[key]>1)||
  Math.abs(LABELS.reduce((s,k)=>s+prob[k],0)-1)>1e-6)
  throw Error("Expected three finite normalized class scores");
 if(!valid(minButScore)||minButScore<0||minButScore>1||
  !valid(minButMargin)||minButMargin<0||minButMargin>1)
  throw Error("Invalid conservative BUT gate thresholds");
 const keep=prob.keep,and=prob.and,but=prob.but;
 const margin=but-Math.max(and,keep);
 if(keep>=and&&keep>=but)
  return {choice:"keep",advisory:null,butScore:but,butMargin:margin};
 if(and>=but)
  return {choice:"and",advisory:null,butScore:but,butMargin:margin};
 if(but>=minButScore&&margin>=minButMargin)
  return {choice:"but",advisory:null,butScore:but,butMargin:margin};
 return {
  choice:"and",advisory:"deserves_scrutiny",butScore:but,butMargin:margin
 };
}

/**
 * Score ranking on human annotated AND/BUT only; this says nothing about
 * true KEEP performance or how reliable softmax values are in the wild.
 */
export function separationMetrics(rows){
 if(!Array.isArray(rows)||!rows.length||
  rows.some(x=>!["and","but"].includes(x.gold)||
   !valid(x.butScore)||x.butScore<0||x.butScore>1))
  throw Error("Real annotated AND/BUT rows with finite scores required");
 const and=rows.filter(x=>x.gold==="and").map(x=>x.butScore);
 const but=rows.filter(x=>x.gold==="but").map(x=>x.butScore);
 if(!and.length||!but.length)throw Error("Both classes required");
 let wins=0;
 for(const b of but)for(const a of and)
  wins+=b>a?1:b===a?0.5:0;
 const ordered=[...rows].sort((a,b)=>b.butScore-a.butScore||
  a.id.localeCompare(b.id));
 // Average precision: handle tied scores by giving all rows with an
 // identical score the same precision/recall increment. This avoids
 // ordering-dependent AP values.
 let trueBut=0,rank=0,area=0;
 while(rank<ordered.length){
  let end=rank+1;
  while(end<ordered.length&&ordered[end].butScore===ordered[rank].butScore)end++;
  const added=ordered.slice(rank,end).filter(x=>x.gold==="but").length;
  trueBut+=added;area+=(added/but.length)*(trueBut/end);
  rank=end;
 }
 return {rocAuc:wins/(but.length*and.length),averagePrecision:area,
  positives:but.length,negatives:and.length,prevalence:but.length/rows.length};
}

export function scoreButOutcomes(rows){
 if(!Array.isArray(rows)||!rows.length)throw Error("No predicted rows");
 const cm={and:{and:0,but:0,keep:0},but:{and:0,but:0,keep:0}};
 let scrutinize=0,correct=0;
 for(const r of rows){
  if(!["and","but"].includes(r.gold)||!LABELS.includes(r.predicted)||
   ![null,"deserves_scrutiny"].includes(r.advisory))
   throw Error("Invalid gold, decision or advisory");
  cm[r.gold][r.predicted]++;
  if(r.gold===r.predicted)correct++;
  if(r.advisory==="deserves_scrutiny")scrutinize++;
 }
 const trueBut=cm.but.but,falseBut=cm.and.but;
 const predictedBut=trueBut+falseBut;
 const goldBut=cm.but.but+cm.but.and+cm.but.keep;
 const goldAnd=cm.and.and+cm.and.but+cm.and.keep;
 const precision=predictedBut?trueBut/predictedBut:null;
 const recall=goldBut?trueBut/goldBut:null;
 return {
  count:rows.length,accuracy:correct/rows.length,
  balancedRecall:(cm.and.and/goldAnd+recall)/2,
  andRecall:cm.and.and/goldAnd,butRecall:recall,
  butPrecision:precision,
  butF1:precision===null||precision+recall===0?null:
   2*precision*recall/(precision+recall),
  falseBut,falseButRate:falseBut/goldAnd,
  trueBut,predictedBut,advisoryCount:scrutinize,
  predictedKeep:cm.and.keep+cm.but.keep,
  goldSupport:{and:goldAnd,but:goldBut},
  confusion:cm
 };
}
