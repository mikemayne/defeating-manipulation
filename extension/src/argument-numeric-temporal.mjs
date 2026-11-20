// Exact, local checks on closed lists, numeric limits, and dated intervals.
// Input is data, never code or a dynamically constructed search expression.
import {parseNumber} from './argument-numeric.mjs';

const MONTHS=['january','february','march','april','may','june','july','august','september','october','november','december'];
const COUNT=/(?:\d+(?:\.\d+)?|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)/.source;
const HEDGE=/\b(?:may|might|could|possibly|perhaps|roughly|about|approximately|estimated|allegedly)\b/i;
// A calendar date such as '3 May' must not be mistaken for modal 'may'.
function isHedged(text){
 const calendarNeutral=text.replace(/\b(?:\d{1,2}\s+May|May\s+\d{1,2}|(?:in|during|throughout|until|by|on)\s+May)\b/gi,'[calendar-month]');
 return HEDGE.test(calendarNeutral);
}
const EXCEPTION=/\b(?:except|unless|another|different|separate|previously|subsequently|revised|alternative)\b/i;
function result(label,reason,details,p,c){
 return {label,reason,verified:true,chain:[
  {type:'source',text:p},{type:'goal',text:c},{type:'javascript_comparison',...details}
 ]};
}
function single(text,re){const matches=[...text.matchAll(re)];return matches.length===1?matches[0]:null;}
function clock(s){const m=/^([01]?\d|2[0-3]):([0-5]\d)$/.exec(s);return m?Number(m[1])*60+Number(m[2]):null;}

function solePlatform(p,c){
 const source=single(p,/\bplatform\s+(\d+)\s+as\s+the\s+sole\s+departure\s+platform\s+for\s+service\s+([a-z]\d+)\b/gi);
 const target=single(c,/\bservice\s+([a-z]\d+)\s+departs\s+from\s+platform\s+(\d+)\s+according\s+to\s+that\s+board\b/gi);
 if(!source||!target||!/information board\b/i.test(p)||source[2].toLowerCase()!==target[1].toLowerCase())return null;
 const value=Number(source[1]),claimed=Number(target[2]);
 if(value>10000||claimed>10000)return null;
 return result(value===claimed?'supported_conclusion':'contradictory_claims',
  'exclusive_platform_same_service',{service:source[2],only:value,claimed},p,c);
}

function soleLiftLevels(p,c){
 const source=single(p,/\blift\s+stops\s+at\s+levels?\s+(\d+(?:\s*,\s*\d+)*\s+(?:and|or)\s+\d+)\s+only\b/gi);
 const target=single(c,/\b(?:the|that|this)\s+lift\s+stops\s+at\s+level\s+(\d+)\s+according\s+to\s+that\s+plan\b/gi);
 if(!source||!target||!/building plan\b/i.test(p)||(p.match(/\blift\b/gi)||[]).length!==1)return null;
 const values=source[1].match(/\d+/g).map(Number),claimed=Number(target[1]);
 if(values.length>12||new Set(values).size!==values.length||Math.max(...values,claimed)>10000)return null;
 return result(values.includes(claimed)?'supported_conclusion':'contradictory_claims',
  'exclusive_level_list',{levels:values,claimed},p,c);
}

function allUnderWeight(p,c){
 const source=single(p,new RegExp('\\ball\\s+('+COUNT+')\\s+bags?\\s+were\\s+weighed\\s+and\\s+each\\s+was\\s+less\\s+than\\s+('+COUNT+')\\s+(kilograms?|kg)\\b','gi'));
 const target=single(c,new RegExp('\\bone\\s+of\\s+those\\s+bags?\\s+weighed\\s+more\\s+than\\s+('+COUNT+')\\s+(kilograms?|kg)\\b','gi'));
 if(!source||!target)return null;
 const count=parseNumber(source[1]),upper=parseNumber(source[2]),lower=parseNumber(target[1]);
 const unit=x=>x.toLowerCase()==='kg'?'kg':'kilogram';
 if(count===null||upper===null||lower===null||count<1||unit(source[3])!==unit(target[2]))return null;
 if(lower>=upper)return result('contradictory_claims','strict_universal_weight_bound',
  {items:count,eachBelow:upper,oneAbove:lower,unit:'kg'},p,c);
 return null; // Overlapping ranges do not establish that the claim occurred.
}

function noStaffAfter(p,c){
 const source=single(p,/\b(?:rota|schedule)\s+assigns?\s+nobody\s+to\s+the\s+([a-z-]+)\s+desk\s+after\s+(\d{1,2}:\d{2})\s+on\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi);
 const target=single(c,new RegExp('\\b('+COUNT+')\\s+([a-z-]+)\\s+staff\\s+are\\s+assigned\\s+there\\s+at\\s+(\\d{1,2}:\\d{2})\\s+on\\s+that\\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\\b','gi'));
 if(!source||!target||source[1].toLowerCase()!==target[2].toLowerCase()||source[3].toLowerCase()!==target[4].toLowerCase())return null;
 const cutoff=clock(source[2]),claimedTime=clock(target[3]),people=parseNumber(target[1]);
 if(cutoff===null||claimedTime===null||people===null||people<1||claimedTime<=cutoff)return null;
 return result('contradictory_claims','staff_rota_cutoff',
  {desk:source[1],cutoff,claimedTime,people},p,c);
}

function endedByDate(p,c){
 const source=single(p,/\b(?:the|this)\s+([a-z-]+)\s+ends?\s+on\s+(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december)\b/gi);
 const current=single(p,/\b(?:tonight|today)\s+is\s+(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december)\b/gi);
 const claim=single(c,/\b(?:the|this)\s+([a-z-]+)\s+has\s+already\s+ended\b/gi);
 if(!source||!current||!claim||source[1].toLowerCase()!==claim[1].toLowerCase()||/\b(?:next year|last year|previous year)\b/i.test(p+c))return null;
 const md=Number(source[2]),rd=Number(current[1]),mm=MONTHS.indexOf(source[3].toLowerCase()),rm=MONTHS.indexOf(current[2].toLowerCase());
 const days=[31,29,31,30,31,30,31,31,30,31,30,31];
 if(mm<0||rm<0||md<1||rd<1||md>days[mm]||rd>days[rm]||rm<mm)return null;
 if(rm>mm||rm===mm&&rd>md)return result('supported_conclusion',
  'end_date_precedes_stated_reference',{end:[md,mm+1],reference:[rd,rm+1]},p,c);
 return null;
}
export function inferNumericTemporalConstraint(premise,conclusion){
 if(typeof premise!=='string'||typeof conclusion!=='string'||!premise.trim()||!conclusion.trim()||
  premise.length>1600||conclusion.length>400||/["“”]/.test(premise+conclusion)||
  isHedged(premise+conclusion)||EXCEPTION.test(premise+conclusion))return null;
 return solePlatform(premise,conclusion)||soleLiftLevels(premise,conclusion)||
  allUnderWeight(premise,conclusion)||noStaffAfter(premise,conclusion)||
  endedByDate(premise,conclusion);
}
