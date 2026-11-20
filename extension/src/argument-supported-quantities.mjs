// Bounded, local proofs for explicit counted outcomes. Only numbers and
// their scopes present in the original statement are used.
import {parseNumber} from './argument-numeric.mjs';
const N=/(?:\d+(?:\.\d+)?|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)/.source;
const HEDGE=/\b(?:may|might|could|perhaps|possibly|approximately|roughly|about|estimated|unless|except|excluding)\b/i;
const QUOTE=/["“”‘’]/;
function proof(reason,values){return {label:'supported_conclusion',reason,source:'bounded_supported_numeric',values};}
function unique(p,re){const all=[...p.matchAll(re)];return all.length===1?all[0]:null;}
function tiedVotes(p,c){
 if(!/\bneither side won a numerical majority of the votes counted\b/i.test(c))return null;
 const match=unique(p,new RegExp('\\b('+N+')\\s+ballots?\\s+favou?red\\s+the\\s+([a-z-]+)\\s+and\\s+('+N+')\\s+opposed\\s+it\\b','gi'));
 if(!match||!/\b(?:end of counting|final tally|completed count)\b/i.test(p))return null;
 const a=parseNumber(match[1]),b=parseNumber(match[3]);
 return a!==null&&a===b?proof('equal_votes_no_numerical_majority',{for:a,against:b}):null;
}
function majorityCount(p,c){
 if(!/\bmore than half of (?:its|the) voting members supported the motion\b/i.test(c))return null;
 const total=unique(p,new RegExp('\\b(?:committee|board|panel)\\s+has\\s+('+N+')\\s+voting members\\b','gi'));
 const votes=unique(p,new RegExp('\\b('+N+')\\s+voted\\s+in\\s+favour\\s+and\\s+('+N+')\\s+against\\b','gi'));
 if(!total||!votes)return null;
 const n=parseNumber(total[1]),yes=parseNumber(votes[1]),no=parseNumber(votes[2]);
 if(![n,yes,no].every(Number.isFinite)||yes+no!==n)return null;
 return yes>n/2?proof('explicit_majority_of_exhaustive_votes',{members:n,for:yes,against:no}):null;
}
function temperatureDelta(p,c){
 const m=unique(p,/\brecorded\s+(-?\d+(?:\.\d+)?)\s*°c\s+at\s+(\d{1,2}:\d{2})\s+and\s+(-?\d+(?:\.\d+)?)\s*°c\s+at\s+(\d{1,2}:\d{2})\b/gi);
 const claim=unique(c,new RegExp('\\brecorded temperature increased by\\s+('+N+')\\s+degrees?\\s+over that hour\\b','gi'));
 if(!m||!claim||m[2]===m[4])return null;
 const start=Number(m[1]),end=Number(m[3]),reported=parseNumber(claim[1]);
 const minutes=t=>{const x=t.split(':').map(Number);return x[0]*60+x[1];};
 if(![start,end,reported].every(Number.isFinite)||minutes(m[4])-minutes(m[2])!==60)return null;
 return end>start&&Math.abs(end-start-reported)<1e-8?
  proof('recorded_temperature_delta',{start,end,change:reported}):null;
}
function freeDeliveryThreshold(p,c){
 if(!/\bthis basket qualifies for free delivery under that offer\b/i.test(c))return null;
 const rule=unique(p,/\b(?:offered|offers?|provides?)\s+free delivery on every order above £\s*(\d+(?:\.\d+)?)\b/gi);
 const price=unique(p,/\bthis basket costs £\s*(\d+(?:\.\d+)?)\b/gi);
 if(!rule||!price||/\b(?:not|no|only if|minimum|maximum)\b/i.test(p))return null;
 const min=Number(rule[1]),actual=Number(price[1]);
 return Number.isFinite(min)&&Number.isFinite(actual)&&actual>min?
  proof('stated_free_delivery_threshold_met',{threshold:min,price:actual}):null;
}
export function inferSupportedQuantities(premise,conclusion){
 if(typeof premise!=='string'||typeof conclusion!=='string'||!premise.trim()||!conclusion.trim()||
  premise.length>1600||conclusion.length>400||HEDGE.test(premise)||HEDGE.test(conclusion)||
  QUOTE.test(premise)||QUOTE.test(conclusion)||/\b(?:another|different|separate)\b/i.test(premise+' '+conclusion))return null;
 return tiedVotes(premise,conclusion)||majorityCount(premise,conclusion)||
  temperatureDelta(premise,conclusion)||freeDeliveryThreshold(premise,conclusion);
}
