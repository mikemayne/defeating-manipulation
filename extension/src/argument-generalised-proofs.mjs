// Generalised, bounded premise-to-conclusion proofs. Untrusted passages
// are DATA: no eval, no dynamic code or patterns assembled from source text.
// An abstention is safer than guessing what a referent or measurement means.
const QUOTED=/["“”‘’]/;
const UNSAFE=/\b(?:unless|except|another|other|different|separate|revised|hypothetical|allegedly|reportedly|might|could|perhaps|possibly|probably|estimated|approximately|roughly)\b/i;
const MONTHS=['january','february','march','april','may','june','july','august','september','october','november','december'];
const MONTH_PART=MONTHS.join('|');
const UNITS='cm|mm|kg|centimetres?|centimeters?|millimetres?|millimeters?|metres?|meters?|kilograms?|degrees?';
const RULE_MARKED=/\ball\s+([a-z-]{3,30})\s+(?:marked|labelled|labeled)\s+([a-z-]{3,25})\s+(?:require|must undergo)\s+(?:a|an)\s+([a-z-]+(?:\s+[a-z-]+){0,3})(?=[.!?]|$)/gi;
const FACT_MARKED=/\bthe\s+([a-z-]{3,30})\s+assigned\s+to\s+([a-z-]{2,25})\s+is\s+(?:also\s+|additionally\s+)?(?:marked|labelled|labeled)\s+([a-z-]{3,25})\b/gi;
const CLAIM_MARKED=/\bthe\s+([a-z-]{3,30})\s+assigned\s+to\s+([a-z-]{2,25})\s+(?:requires|must undergo)\s+(?:a|an)\s+([a-z-]+(?:\s+[a-z-]+){0,3})(?=\s+under\s+that\s+rule\b|[.!?]|$)/gi;
const THRESHOLD=new RegExp('\\bthe\\s+([a-z-]+(?:\\s+[a-z-]+){0,2})\\s+(?:activates|engages|sounds|triggers)\\s+if\\s+the\\s+([a-z-]+(?:\\s+[a-z-]+){0,2})\\s+reads\\s+(below|under|above|over)\\s+(\\d+(?:\\.\\d+)?)\\s+('+UNITS+')\\b','gi');
const READING=new RegExp('\\bthe\\s+([a-z-]+(?:\\s+[a-z-]+){0,2})\\s+(?:currently|now)\\s+reads\\s+(\\d+(?:\\.\\d+)?)\\s+('+UNITS+')\\b','gi');
const CLAIM_THRESHOLD=/\b(?:the|this)\s+(?:numeric|stated|measured)\s+condition\s+for\s+the\s+([a-z-]+(?:\s+[a-z-]+){0,2})\s+has\s+been\s+(?:met|satisfied)\b/gi;
const TRAVEL=/\bfor the same (?:trip|journey|route)(?: to (?:the )?[a-z-]+(?:\s+[a-z-]+){0,3})?,\s+the\s+(?:[a-z-]+\s+){0,2}(?:planner|schedule|timetable)\s+(?:lists|gives|records)\s+(?:a|an)\s+(\d+)-minute\s+(walk|cycle|drive)\s+and\s+(?:a|an)\s+(\d+)-minute\s+(bus|train|car|taxi)\s+(?:ride|journey|trip)\b/gi;
const CLAIM_TRAVEL=/\bthe\s+(walking|cycling|driving)\s+estimate\s+is\s+(\d+)\s+minutes?\s+(shorter|longer)\s+than\s+the\s+(bus|train|car|taxi)\s+estimate\b/gi;
const DATE_SOURCE=new RegExp('\\b(?:the|this)\\s+([a-z-]+(?:\\s+[a-z-]+){0,2})\\s+(?:log|register|schedule|record)\\s+(?:places|records|lists|notes)\\s+the\\s+([a-z-]+(?:\\s+[a-z-]+){0,2}?)\\s+on\\s+(\\d{1,2})\\s+('+MONTH_PART+')\\s+(\\d{4})\\s+and\\s+the\\s+([a-z-]+(?:\\s+[a-z-]+){0,2}?)\\s+on\\s+(\\d{1,2})\\s+('+MONTH_PART+')\\s+(\\d{4})\\b','gi');
const CLAIM_DATE=/\bthe\s+([a-z-]+(?:\s+[a-z-]+){0,2}?)\s+date\s+falls\s+(after|before)\s+the\s+stated\s+([a-z-]+(?:\s+[a-z-]+){0,2}?)\s+date\b/gi;

function one(text,re){const matches=[...text.matchAll(re)];return matches.length===1?matches[0]:null;}
function same(a,b){return typeof a==='string'&&typeof b==='string'&&a.toLowerCase().trim()===b.toLowerCase().trim();}
function singular(s){const t=s.toLowerCase();return t.endsWith('ies')?t.slice(0,-3)+'y':t.endsWith('s')&&!t.endsWith('ss')?t.slice(0,-1):t;}
function integer(s){const n=Number(s);return Number.isSafeInteger(n)&&n>=0&&n<=100000?n:null;}
function number(s){const n=Number(s);return Number.isFinite(n)&&n>=0&&n<=100000?n:null;}
function unit(s){
 const t=s.toLowerCase();
 if(['centimetre','centimetres','centimeter','centimeters','cm'].includes(t))return 'cm';
 if(['millimetre','millimetres','millimeter','millimeters','mm'].includes(t))return 'mm';
 if(['kilogram','kilograms','kg'].includes(t))return 'kg';
 if(['metre','metres','meter','meters'].includes(t))return 'm';
 if(['degree','degrees'].includes(t))return 'degrees';
 return null;
}
function verified(reason,details,p,c,label='supported_conclusion'){
 return {label,reason,verified:true,chain:[
  {type:'source',text:p},{type:'goal',text:c},{type:'javascript_proof',...details}
 ]};
}
function markedMember(p,c){
 const rule=one(p,RULE_MARKED),fact=one(p,FACT_MARKED),claim=one(c,CLAIM_MARKED);
 if(!rule||!fact||!claim||!same(singular(rule[1]),singular(fact[1]))||
  !same(fact[1],claim[1])||!same(fact[2],claim[2])||
  !same(rule[2],fact[3])||!same(rule[3],claim[3]))return null;
 // Reject a second claim about this assignee's marking, even if the
 // first matching rule happens to look consistent with the goal.
 if([...p.matchAll(FACT_MARKED)].length!==1)return null;
 return verified('universal_marked_member_obligation',
  {class:singular(rule[1]),identifier:fact[2],mark:rule[2],obligation:rule[3]},p,c);
}
function numericTrigger(p,c){
 const rule=one(p,THRESHOLD),reading=one(p,READING),claim=one(c,CLAIM_THRESHOLD);
 if(!rule||!reading||!claim||!same(rule[1],claim[1])||!same(rule[2],reading[1]))return null;
 const bound=number(rule[4]),measured=number(reading[2]);
 if(bound===null||measured===null||unit(rule[5])===null||unit(rule[5])!==unit(reading[3]))return null;
 const op=rule[3].toLowerCase(),trueCondition=(op==='below'||op==='under')?measured<bound:measured>bound;
 // A true antecedent establishes the condition. It does not establish
 // a downstream physical outcome such as the device actually activating.
 if(!trueCondition)return null;
 return verified('measured_numeric_condition_met',
  {instrument:rule[2],trigger:rule[1],operator:op,bound,measured,unit:unit(rule[5])},p,c);
}
function sameJourney(p,c){
 const trip=one(p,TRAVEL),claim=one(c,CLAIM_TRAVEL);
 if(!trip||!claim)return null;
 const roles={walk:'walking',cycle:'cycling',drive:'driving'};
 if(!same(roles[trip[2].toLowerCase()],claim[1])||!same(trip[4],claim[4]))return null;
 const first=integer(trip[1]),second=integer(trip[3]),delta=integer(claim[2]);
 if(first===null||second===null||delta===null)return null;
 const direction=claim[3].toLowerCase();
 if((direction==='shorter'&&second-first!==delta)||
   (direction==='longer'&&first-second!==delta))return null;
 if(delta===0)return null;
 return verified('same_journey_duration_arithmetic',
  {firstMode:trip[2],secondMode:trip[4],firstMinutes:first,secondMinutes:second,claimedDifference:delta,direction},p,c);
}
function cleanEvent(s){return s.toLowerCase().replace(/\s+date$/,'').trim();}
function dayOrdinal(day,month,year){
 const n=integer(day),y=integer(year),m=MONTHS.indexOf(month.toLowerCase());
 if(n===null||n<1||y===null||y<1000||y>9999||m<0)return null;
 const utc=Date.UTC(y,m,n),date=new Date(utc);
 if(date.getUTCFullYear()!==y||date.getUTCMonth()!==m||date.getUTCDate()!==n)return null;
 return utc/86400000;
}
function datedSequence(p,c){
 const source=one(p,DATE_SOURCE),claim=one(c,CLAIM_DATE);
 if(!source||!claim)return null;
 const eventA=cleanEvent(source[2]),eventB=cleanEvent(source[6]);
 if(!eventA||!eventB||eventA===eventB||
   !same(eventB,cleanEvent(claim[1]))||!same(eventA,cleanEvent(claim[3])))return null;
 const first=dayOrdinal(source[3],source[4],source[5]),second=dayOrdinal(source[7],source[8],source[9]);
 if(first===null||second===null||first===second)return null;
 const order=claim[2].toLowerCase(),ok=order==='after'?second>first:second<first;
 // Both values are precise dates for the same named events. The opposite
 // comparison is itself inconsistent with those explicitly anchored dates.
 return verified('named_event_date_order',
  {record:source[1],firstEvent:eventA,secondEvent:eventB,firstDay:first,secondDay:second,relation:order},
  p,c,ok?'supported_conclusion':'contradictory_claims');
}
function uncertain(text){
 // May is a calendar month when it occurs in a date; elsewhere it is a
 // modal hedge and disqualifies a deterministic proof.
 const masked=text.replace(/\b\d{1,2}\s+may\s+\d{4}\b/gi,'[date]');
 return /\bmay\b/i.test(masked)||UNSAFE.test(masked);
}
export function inferGeneralisedPremiseProof(premise,conclusion){
 if(typeof premise!=='string'||typeof conclusion!=='string'||
  premise.length>1600||conclusion.length>400||!premise.trim()||!conclusion.trim()||
  QUOTED.test(premise+conclusion)||uncertain(premise+conclusion))return null;
 return markedMember(premise,conclusion)||numericTrigger(premise,conclusion)||
  sameJourney(premise,conclusion)||datedSequence(premise,conclusion);
}
