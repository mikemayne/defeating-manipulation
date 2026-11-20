// Closed-world contradictions: zero records, explicitly excluded intervals,
// and exhaustive numbered lists. Browser-only, fixed grammar and JS checks.
//
// Source text is data: never compile a regex from a passage, eval text,
// execute a supplied formula, or infer an unstated entity/time equivalence.
const QUOTED=/["“”‘’]/;
const QUALIFIED=/\b(?:may|might|could|possibly|perhaps|probably|allegedly|reportedly|roughly|approximately|estimated|apparently|supposedly|potentially|except|unless|different|another|separate|revised|subsequently|previously)\b/i;
const DAY='(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|yesterday)';
const CLOCK='(?:[01]?\\d|2[0-3]):[0-5]\\d';
const GROUP='[a-z][a-z-]{2,28}';
const SCOPE='[a-z][a-z-]{2,28}(?:\\s+[a-z][a-z-]{2,28}){0,2}';
const REG_ZERO=new RegExp('\\b(?:the\\s+)?(?:final|official|published|completed|signed)\\s+('+SCOPE+')\\s+(register|ledger|log)\\s+(?:records?|lists?|shows?|reports?)\\s+(?:zero|0|no)\\s+('+GROUP+')\\s+on\\s+('+DAY+')\\b','gi');
const REG_POS=new RegExp('\\bat\\s+least\\s+one\\s+('+GROUP+')\\s+was\\s+(?:recorded|listed|reported)\\s+in\\s+(?:that|the)\\s+same\\s+(register|ledger|log)\\s+on\\s+('+DAY+')\\b','gi');
const REG_NO=new RegExp('\\b(?:no|zero)\\s+('+GROUP+')\\s+were\\s+(?:recorded|listed|reported)\\s+in\\s+(?:that|the)\\s+same\\s+(register|ledger|log)\\s+on\\s+('+DAY+')\\b','gi');
const INTERVAL=new RegExp('\\b(?:the\\s+)?(maintenance|service|shutdown)\\s+(notice|schedule|log)\\s+(?:specifies|states|confirms|records|says)\\s+that\\s+the\\s+('+SCOPE+')\\s+was\\s+(?:out\\s+of\\s+operation|not\\s+operating|offline|shut\\s+down)\\s+from\\s+('+CLOCK+')\\s+(?:until|to)\\s+('+CLOCK+')\\s+('+DAY+')\\b','gi');
const ACTIVE=new RegExp('\\bthe\\s+('+SCOPE+')\\s+was\\s+(?:operating|in\\s+operation|running|online|in\\s+service)\\s+at\\s+('+CLOCK+')\\s+('+DAY+')\\s+under\\s+that\\s+same\\s+(maintenance|service|shutdown)\\s+(?:notice|schedule|log)\\b','gi');
const EXCLUSIVE=new RegExp('\\b(?:the\\s+)?(?:current|official|published|final|signed)\\s+('+SCOPE+')\\s+(schedule|plan|register|list)\\s+(?:lists|identifies|names|records)\\s+(\\d{1,4})\\s+and\\s+(\\d{1,4})\\s+as\\s+the\\s+only\\s+numbered\\s+('+GROUP+')\\s+available\\s+for\\s+(?:the|this)\\s+('+SCOPE+')\\b','gi');
const LIST_CLAIM=new RegExp('\\bnumbered\\s+('+GROUP+')\\s+(\\d{1,4})\\s+is\\s+(?:also\\s+)?available\\s+for\\s+(?:that|the|this)\\s+('+SCOPE+')\\s+under\\s+(?:that|the)\\s+same\\s+(schedule|plan|register|list)\\b','gi');

function single(t,regex){const a=[...t.matchAll(regex)];return a.length===1?a[0]:null;}
function same(a,b){return typeof a==='string'&&typeof b==='string'&&a.trim().toLowerCase()===b.trim().toLowerCase();}
function singular(s) {
 const x=s.toLowerCase();
 if(x==='buses')return 'bus';
 if(x.endsWith('ies')&&x.length>4)return x.slice(0,-3)+'y';
 if(x.endsWith('ches')||x.endsWith('shes')||x.endsWith('sses')||x.endsWith('xes')||x.endsWith('zes'))return x.slice(0,-2);
 if(x.endsWith('s')&&!x.endsWith('ss')&&x.length>3)return x.slice(0,-1);
 return x;
}
function result(label,reason,data,p,c){
 return {label,reason,verified:true,chain:[
  {type:'source',text:p},{type:'goal',text:c},{type:'javascript_proof',...data}
 ]};
}
function time(s){
 const m=/^(\d{1,2}):(\d{2})$/.exec(s);
 if(!m)return null;
 const h=Number(m[1]),min=Number(m[2]);
 return h<24&&min<60?h*60+min:null;
}
function zeroRegister(p,c){
 const source=single(p,REG_ZERO),positive=single(c,REG_POS),negative=positive?null:single(c,REG_NO);
 const claim=positive||negative;
 if(!source||!claim||!same(source[2],claim[2])||!same(source[4],claim[3])||
  singular(source[3])!==singular(claim[1]))return null;
 // Anaphoric "same" is allowed only with a single named register/ledger/log.
 if([...p.matchAll(/\b(?:register|ledger|log)\b/gi)].length!==1)return null;
 return result(positive?'contradictory_claims':'supported_conclusion',
  'closed_register_zero_vs_quantified_observation',
  {register:source[1]+' '+source[2],group:singular(source[3]),day:source[4],claim:positive?'at_least_one':'zero'},p,c);
}
function unavailableDuringInterval(p,c){
 const source=single(p,INTERVAL),claim=single(c,ACTIVE);
 if(!source||!claim||!same(source[1],claim[4])||!same(source[3],claim[1])||
  !same(source[6],claim[3]))return null;
 const start=time(source[4]),end=time(source[5]),at=time(claim[2]);
 if(start===null||end===null||at===null||end<=start||!(start<at&&at<end))return null;
 // If contradictory operational status is also recorded in the premises,
 // this source is internally inconsistent: don't choose a favoured sentence.
 if(/\b(?:was|is|became)\s+(?:operating|online|running)\s+at\b/i.test(p))return null;
 return result('contradictory_claims','operating_during_explicit_shutdown_window',
  {subject:source[3],startMinute:start,endMinute:end,claimedMinute:at,day:source[6],source:source[1]+' '+source[2]},p,c);
}
function exhaustiveNumberedList(p,c){
 const source=single(p,EXCLUSIVE),claim=single(c,LIST_CLAIM);
 if(!source||!claim||!same(source[2],claim[4])||!same(source[6],claim[3])||
  singular(source[5])!==singular(claim[1]))return null;
 const a=Number(source[3]),b=Number(source[4]),v=Number(claim[2]);
 if(![a,b,v].every(Number.isSafeInteger)||a===b)return null;
 // Explicitly "only numbered" makes list membership a complete finite
 // set. For every other kind of partial or conditional list, abstain.
 const included=v===a||v===b;
 return result(included?'supported_conclusion':'contradictory_claims',
  'closed_numbered_set_membership',
  {source:source[1]+' '+source[2],itemType:singular(source[5]),context:source[6],allowed:[a,b],claimed:v},p,c);
}
export function inferClosedScopeRelation(premise,conclusion){
 if(typeof premise!=='string'||typeof conclusion!=='string'||!premise.trim()||!conclusion.trim()||
  premise.length>1600||conclusion.length>400||QUOTED.test(premise+conclusion)||
  QUALIFIED.test(premise+conclusion)||/\b(?:if|assuming|provided that)\b/i.test(premise+conclusion))return null;
 return zeroRegister(premise,conclusion)||
  unavailableDuringInterval(premise,conclusion)||
  exhaustiveNumberedList(premise,conclusion);
}
