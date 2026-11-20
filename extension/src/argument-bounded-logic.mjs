import {inferSupportedQuantities} from './argument-supported-quantities.mjs';
// Conservative logic on a single paragraph's stated premises and conclusion.
// Exact, mechanically checkable relations only; neither world truth nor intent.
// All checks use local text and leave source offsets untouched.

const HEDGED = /\b(?:may|might|possibly|perhaps|probably|apparently|could)\b/i;
const SAME_TOPIC = /\b(?:votes?|ballot|tally|count|results?|candidate|responses?|feedback|survey|members?|wards?|train|discount|meeting|session|event|water|price.cap|ingredient|curry|parcel|shipment|delivery|refund|notice|record|post|seat|ticket)\b/i;

function parseNumber(words) {
 if (typeof words !== 'string') return null;
 const s = words.trim().toLowerCase().replace(/,/g,'');
 if (/^\d+(?:\.\d+)?$/.test(s)) return Number(s);
 const unit={zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,
 eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,
 twenty:20,thirty:30,forty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90};
 const pieces=s.replace(/-/g,' ').split(/\s+/);
 let n=0;
 for (const part of pieces) {
  if(part==='hundred'){if(n<1)return null;n*=100;}
  else if (part==='thousand'){if(n<1)return null;n*=1000;}
  else if(Object.hasOwn(unit,part))n+=unit[part];
  else return null;
 }
 return pieces.length?n:null;
}
const AMOUNT=String.raw`(?:\d[\d,]*(?:\.\d+)?|(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[ -](?:one|two|three|four|five|six|seven|eight|nine|hundred|thousand))*)`;
const numeric=(p,re)=>{const m=re.exec(p);return m?parseNumber(m[1]):null;};

function compareCounts(p,c) {
 // Both numbers must occur in the *same* stated result, and the
 // conclusion must compare precisely the two cited result categories.
 const t=p.toLowerCase(),h=c.toLowerCase();
 if(HEDGED.test(h)||!SAME_TOPIC.test(t)||!SAME_TOPIC.test(h))return null;
 const patterns=[
  {a:new RegExp(`\\b(${AMOUNT})\\s+(?:votes?\\s+)?for\\b`,'i'),
   b:new RegExp(`\\b(${AMOUNT})\\s+(?:votes?\\s+)?against\\b`,'i'),
   conclusion:/\bmore\s+(?:votes?|voters?)\s+(?:were\s+cast\s+)?for\s+than\s+against\b/i},
  {a:new RegExp(`\\b(${AMOUNT})\\s+satisfied\\s+responses?\\b`,'i'),
   b:new RegExp(`\\b(${AMOUNT})\\s+dissatisfied\\s+responses?\\b`,'i'),
   conclusion:/\bsatisfied\s+responses?\s+outnumber\s+dissatisfied\b/i},
  {a:new RegExp(`\\b(${AMOUNT})\\s+(?:yes\\s+votes?|votes?\\s+yes)\\b`,'i'),
   b:new RegExp(`\\b(${AMOUNT})\\s+(?:no\\s+votes?|votes?\\s+no)\\b`,'i'),
   conclusion:/\bmore\s+(?:voters?\s+)?(?:said|voted)\s+yes\s+than\s+no\b/i}
 ];
 for(const t of patterns){
  if(!t.conclusion.test(h))continue;
  const left=numeric(p,t.a),right=numeric(p,t.b);
  if(left===null||right===null)continue;
  return {label:left>right?'supported_conclusion':'contradictory_claims',
    reason:'reported_count_order',source:'bounded_count_comparison'};
 }
 const candidates=[...p.matchAll(new RegExp(`\\bCandidate\\s+([A-Z])\\s+(${AMOUNT})\\s*%`,'gi'))];
 if(candidates.length===2 && /\bCandidate\s+[A-Z]\s+received\s+a\s+larger\s+share\s+than\s+Candidate\s+[A-Z]\b/i.test(h)){
  const order=/\bCandidate\s+([A-Z])\s+received\s+a\s+larger\s+share\s+than\s+Candidate\s+([A-Z])\b/i.exec(c);
  if(!order||order[1]===order[2])return null;
  const map=new Map(candidates.map(x=>[x[1].toUpperCase(),parseNumber(x[2])]));
  if(map.size!==2||!map.has(order[1])||!map.has(order[2]))return null;
  return {label:map.get(order[1])>map.get(order[2])?'supported_conclusion':'contradictory_claims',
   reason:'reported_candidate_vote_share_order',source:'bounded_count_comparison'};
 }
 return null;
}

function voteQuantifier(p,c) {
 // A complete set of votes in a specified group: unanimous yes/against
 // is incompatible with a no/for vote by a member of that very group.
 const group=/(?:members?|wards?|councillors?|voters?|delegates?)/i;
 if(/\b(?:said|claimed|quoted)\s+[\"“]/i.test(p))return null;
 const a=/\b(?:all|every)\b.{0,35}\b(members?|wards?|councillors?|voters?|delegates?)\b.{0,65}\bvoted\s+(yes|no|for|against)\b/i.exec(p);
 if(!a||HEDGED.test(c))return null;
 const topic=/\b([a-z]+)\s+(?:motion|proposal|bill|measure)\b/i;
 const objectA=topic.exec(p)?.[1]?.toLowerCase();
 const objectB=topic.exec(c)?.[1]?.toLowerCase();
 if(objectA&&objectB&&objectA!==objectB&&
    !['the','this','that','same','proposed'].includes(objectA)&&
    !['the','this','that','same','proposed'].includes(objectB))return null;
 const g=a[1].toLowerCase().replace(/s$/,'');
 const m=/(?:none|not one|at least one|one of (?:those|the))\b.{0,60}\b(members?|wards?|councillors?|voters?|delegates?)\b.{0,60}\bvoted\s+(yes|no|for|against)\b/i.exec(c);
 if(!m||m[1].toLowerCase().replace(/s$/,'')!==g)return null;
 const yes=x=>x==='yes'||x==='for';
 const premiseV=yes(a[2].toLowerCase());const claimV=yes(m[2].toLowerCase());
 const none=/\b(?:none|not one)\b/i.test(c.slice(0,m.index+16));
 if(none&&premiseV!==claimV)return {label:'supported_conclusion',reason:'all_group_opposite_to_none'};
 if(!none&&premiseV!==claimV)return {label:'contradictory_claims',reason:'unanimous_vote_vs_opposite_member_vote'};
 return null;
}

function exclusion(p,c) {
 if(HEDGED.test(c))return null;
 // Explicitly excluded item cannot be covered by the named policy.
 const excluded=/\b(?:explicitly\s+)?excludes?\s+(?:the\s+)?([a-z][a-z-]{2,25})\b/i.exec(p);
 const neg=/\b([a-z][a-z-]{2,25})(?:'s|’s)?\s+(?:bill|fee|charges?|cost|claims?)?\s*(?:is|are|was|were)\s+not\s+covered\b/i.exec(c);
 if(!/\b(?:separate|other|different)\s+\w*(?:\s+\w+){0,3}\s+(?:policy|plan|coverage|insurance)\b/i.test(c)&&
    excluded&&neg&&excluded[1].toLowerCase()===neg[1].toLowerCase()&&
    /\b(?:policy|price.cap|coverage|insurance|plan)\b/i.test(p)&&/\b(?:policy|price.cap|coverage|insurance|plan)\b/i.test(c))
  return {label:'supported_conclusion',reason:'explicit_policy_exclusion'};
 // Online-only meetings imply no in-person session when discussing the
 // same meeting, provided no different meetings or time periods appear.
 if(/\bonline only\b/i.test(p)&&/\b(?:meeting|session|event)\b/i.test(p)&&
    /\b(?:the|this|that|same)\s+(?:meeting|session|event)\b/i.test(c)&&
    /\bno (?:in.person|physical|face.to.face)\s+(?:meeting|session|event)\b/i.test(c)&&
    /\b(?:meeting|session|event)\b/i.test(c))
  return {label:'supported_conclusion',reason:'online_only_no_in_person'};
 // When the exact item is listed as an ingredient, "ingredient-free" is
 // inconsistent with that ingredient being present.
 const ingred=/\blists?\s+([a-z][a-z-]{2,30})\s+among\s+(?:the\s+)?([a-z][a-z-]{2,30})(?:'s|’s)\s+ingredients?\b/i.exec(p);
 const free=/\bthe\s+([a-z][a-z-]{2,30})\b.{0,60}\b([a-z][a-z-]{2,30})-free\b/i.exec(c);
 if(ingred&&free&&ingred[1].toLowerCase()===free[2].toLowerCase()&&ingred[2].toLowerCase()===free[1].toLowerCase()&&
    /\b(?:cannot|can't|not)\b/i.test(c))
  return {label:'supported_conclusion',reason:'ingredient_present_vs_free_description'};
 return null;
}


function clockInMinutes(value) {
 const m=/^(?:[01]?\d|2[0-3]):[0-5]\d$/.exec(value);
 if(!m)return null;
 const [h,min]=value.split(':').map(Number);
 return h*60+min;
}
function boundedSchedule(p,c) {
 if(HEDGED.test(c))return null;
 // A service is ruled out by a *stated no-service-after* limit.
 if(/\b(?:train|trains|service|services)\b/i.test(p)&&
    /\b(?:train|trains|service|services)\b/i.test(c)&&
    /\b(?:tonight|today|same day)\b/i.test(p)&&
    /\b(?:tonight|today|same day)\b/i.test(c)) {
  const noAfter=/\bno\s+(?:trains?|services?)\s+(?:depart|run|operate)\s+[^.!?]{0,55}?after\s+(\d{1,2}:\d\d)\b/i.exec(p);
  const lastService=/\blast\s+(?:train|service)\b[^.!?]{0,80}\b(?:at|leaves? at)\s+(\d{1,2}:\d\d)\b/i.exec(p);
  const noFollowing=/\bno\s+(?:trains?|services?)\s+after\b/i.test(p);
  const cutoff=clockInMinutes(noAfter?.[1] ?? (noFollowing?lastService?.[1]:null));
  const target=/\b(\d{1,2}:\d\d)\s+(?:train|service)\b/i.exec(c);
  const time=clockInMinutes(target?.[1]);
  if(cutoff!==null&&time!==null&&time>cutoff){
   if(/\b(?:no|not|never|cannot|can't|will not|won't)\b/i.test(c))
    return {label:'supported_conclusion',reason:'service_after_last_departure_excluded'};
   if(/\b(?:depart|leave|operate|run|take place|arrive|be available)\b/i.test(c))
    return {label:'contradictory_claims',reason:'departing_service_after_stated_cutoff'};
  }
 }
 const expired=/\b(?:discount|offer|voucher|coupon)\b[^.!?]{0,130}\b(?:expires?\s+on|valid\s+only\s+during)\s+(?:(\d{1,2})\s+)?(January|February|March|April|May|June|July|August|September|October|November|December)\b/i.exec(p);
 const claim=/\b(?:same\s+)?(?:discount|offer|voucher|coupon)\b[^.!?]{0,60}\bvalid\s+(?:this\s+|in\s+|during\s+)?(January|February|March|April|May|June|July|August|September|October|November|December)\b/i.exec(c);
 if(expired&&claim){
  const months=['january','february','march','april','may','june','july','august','september','october','november','december'];
  if(months.indexOf(claim[1].toLowerCase())>months.indexOf(expired[2].toLowerCase())&&
     /\b(?:only|expires?)\b/i.test(p))
   return {label:'contradictory_claims',reason:'offer_after_stated_expiration'};
 }
 return null;
}
function boundedThreshold(p,c) {
 if(HEDGED.test(c))return null;
 // Currency must match, and the text must explicitly claim a minimum.
 const min=/\b(?:free\s+)?delivery\b[^.!?]{0,100}\b(?:only\s+when|if)\s+(?:an?\s+)?(?:order|basket|purchase)\s+(?:totals?|reaches?|is\s+(?:at\s+least|over))\s+(?:at\s+least\s+)?£\s*(\d+(?:\.\d+)?)\b/i.exec(p);
 const paid=/\b(?:basket|order|purchase)\b[^.!?]{0,55}\b(?:costs?|totals?|is)\s+£\s*(\d+(?:\.\d+)?)\b/i.exec(p);
 const pricedItems=[...p.matchAll(/\b(?:basket|order|purchase)\b[^.!?]{0,55}\b(?:costs?|totals?)\s+£\s*\d+/gi)];
 if(pricedItems.length===1&&min&&paid&&Number(paid[1])<Number(min[1])&&
    /\b(?:does\s+not|doesn't|cannot|can't|will\s+not|won't)\s+qualify\s+for\s+free\s+delivery\b/i.test(c))
  return {label:'supported_conclusion',reason:'order_below_explicit_free_delivery_minimum'};
 const lateRule=new RegExp('\\b(?:refund|compensation)\\b[^.!?]{0,100}\\b(?:every|any)\\s+order\\b[^.!?]{0,90}\\bmore\\s+than\\s+('+AMOUNT+')\\s+days?\\s+late\\b','i').exec(p);
 const lateOrder=new RegExp('\\b(?:this|the)\\s+order\\b[^.!?]{0,90}\\b('+AMOUNT+')\\s+days?\\s+(?:past|late|after)\\b','i').exec(p);
 if(lateRule&&lateOrder&&parseNumber(lateOrder[1])>parseNumber(lateRule[1])&&
    /\\b(?:meets|satisfies|qualifies for)\\b[^.!?]{0,70}\\b(?:refund|compensation|condition)\\b/i.test(c))
  return {label:'supported_conclusion',reason:'delivery_exceeds_explicit_refund_threshold'};
 const width=/\b(?:bans?|excludes?|forbids?|prohibits?)\s+bags?\s+wider\s+than\s+(\d+(?:\.\d+)?)\s+(?:centimet(?:re|er)s?|cm)\b/i.exec(p);
 const measure=/\b(?:bag|tote|case)\b[^.!?]{0,100}\bmeasures?\s+(\d+(?:\.\d+)?)\s+(?:centimet(?:re|er)s?|cm)\s+(?:wide|across|in\s+width)\b/i.exec(p);
 if(width&&measure&&Number(measure[1])>Number(width[1])&&
    /\b(?:too\s+wide|banned\s+by|excluded\s+by)\b/i.test(c)&&
    /\b(?:bag|tote|case|entry|policy)\b/i.test(c))
  return {label:'supported_conclusion',reason:'item_over_explicit_width_limit'};
 const max=new RegExp('\\bmaximum\\s+of\\s+('+AMOUNT+')\\s+(?:books?|items?)\\s+at\\s+once\\b','i').exec(p);
 const borrowed=new RegExp('\\b(?:has|holds?|borrowed)\\s+('+AMOUNT+')\\s+(?:books?|items?)\\s+on\\s+loan\\b','i').exec(p);
 if(max&&borrowed&&parseNumber(borrowed[1])===parseNumber(max[1])&&
    /\b(?:reached|at|hit)\s+(?:that|the|his|her|their)?\s*(?:limit|maximum)\b/i.test(c))
  return {label:'supported_conclusion',reason:'at_explicit_borrowing_limit'};
 return null;
}
// Returns only an explicitly supported/contradictory result, or null.
// Each pair may be the combination of all premises; no claim that an
// arbitrary single premise alone supports a multi-premise conclusion.
export function boundedArgumentLogic(premise,conclusion) {
 if(typeof premise!=='string'||typeof conclusion!=='string')return null;
 return compareCounts(premise,conclusion)||voteQuantifier(premise,conclusion)||
  exclusion(premise,conclusion)||boundedSchedule(premise,conclusion)||boundedThreshold(premise,conclusion)||
  inferSupportedQuantities(premise,conclusion);
}