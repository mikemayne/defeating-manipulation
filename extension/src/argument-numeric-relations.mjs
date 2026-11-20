// Source-grounded typed numeric relations. JavaScript owns arithmetic;
// heterogeneous metrics, explicit different scopes and uncertain values abstain.
import {parseNumber} from './argument-numeric.mjs';

const NUM=String.raw`(?:\d[\d,]*(?:\.\d+)?|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[- ](?:one|two|three|four|five|six|seven|eight|nine|hundred|thousand))?`;
const MONTH=String.raw`(?:January|February|March|April|May|June|July|August|September|October|November|December)`;
const NRE=new RegExp(`^${NUM}$`,'i');
const HEDGE=/\b(?:may|might|could|probably|perhaps|possibly|suggests?|apparently|assuming|about|roughly|approximately|estimated|likely)\b/i;
function hedged(s){return HEDGE.test(s.replace(/\b(?:in|during|for|by|before|until)\s+May\b/g,''));}
const EXCEPTION=/\b(?:unless|except|excluding|in addition to|excluding|not including|at least|at most|up to|over|under)\b/i;
const QUOTES=/["“”]/;
const MONEY=String.raw`(?:£|\$|€)`;
const UNIT=String.raw`(?:items?|packages?|people|persons?|ballots?|votes?|tickets?|requests?|cases?|units?|deliveries?|visitors?|points?|entries?|vehicles?|widgets?|books?|hours?|minutes?|miles?|metres?|litres?|kg|grams?|tonnes?|%|percent)`;
const TOPICS=new Set('the a an in this that those these of for on by from to were was has have had is are and but its their our my your which same one each both according said shows says lists reported at recorded final exact all only'.split(' '));
function norm(s){return String(s||'').toLowerCase().replace(/[’]/g,"'").replace(/[^a-z0-9-]/g,' ').replace(/\s+/g,' ').trim();}
function singular(s){return s.endsWith('ies')?s.slice(0,-3)+'y':s.endsWith('s')&&!s.endsWith('ss')&&s.length>3?s.slice(0,-1):s;}
function tokens(s){return norm(s).split(' ').map(singular).filter(x=>x&&!TOPICS.has(x));}
function relation(label,reason,details,premise,conclusion){return {label,reason,verified:true,
 chain:[{type:'premise',text:premise},{type:'conclusion',text:conclusion},{type:'javascript_comparison',...details}]};}
function count(s){return NRE.test(s.trim())?parseNumber(s.trim()):null;}
function sameItem(a,b){
 const x=tokens(a),y=tokens(b);return x.length>0&&y.length>0&&x.some(t=>t.length>3&&y.includes(t));
}
function compareResult(known,claimed,reason,p,c,detail){
 if(!Number.isFinite(known)||!Number.isFinite(claimed))return null;
 return relation(known===claimed?'supported_conclusion':'contradictory_claims',reason,
  {actual:known,claimed,...detail},p,c);
}
function qtyWithMetric(p,c){
 // An exact total is explicit even if subgroup observations also appear.
 // Do not invent exhaustiveness from a mere partial list.
 const total=new RegExp(`\\b(?:exactly|a total of|total of)\\s+(${NUM})\\s+([a-z][a-z-]{2,24})\\b`,'i').exec(p)
  ||new RegExp(`\\b(${NUM})\\s+([a-z][a-z-]{2,24})\\s+(?:in all|altogether|in total)\\b`,'i').exec(p);
 if(!total)return null;
 const m=new RegExp(`\\b(?:total(?:\\s+number)?\\s+of\\s+)?([a-z][a-z-]{2,24})\\s+(?:was|were|is|are|amounts? to|numbered|totalled|totaled|contains?|included?)\\s+(${NUM})\\b`,'i').exec(c)
  ||new RegExp(`\\b(?:contains?|holds?|account(?:s|ed)? for)\\s+(?:exactly\\s+)?(${NUM})\\s+([a-z][a-z-]{2,24})\\b`,'i').exec(c);
 if(!m)return null;
 let requestedLabel,requestedN;
 if(/^(?:contains?|holds?|account)/i.test(m[0])){requestedN=m[1];requestedLabel=m[2];}
 else {requestedN=m[2];requestedLabel=m[1];}
 const a=count(total[1]),b=count(requestedN);
 if(a===null||b===null||singular(total[2].toLowerCase())!==singular(requestedLabel.toLowerCase()))return null;
 return compareResult(a,b,'explicit_complete_total',p,c,{subject:singular(total[2]),operation:'exact_total'});
}
function labelledMetricObservations(p){
 const found=[];
 // Counts of the SAME measured quantity labelled by a time period.
 const re=new RegExp(`\\b(${NUM})\\s+((?:[a-z][a-z-]+\\s+){0,2}[a-z][a-z-]+)\\s+(?:in|during|for)\\s+(${MONTH})\\b`,'gi');
 for(const m of p.matchAll(re)){
  const v=count(m[1]);if(v===null)continue;
  found.push({value:v,metric:tokens(m[2]).join(' '),label:norm(m[3]),span:m.index});
 }
 if(found.length===1){
  // Ellipsis in a single explicitly coordinated comparison: "20 widgets in
  // March and 24 in April" shares the same stated measure, not a guessed one.
  const anchor=found[0];
  const tail=p.slice(anchor.span).match(new RegExp(`\\b(${NUM})\\s+((?:[a-z][a-z-]+\\s+){0,2}[a-z][a-z-]+)\\s+in\\s+(${MONTH})\\s+(?:,?\\s*and|versus|vs\\.)\\s+(${NUM})\\s+in\\s+(${MONTH})\\b`,'i'));
  if(tail){const missing=count(tail[4]);if(missing!==null&&norm(tail[3])===anchor.label){
   found.push({value:missing,metric:anchor.metric,label:norm(tail[5]),span:anchor.span+tail.index});
  }}
 }
 return found;
}
function compareDateLabels(p,c){
 const facts=labelledMetricObservations(p);
 // Only one explicitly coordinated reporting context: no silent aggregation
 // across unrelated actors or separate reporting sentences.
 if(facts.length===2){
  const between=p.slice(facts[0].span, facts[1].span);
  if(/[.!?;]/.test(between)||/\b(?:and|while|but|whereas)\s+(?:[A-Z][a-z]+\s+){1,3}(?:sold|shipped|counted|reported|recorded|registered)\b/.test(between))return null;
 }
 if(facts.length!==2 || facts[0].label===facts[1].label ||
  !facts[0].metric||facts[0].metric!==facts[1].metric)return null;
 const claim=new RegExp(`\\b(fewer|less|more|greater|higher|lower)\\s+(?:${UNIT}\\s+)?(?:were\\s+)?(?:[a-z-]+\\s+){0,3}(?:in|during|for)\\s+(${MONTH})\\s+than\\s+(?:in|during|for)\\s+(${MONTH})\\b`,'i').exec(c)
 || new RegExp(`\\b(?:(${MONTH})\\s+had\\s+)?(fewer|less|more|greater|higher|lower)\\s+(?:${UNIT}\\s+)?(?:[a-z-]+\\s+){0,3}than\\s+(?:in|during|for)\\s+(${MONTH})\\b`,'i').exec(c);
 if(!claim)return null;
 const word=claim[1].toLowerCase();
 const first=norm(claim[2]),second=norm(claim[3]);
 const f=new Map(facts.map(x=>[x.label,x]));
 if(!f.has(first)||!f.has(second)||first===second)return null;
 const less=/^(?:fewer|less|lower)$/.test(word),more=/^(?:more|greater|higher)$/.test(word);
 if(!less&&!more)return null;
 const v1=f.get(first).value,v2=f.get(second).value;
 const valid=less?v1<v2:v1>v2;
 return relation(valid?'supported_conclusion':'contradictory_claims','labelled_same_metric_comparison',
  {metric:facts[0].metric,first,second,values:[v1,v2],operation:less?'<':'>'},p,c);
}
function labelledMoney(p){
 const out=[];
 const re=new RegExp(`\\b((?:total\\s+)?[a-z][a-z-]{2,28})\\s+(?:of|at|was|were|is|are|totalled|totaled)\\s+(${MONEY})\\s*(${NUM})\\b`,'gi');
 for(const m of p.matchAll(re)){
  const n=count(m[3]);if(n===null)continue;
  let metric=tokens(m[1]).join(' ');
  // Explicit category headed by noun; modifiers such as 'total' are not part of the measure.
  metric=metric.replace(/^total\s+/,'');
  out.push({metric,value:Math.round(n*100),unit:m[2]});
 }
 return out;
}
function compareMoneyCategories(p,c){
 const values=labelledMoney(p);
 if(values.length!==2||values[0].metric===values[1].metric||values[0].unit!==values[1].unit)return null;
 // Only compare two specific categories named in both premise and conclusion.
 const rel=/\b([a-z][a-z-]{2,28})\s+(?:exceeded|exceeds|outweighed|was higher than|were higher than|was less than|were less than|was lower than|were lower than)\s+([a-z][a-z-]{2,28})\b/i.exec(c);
 if(!rel)return null;
 const left=singular(rel[1].toLowerCase()),right=singular(rel[2].toLowerCase());
 const a=values.find(x=>x.metric===left),b=values.find(x=>x.metric===right);
 if(!a||!b)return null;
 const lower=/\b(?:less than|lower than)\b/i.test(rel[0]);
 const trueRelation=lower?a.value<b.value:a.value>b.value;
 return relation(trueRelation?'supported_conclusion':'contradictory_claims',
  'same_statement_category_amount_comparison',
  {left,right,amounts:[a.value,b.value],unit:a.unit,operation:lower?'<':'>'},p,c);
}
function measuredInterval(p,c){
 const re=new RegExp(`\\b(?:range|interval|band|limits?|accepted values?)\\s+(?:is|are|was|were|of|from|between)\\s+(${NUM})\\s+(?:to|and|[-–])\\s+(${NUM})\\b`,'i');
 const bound=re.exec(p);
 if(!bound)return null;
 const low=count(bound[1]),high=count(bound[2]);
 if(low===null||high===null||low>=high)return null;
 const firstPart=p.slice(0,bound.index),lastPart=p.slice(bound.index+bound[0].length);
 const nums=[...p.matchAll(new RegExp(`\\b(?:is|was|at|of|read(?:s)?|recorded|measured|showed)\\s+(${NUM})\\b`,'gi'))]
  .filter(m=>m.index<bound.index||m.index>bound.index+bound[0].length).map(m=>count(m[1])).filter(Number.isFinite);
 if(nums.length!==1)return null;
 const value=nums[0];
 if(!/\b(?:sample|reading|measurement|test|result|value|level|score|ph)\b/i.test(p)||
  !/\b(?:sample|reading|measurement|value|result|level|score)\b/i.test(c))return null;
 const dir=/\b(below|above|within|inside|outside)\s+(?:the|that|this|stated|acceptable|allowed)?\s*(?:range|interval|band|limit)\b/i.exec(c);
 if(!dir)return null;
 const claimed=dir[1].toLowerCase();
 const actual=claimed==='below'?value<low:claimed==='above'?value>high:
  claimed==='within'||claimed==='inside'?value>=low&&value<=high:value<low||value>high;
 return relation(actual?'supported_conclusion':'contradictory_claims','measured_value_against_stated_interval',
  {value,low,high,claim:claimed},p,c);
}
// Explicit finite constraints: no guess about exhaustive lists or hidden units.
function explicitNumericLimits(p,c){
 if(/\b(?:except|excluding|other|different|separate|another|roughly|approximately|about|estimated|at least|at most)\b/i.test(p+c))return null;
 // Claims must name the same container and counted object. An unqualified
 // number is not exhaustive; the label/manifest and "exactly" establish it.
 const contain=/\b(?:this|the|same)\s+([a-z][a-z-]{2,24})\s+contains?\s+(?:exactly\s+)?([\w-]+)\s+(?:(?:identical|standard|ordinary)\s+)?([a-z][a-z-]{2,24})\b/i;
 const a=contain.exec(p),b=contain.exec(c);
 if(a&&b&&singular(a[1].toLowerCase())===singular(b[1].toLowerCase())&&
    singular(a[3].toLowerCase())===singular(b[3].toLowerCase())&&
    /\b(?:label|inventory|manifest|register|exactly|total)\b/i.test(p)&&
    /\b(?:exactly|according to that|according to the)\b/i.test(c)){
  const av=count(a[2]),bv=count(b[2]);
  if(av!==null&&bv!==null)return compareResult(av,bv,'same_container_explicit_count',p,c,{container:a[1],item:a[3]});
 }
 // A stated lowest seat number excludes an asserted smaller seat number.
 const lowest=/\blowest\s+(?:seat\s+)?number\s+(?:is|was)\s+([\w-]+)\b/i.exec(p);
 const numbered=/\b(seat)\s+numbered\s+(minus\s+[\w-]+|[\w-]+)\b/i.exec(c);
 if(lowest&&numbered&&/\b(?:every|all)\s+seats?\b/i.test(p)&&sameItem(p,c)){
  const min=count(lowest[1]),claimed=parseNumber(numbered[2]);
  if(min!==null&&claimed!==null&&claimed<min)
   return relation('contradictory_claims','number_below_explicit_minimum',
    {minimum:min,claimed,operator:'<'},p,c);
 }
 // An explicit universal upper bound cannot coexist with an observed
 // higher score in that same group.
 const noAbove=/\bnot\s+a\s+single\s+([a-z][a-z-]{2,24})\s+scored\s+above\s+([\w-]+)\b/i.exec(p);
 const asserted=/\b(?:one|several|some|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+([a-z][a-z-]{2,24})\s+scored\s+([\w-]+)\b/i.exec(c);
 if(noAbove&&asserted&&singular(noAbove[1].toLowerCase())===singular(asserted[1].toLowerCase())){
  const max=count(noAbove[2]),actual=count(asserted[2]);
  if(max!==null&&actual!==null&&actual>max)
   return relation('contradictory_claims','score_exceeds_explicit_exclusion',
    {maximum:max,claimed:actual,operator:'>'},p,c);
 }
 // A source expressly stating a complete inventory sum can be compared
 // against a conclusion claiming a different total of that inventory.
 const total=/\bmaking\s+([\w-]+)\s+in\s+all\b/i.exec(p);
 const claim=/\bthere\s+(?:were|are)\s+([\w-]+)\s+([a-z][a-z-]{2,24})\s+in\s+(?:that|the|this)\s+(inventory)\b/i.exec(c);
 if(total&&claim&&/\binventory\b/i.test(p)&&sameItem(p,c)&&
    p.toLowerCase().includes(singular(claim[2].toLowerCase()))){
  const actual=count(total[1]),claimed=count(claim[1]);
  if(actual!==null&&claimed!==null)
   return compareResult(actual,claimed,'explicit_inventory_total',p,c,{item:claim[2]});
 }
 return null;
}
export function extractTypedNumericalFacts(text){
 if(typeof text!=='string'||text.length>1600)return [];
 return [...labelledMetricObservations(text).map(x=>({type:'metric_by_period',...x})),
  ...labelledMoney(text).map(x=>({type:'monetary_category',...x}))].slice(0,12);
}
export function inferTypedNumericRelation(premise,conclusion){
 if(typeof premise!=='string'||typeof conclusion!=='string'||premise.length>1600||conclusion.length>400||
  QUOTES.test(premise)||QUOTES.test(conclusion)||hedged(premise)||hedged(conclusion)||
  EXCEPTION.test(premise))return null;
 return qtyWithMetric(premise,conclusion)||compareMoneyCategories(premise,conclusion)||
  compareDateLabels(premise,conclusion)||measuredInterval(premise,conclusion)||
  explicitNumericLimits(premise,conclusion);
}