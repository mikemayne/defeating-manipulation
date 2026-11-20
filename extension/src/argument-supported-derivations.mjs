// Explicit arithmetic and finite rule applications. Browser-only deterministic
// proofs: source text is never evaluated, and no inferred world facts are used.
import {parseNumber} from './argument-numeric.mjs';
const N=/(?:\d+(?:\.\d+)?|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)/.source;
const EXCEPTION=/\b(?:unless|except|other|different|another|separate|revised|estimated|roughly|about|approximately)\b/i;
const HEDGE=/\b(?:may|might|could|perhaps|possibly|probably|assuming)\b/i;
const QUOTE=/["“”‘’]/;
const BASE='supported_conclusion';
function proof(reason,p,c,details){return {label:BASE,reason,verified:true,
 chain:[{type:'premise',text:p},{type:'conclusion',text:c},{type:'javascript_proof',...details}]};}
function singular(s){
 const v=s.toLowerCase();
 return v.endsWith('ies')?v.slice(0,-3)+'y':v.endsWith('s')&&!v.endsWith('ss')?v.slice(0,-1):v;
}
function unique(text,re){const m=[...text.matchAll(re)];return m.length===1?m[0]:null;}
// A fixed base charge and a charge for EACH additional stop.
function farePerStop(p,c){
 const fare=unique(p,new RegExp('\\b(?:taxi|cab|shuttle)\\s+fare\\s+is\\s+£\\s*('+N+')\\s+plus\\s+£\\s*('+N+')\\s+for\\s+each\\s+of\\s+('+N+')\\s+extra\\s+stops?\\b','gi'));
 const stated=unique(c,new RegExp('\\b(?:this|the)\\s+(?:journey|ride|trip)\\s+costs\\s+£\\s*('+N+')\\s+before\\s+any\\s+tip\\b','gi'));
 if(!fare||!stated||/\b(?:surcharge|toll|additional fee|tax|discount)\b/i.test(p))return null;
 const base=parseNumber(fare[1]),rate=parseNumber(fare[2]),stops=parseNumber(fare[3]),total=parseNumber(stated[1]);
 if(![base,rate,stops,total].every(Number.isFinite)||Math.min(base,rate,stops)<0||stops>1000)return null;
 return Math.abs(base+rate*stops-total)<1e-8?
  proof('explicit_base_plus_per_stop_fare',p,c,{base,rate,stops,total,unit:'GBP'}):null;
}
// The source explicitly says how many of an original finite group remain.
function movedRemaining(p,c){
 const source=unique(p,new RegExp('\\b('+N+')\\s+of\\s+the\\s+('+N+')\\s+([a-z]{3,30})\\s+were\\s+moved\\s+to\\s+([a-z-]+),\\s+leaving\\s+('+N+')\\s+in\\s+the\\s+([a-z-]+(?:\\s+[a-z-]+){0,3})\\b','gi'));
 const target=unique(c,new RegExp('\\b('+N+')\\s+of\\s+the\\s+original\\s+('+N+')\\s+([a-z]{3,30})\\s+remain\\s+there\\b','gi'));
 if(!source||!target||singular(source[3])!==singular(target[3]))return null;
 const moved=parseNumber(source[1]),original=parseNumber(source[2]),left=parseNumber(source[5]),claimed=parseNumber(target[1]),claimedOriginal=parseNumber(target[2]);
 if(![moved,original,left,claimed,claimedOriginal].every(Number.isFinite)||original<=0||moved<0||
  original-moved!==left||left!==claimed||original!==claimedOriginal)return null;
 return proof('explicit_remaining_items_after_movement',p,c,{original,moved,left,item:source[3]});
}
// Two explicitly disjoint inventory categories, with ellipsis of the noun in
// the second category: "seven unused carts and three in service".
function disjointInventory(p,c){
 const source=unique(p,new RegExp('\\b(?:inventory|stocktake)\\s+(?:identifies|records|lists)\\s+('+N+')\\s+unused\\s+([a-z]{3,30})\\s+and\\s+('+N+')\\s+in\\s+service\\b','gi'));
 const target=unique(c,new RegExp('\\b(?:the|this|that)\\s+inventory\\s+accounts\\s+for\\s+('+N+')\\s+([a-z]{3,30})\\s+in\\s+total\\b','gi'));
 if(!source||!target||singular(source[2])!==singular(target[2]))return null;
 const unused=parseNumber(source[1]),service=parseNumber(source[3]),total=parseNumber(target[1]);
 if(![unused,service,total].every(Number.isFinite)||Math.min(unused,service)<0||
   unused+service!==total)return null;
 return proof('sum_of_disjoint_inventory_categories',p,c,{unused,service,total,item:source[2]});
}
// Travel time on one explicitly shared route, with a difference stated in
// minutes. Avoid extrapolating between separate trips or estimates.
function routeDuration(p,c){
 const source=unique(p,/\b(?:route|trip) planner gives a (\d+)-minute (walk|cycle) and a (\d+)-minute (bus|train|car) journey for the same trip\b/gi);
 const target=unique(c,new RegExp('\\b(?:its|the)\\s+(walking|cycling)\\s+estimate\\s+is\\s+('+N+')\\s+minutes\\s+shorter\\b','gi'));
 if(!source||!target||(source[2]==='walk'?'walking':'cycling')!==target[1].toLowerCase())return null;
 const first=Number(source[1]),second=Number(source[3]),shorter=parseNumber(target[2]);
 if(![first,second,shorter].every(Number.isFinite)||first<0||second<0||second<=first||
   second-first!==shorter)return null;
 return proof('same_trip_duration_difference',p,c,{first,second,shorter,unit:'minute'});
}
// A numeric conditional is met when the explicitly identified gauge's value
// satisfies the stated bound. This proves the condition, NOT that the device
// actually switched state or that an unstated sensor is trustworthy.
function measuredConditional(p,c){
 const rule=unique(p,new RegExp('\\bif\\s+the\\s+([a-z-]+)\\s+level\\s+drops\\s+below\\s+('+N+')\\s+(metres?|meters?|m)\\s*,\\s+the\\s+([a-z-]+)\\s+([a-z-]+)\\s+shuts\\s+down\\b','gi'));
 const reading=unique(p,new RegExp('\\bthe\\s+(?:'+ '(?:[a-z-]+)\\s+' +'?)?gauge\\s+now\\s+reads\\s+('+N+')\\s+(metres?|meters?|m)\\b','gi'));
 if(!rule||!reading||!/stated shutdown condition has been met\b/i.test(c)||
  /\b(?:other|different|unrelated|estimated|faulty)\s+gauge\b/i.test(p))return null;
 const limit=parseNumber(rule[2]),measured=parseNumber(reading[1]);
 const unit=x=>x.toLowerCase().startsWith('m')&&x.toLowerCase()!=='m'?'m':x.toLowerCase();
 if(![limit,measured].every(Number.isFinite)||unit(rule[3])!==unit(reading[2])||
  !(measured<limit))return null;
 return proof('explicit_gauge_reading_below_shutdown_threshold',p,c,
  {entity:rule[1],limit,measured,operator:'<'});
}
export function inferSupportedDerivation(premise,conclusion){
 if(typeof premise!=='string'||typeof conclusion!=='string'||!premise.trim()||!conclusion.trim()||
  premise.length>1600||conclusion.length>400||QUOTE.test(premise+conclusion)||
  EXCEPTION.test(premise+conclusion)||HEDGE.test(premise+conclusion))return null;
 return farePerStop(premise,conclusion)||movedRemaining(premise,conclusion)||
  disjointInventory(premise,conclusion)||routeDuration(premise,conclusion)||
  measuredConditional(premise,conclusion);
}
