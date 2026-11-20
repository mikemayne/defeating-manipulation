// Five bounded, source-grounded proof operators for quantities, completed
// prerequisites and quantified counterexamples. All source text remains DATA.
// The argument graph decides whether independent proof operators disagree.
const QUOTES=/["“”‘’]/;
const DISQUALIFY=/\b(?:except|unless|another|other|different|separate|revised|reportedly|allegedly|estimated|roughly|approximately|hypothetically|perhaps|possibly|probably|might|could|if|assuming)\b/i;
const MODAL=/\bmay\b/i;
function safe(p,c){
 if(typeof p!=='string'||typeof c!=='string'||!p.trim()||!c.trim()||
    p.length>1600||c.length>400||QUOTES.test(p+c)||DISQUALIFY.test(p+c))return false;
 // Permission in a prerequisite ('before staff may ...') isn't a hedge.
 const safePermission=p.replace(/\bbefore (?:staff|workers|operators) may\b/gi,'before staff [permission]');
 return !MODAL.test(safePermission+c);
}
function unique(text,re){const ms=[...text.matchAll(re)];return ms.length===1?ms[0]:null;}
function singular(raw){
 const v=String(raw).toLowerCase();
 if(v==='buses')return 'bus';
 if(v.endsWith('ies')&&v.length>4)return v.slice(0,-3)+'y';
 if(/(?:ches|shes|sses|xes|zes)$/.test(v))return v.slice(0,-2);
 return v.endsWith('s')&&!v.endsWith('ss')&&v.length>3?v.slice(0,-1):v;
}
function same(a,b){return String(a||'').toLowerCase().trim()===String(b||'').toLowerCase().trim();}
function count(v){const n=Number(String(v).replace(/,/g,''));return Number.isSafeInteger(n)&&n>=0&&n<=1000000000?n:null;}
function decimal(v){const n=Number(String(v));return Number.isFinite(n)&&n>=0&&n<=1000000000?n:null;}
function sentences(t){return t.split(/[.!?]+(?:\s+|$)/).map(x=>x.trim()).filter(Boolean).length;}
function proof(label,reason,details,p,c){return {label,reason,verified:true,
 chain:[{type:'source',text:p},{type:'goal',text:c},{type:'javascript_comparison',...details}]};}
const YES_VOTE=/\b(?:the\s+)?(?:completed|final|official|certified)\s+([a-z-]+(?:\s+[a-z-]+){0,3})\s+vote\s+(?:recorded|counted|reported|listed)\s+([\d,]+)\s+in\s+favo(?:u)?r\s+and\s+([\d,]+)\s+(?:opposed|against)\b/gi;
const VOTE_CLAIM=/\bmore\s+recorded\s+(?:members|voters)\s+voted\s+(in\s+favo(?:u)?r|against)\s+than\s+(in\s+favo(?:u)?r|against)\b/gi;
function voteCompare(p,c){
 const s=unique(p,YES_VOTE),t=unique(c,VOTE_CLAIM);
 if(!s||!t||sentences(p)!==1||same(t[1],t[2]))return null;
 const forCount=count(s[2]),againstCount=count(s[3]);
 if(forCount===null||againstCount===null)return null;
 const direction=t[1].toLowerCase().startsWith('in')?'for':'against';
 const matches=direction==='for'?forCount>againstCount:againstCount>forCount;
 return proof(matches?'supported_conclusion':'contradictory_claims',
  'same_recorded_vote_comparison',{body:s[1],forCount,againstCount,direction},p,c);
}
const BATCH=/\b(?:the\s+)?(?:ledger|tally|batch report|manifest)\s+(?:shows|records|lists|confirms)\s+([\d,]+)\s+([a-z-]+)\s+(received|accepted|arrived)\s+and\s+([\d,]+)\s+([a-z-]+)\s+(rejected|returned|cancelled)\s+in\s+the\s+same\s+batch\b/gi;
const DIFF_CLAIM=/\bthe\s+number\s+(received|accepted|arrived)\s+exceeds\s+the\s+number\s+(rejected|returned|cancelled)\s+by\s+([\d,]+)\b/gi;
function batchDifference(p,c){
 const s=unique(p,BATCH),t=unique(c,DIFF_CLAIM);
 if(!s||!t||sentences(p)!==1||!same(singular(s[2]),singular(s[5]))||
    !same(s[3],t[1])||!same(s[6],t[2]))return null;
 const a=count(s[1]),b=count(s[4]),d=count(t[3]);
 if(a===null||b===null||d===null)return null;
 const matches=a-b===d;
 return proof(matches?'supported_conclusion':'contradictory_claims',
   'same_batch_category_difference',{item:singular(s[2]),firstCategory:s[3],secondCategory:s[6],
   firstCount:a,secondCount:b,claimedDifference:d},p,c);
}
const WEIGHT_RULE=/\b(?:the\s+)?(?:shipping|transport|handling)\s+rule\s+sets\s+a\s+maximum\s+of\s+(\d+(?:\.\d+)?)\s+(kilograms?|kg|grams?|g)\s+for\s+each\s+([a-z-]+)\b/gi;
const WEIGHT_FACT=/\bthe\s+(?:sealed|weighed|recorded|labelled|labeled)\s+([a-z-]+)\s+on\s+(?:this|the)\s+([a-z-]+)\s+weighs\s+(\d+(?:\.\d+)?)\s+(kilograms?|kg|grams?|g)\b/gi;
const WITHIN=/\bthat\s+([a-z-]+)\s+is\s+(not\s+)?within\s+the\s+stated\s+weight\s+maximum\b/gi;
function kilogramsUnit(s){
 const v=s.toLowerCase();
 if(v==='kg'||v==='kilogram'||v==='kilograms')return 1000;
 if(v==='g'||v==='gram'||v==='grams')return 1;
 return null;
}
function shipmentWeight(p,c){
 const rule=unique(p,WEIGHT_RULE),fact=unique(p,WEIGHT_FACT),t=unique(c,WITHIN);
 if(!rule||!fact||!t||sentences(p)!==2||
    singular(rule[3])!==singular(fact[1])||singular(fact[1])!==singular(t[1]))return null;
 const max=decimal(rule[1]),observed=decimal(fact[3]),maxUnit=kilogramsUnit(rule[2]),obsUnit=kilogramsUnit(fact[4]);
 if(max===null||observed===null||maxUnit===null||obsUnit===null)return null;
 const isWithin=observed*obsUnit<=max*maxUnit;
 const claimWithin=!t[2];
 const label=isWithin===claimWithin?'supported_conclusion':'contradictory_claims';
 return proof(label,'measured_item_within_explicit_class_weight_limit',
   {subject:singular(fact[1]),document:fact[2],maxGrams:max*maxUnit,observedGrams:observed*obsUnit,claimWithin},p,c);
}
const PREREQ=/\b(?:the\s+)?(?:checklist|instructions|manual)\s+(?:requires?|specifies|states)\s+both\s+the\s+([a-z-]+)\s+and\s+([a-z-]+)\s+(switches|levers|valves|bolts|buttons)\s+to\s+be\s+(set|tightened|closed|opened|engaged)\s+before\s+(?:staff|workers|operators)\s+(?:may|can)\s+([a-z-]+(?:\s+[a-z-]+){0,4})\b/gi;
const COMPLETED=/\bthe\s+(?:operator|technician|worker|inspector|engineer|team)\s+has\s+already\s+(set|tightened|closed|opened|engaged)\s+both\s+(switches|levers|valves|bolts|buttons)(?=[.!?]|$)/gi;
const PREREQ_CLAIM=/\bthe\s+two\s+named\s+(switch|lever|valve|bolt|button)-(setting|tightening|closing|opening|engaging)\s+prerequisites\s+(?:have\s+been|are)\s+(?:met|satisfied)\b/gi;
const GERUND={set:'setting',tightened:'tightening',closed:'closing',opened:'opening',engaged:'engaging'};
function completedPrerequisites(p,c){
 const s=unique(p,PREREQ),f=unique(p,COMPLETED),t=unique(c,PREREQ_CLAIM);
 if(!s||!f||!t||sentences(p)!==2||same(s[1],s[2])||
  singular(s[3])!==singular(f[2])||singular(s[3])!==singular(t[1])||
  !same(s[4],f[1])||GERUND[s[4].toLowerCase()]!==t[2].toLowerCase())return null;
 // Exactly one named pair and exactly one unqualified assertion that
 // both of that type were completed. No outcome (e.g. safe to operate)
 // is inferred from meeting these prerequisites.
 if((p.match(/\bboth\b/gi)||[]).length!==2)return null;
 return proof('supported_conclusion','both_named_prerequisites_satisfied',
  {names:[s[1],s[2]],item:singular(s[3]),action:s[4],nextOperation:s[5]},p,c);
}
const ALL_PRED=/\b(?:every|each)\s+([a-z-]+)\s+in\s+the\s+([a-z-]+(?:\s+[a-z-]+){0,2})\s+(shipment|batch|group|consignment)\s+(was|is)\s+(labelled|labeled|marked|inspected|sealed)\s+([a-z-]+(?:\s+[a-z-]+){0,2})\s+(before\s+dispatch|at\s+receipt|on\s+arrival)\b/gi;
const EXCEPTION_CLAIM=/\b(?:one|at\s+least\s+one)\s+of\s+those\s+([a-z-]+)\s+(was|is)\s+(not\s+)?(labelled|labeled|marked|inspected|sealed)\s+([a-z-]+(?:\s+[a-z-]+){0,2})\s+(before\s+dispatch|at\s+receipt|on\s+arrival)\b/gi;
function normPredicate(s){return s.toLowerCase().replace('labeled','labelled');}
function universalCounterexample(p,c){
 const s=unique(p,ALL_PRED),t=unique(c,EXCEPTION_CLAIM);
 if(!s||!t||sentences(p)!==1||!same(singular(s[1]),singular(t[1]))||
   !same(s[4],t[2])||!same(normPredicate(s[5]),normPredicate(t[4]))||
   !same(s[6],t[5])||!same(s[7],t[6])||!t[3])return null;
 // A universal statement doesn't imply a nonempty class. Only an
 // asserted counterexample is logically inconsistent with the universal.
 return proof('contradictory_claims','universal_predicate_vs_asserted_same_group_exception',
  {class:singular(s[1]),location:s[2],group:s[3],property:s[6],time:s[7]},p,c);
}
export function inferFiniteProof(premise,conclusion){
 if(!safe(premise,conclusion))return null;
 return completedPrerequisites(premise,conclusion)||
  voteCompare(premise,conclusion)||
  batchDifference(premise,conclusion)||
  shipmentWeight(premise,conclusion)||
  universalCounterexample(premise,conclusion);
}
