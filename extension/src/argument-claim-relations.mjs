// Deterministic, narrow relation checks for ordinary one-paragraph arguments.
// No external model or guesses about author intent/factual truth. These checks
// describe only an explicit relationship between the supplied propositions.

const STOP = new Set(("a an the and or but at as of on in into with for from to by this that these those "+
 "is are was were be been being has have had will would can could should may might must do does did "+
 "their our his her its they them we us he she you i it who whom whose what when where why which "+
 "therefore thus so because says said states stated claimed reports reported confirms confirmed "+
 "today tomorrow yesterday then now also only there here").split(/\s+/));
function stem(word) {
 let x=word.toLowerCase().replace(/['’]s$/,'');
 if(x.length>5 && /ies$/.test(x))return x.slice(0,-3)+'y';
 if(x.length>5 && /(?:ed|ing)$/.test(x) && !/(?:eed|thing)$/.test(x))
  return x.replace(/(?:ed|ing)$/,'');
 if(x.length>3 && x.endsWith('s') && !/(?:ss|us|is)$/.test(x))return x.slice(0,-1);
 return x;
}
function words(text) {
 return new Set((String(text).toLowerCase().match(/[a-z][a-z'’-]*/g)||[])
  .filter(w=>w.length>2&&!STOP.has(w)).map(stem)
  .filter(w=>w.length>2&&!STOP.has(w)));
}
function common(a,b) {
 const left=words(a),right=words(b);
 return [...left].filter(w=>right.has(w));
}
function distinctTime(a,b) {
 const pattern=/\b(?:today|tomorrow|yesterday|monday|tuesday|wednesday|thursday|friday|saturday|sunday|19\d\d|20\d\d|january|february|march|april|may|june|july|august|september|october|november|december|this month|last month|next month|this week|last week|next week)\b/gi;
 const left=[...new Set((a.match(pattern)||[]).map(x=>x.toLowerCase()))];
 const right=[...new Set((b.match(pattern)||[]).map(x=>x.toLowerCase()))];
 return left.length>0&&right.length>0&&!left.some(x=>right.includes(x));
}
const GROUPS=[
 [/\b(?:children|child|kids?)\b/i,/\b(?:adults?)\b/i],
 [/\b(?:registered residents?|members?)\b/i,/\b(?:unregistered|non.?members?)\b/i],
 [/\b(?:employees?|staff)\b/i,/\b(?:customers?|visitors?)\b/i]
];
function incompatibleGroups(a,b) {
 return GROUPS.some(([x,y])=>(x.test(a)&&y.test(b)&&!y.test(a)&&!x.test(b))||
   (y.test(a)&&x.test(b)&&!x.test(a)&&!y.test(b)));
}
const DISTINCT_SCOPE = [
 [/\b(?:new|newer)\b/i,/\b(?:old|older)\b/i],
 [/\b(?:north|northern)\b/i,/\b(?:south|southern)\b/i],
 [/\b(?:east|eastern)\b/i,/\b(?:west|western)\b/i],
 [/\bfirst\b/i,/\bsecond\b/i],
 [/\b(?:weekdays?|working days?)\b/i,/\bweekends?\b/i]
];
function differentScope(a,b) {
 return DISTINCT_SCOPE.some(([x,y])=>
  (x.test(a)&&y.test(b)&&!y.test(a)&&!x.test(b)) ||
  (y.test(a)&&x.test(b)&&!x.test(a)&&!y.test(b)));
}
function sharedScope(a,b) {
 if(typeof a!=='string'||typeof b!=='string'||distinctTime(a,b)||incompatibleGroups(a,b)||differentScope(a,b))return null;
 return common(a,b);
}
function oneSide(a,b,x,y) {
 return (x.test(a)&&y.test(b)&&!y.test(a)&&!x.test(b))||
        (y.test(a)&&x.test(b)&&!x.test(a)&&!y.test(b));
}
const OPPOSITES=[
 [/\b(?:approv(?:ed|es|ing|e)|accept(?:ed|s)?|authoris(?:ed|es)|pass(?:ed|es)?)\b/i,
  /\b(?:reject(?:ed|ing|s)?|den(?:ied|ies)|voted down|vetoed)\b/i],
 [/\b(?:increas(?:ed|es|ing|e)|rose|risen|grew|grown)\b/i,
  /\b(?:decreas(?:ed|es|ing|e)|declin(?:ed|es|ing|e)|fell|fallen|dropp?(?:ed|ing|s)?)\b/i],
 [/\b(?:won|victory|victorious|winning)\b/i,
  /\b(?:lost|losing|defeated?|defeat)\b/i],
 [/\b(?:opened?|opens?)\b/i,/\b(?:clos(?:ed|es|ing)|shut)\b/i],
 [/\b(?:allow(?:ed|s)?|permit(?:s|ted)?|permitted)\b/i,
  /\b(?:bann?(?:ed|ing|s)?|forbidden|prohibit(?:ed|s)?)\b/i]
];
const FREE=/\bfree\b|\bno\b.{0,35}\b(?:fee|charge|payment)\b|\bwithout (?:a )?charge\b/i;
const MUST_PAY=/\bmust pay\b|\brequir(?:es?|ed)\s+payment\b|\b(?:fee|payment)\s+(?:is|was|will be)\s+required\b/i;
const ALL_CLAIMED=/\b(?:all|every)\b.{0,65}\b(?:prizes?|rewards?|places?|spaces?)\b.{0,55}\bclaimed\b/i;
const ONE_UNCLAIMED=/\b(?:at least one|one of those|one of the)\b.{0,75}\b(?:prizes?|rewards?|places?|spaces?)\b.{0,40}\bunclaimed\b/i;
const SOLD_OUT=/\b(?:all|every)\b.{0,70}\b(?:seats?|tickets?)\b.{0,25}\bsold\b/i;
const AVAILABLE=/\b(?:seats?|tickets?)\b.{0,55}\b(?:available|on sale)\b/i;
const NONE_CLOSE=/\b(?:none|no)\b.{0,55}\b(?:shops?|branches?|stores?)\b.{0,32}\b(?:will|would)\s+close\b/i;
const SOME_CLOSE=/\b(?:shops?|branches?|stores?)\b.{0,45}\b(?:will|would)\s+close\b/i;

/** An explicitly opposing *relation*, rather than a model probability. */
export function observableContradiction(premise,conclusion) {
 const p=String(premise||''),c=String(conclusion||'');
 const shared=sharedScope(p,c);
 if(/\b(?:may|might|could|possibly|perhaps|apparently)\b/i.test(c))
  return {verified:false,reason:'qualified_conclusion'};
 if(!shared?.length)return {verified:false,reason:'no_unambiguous_shared_scope'};
 const normalizedP=p.replace(/\brather than\s+\w+\b/gi,'');
 const normalizedC=c.replace(/\brather than\s+\w+\b/gi,'');
 const sharedActionTarget = shared.some(word => {
  // With only one shared topic, it must be directly attached to the
  // opposed actions on BOTH sides, not merely a shared town or company.
  const before=(text,action) => {
   const m=action.exec(text); if(!m)return false;
   const pos=text.toLowerCase().lastIndexOf(word.toLowerCase(),m.index);
   return pos>=0&&m.index-pos>=word.length&&m.index-pos<=25;
  };
  return OPPOSITES.some(([x,y]) =>
   (before(normalizedP,x)&&before(normalizedC,y)) ||
   (before(normalizedP,y)&&before(normalizedC,x)));
 });
 if((shared.length>=2||sharedActionTarget)&&OPPOSITES.some(([x,y])=>oneSide(normalizedP,normalizedC,x,y)))
  return {verified:true,reason:'same_topic_opposing_actions'};
 if(shared.length>=2&&oneSide(p,c,FREE,MUST_PAY))
  return {verified:true,reason:'same_group_free_vs_required_payment'};
 if(shared.length>=1&&((ALL_CLAIMED.test(p)&&ONE_UNCLAIMED.test(c))||
  (ALL_CLAIMED.test(c)&&ONE_UNCLAIMED.test(p))))
  return {verified:true,reason:'all_items_claimed_vs_one_unclaimed'};
 // Resale platforms can offer tickets when the venue cannot; this only
 // conflicts if the claim explicitly says tickets are available FROM venue.
 if(shared.includes('venue')&&SOLD_OUT.test(p)&&
   /\bno extra\b.{0,40}\bseats?\b/i.test(p)&&AVAILABLE.test(c)&&
   /\bfrom (?:the )?(?:[a-z-]+\s+){0,2}venue\b/i.test(c))
  return {verified:true,reason:'all_seats_sold_no_new_venue_tickets'};
 if(shared.includes('venue')&&SOLD_OUT.test(c)&&
   /\bno extra\b.{0,40}\bseats?\b/i.test(c)&&AVAILABLE.test(p)&&
   /\bfrom (?:the )?(?:[a-z-]+\s+){0,2}venue\b/i.test(p))
  return {verified:true,reason:'all_seats_sold_no_new_venue_tickets'};
 if(shared.length>=1&&/\bonline only\b/i.test(p)&&
   /\bno (?:in.person|hall) (?:meeting|session|event)\b/i.test(p)&&
   /\b(?:in|at) (?:the )?(?:school )?hall\b/i.test(c))
  return {verified:true,reason:'online_only_no_hall_vs_hall_session'};
 if(shared.length>=1&&/\bonline only\b/i.test(c)&&
   /\bno (?:in.person|hall) (?:meeting|session|event)\b/i.test(c)&&
   /\b(?:in|at) (?:the )?(?:school )?hall\b/i.test(p))
  return {verified:true,reason:'online_only_no_hall_vs_hall_session'};
 if(shared.includes('shop')&&shared.includes('close')&&
   ((NONE_CLOSE.test(p)&&SOME_CLOSE.test(c))||(NONE_CLOSE.test(c)&&SOME_CLOSE.test(p))))
  return {verified:true,reason:'none_of_shops_close_vs_named_shop_close'};
 if(shared.includes('door')&&/\bwill shut\b/i.test(p)&&
   /\bnot reopen\b/i.test(p)&&/\bremain open\b/i.test(c))
  return {verified:true,reason:'doors_shut_not_reopened_vs_open'};
 return {verified:false,reason:'no_deterministic_conflict'};
}
const SAMPLE=/\b(?:one|single|two|three|four|five|six|seven|eight|nine|ten|few|several|some|most comments|a poll of|poll of|a survey of|sample of|handful of|dozens of|\d+)\b/i;
const POPULATION=/\b(?:everybody|everyone|every|all|whole (?:city|town|country|region|population|district)|entire (?:city|town|country|region|population|district))\b/i;
const UNIVERSAL_PREMISE=/\b(?:every|everyone|everybody|all|whole|entire)\b/i;
const GENERIC_TOPIC=new Set(['town','city','country','region','district','person','people','resident','customer','member','voter','user','comment','poll','survey','vote','group','year','month','week','new','old','local']);
/** A small observed sample used to justify a claim about an entire population. */
export function observableSamplingLeap(premise,conclusion) {
 const p=String(premise||''),c=String(conclusion||'');
 const shared=sharedScope(p,c);
 if(!shared?.length||!SAMPLE.test(p)||!POPULATION.test(c)||
   UNIVERSAL_PREMISE.test(p)||/\b(?:might|may|possibly|perhaps|could)\b/i.test(c))
  return {verified:false,reason:'no_explicit_sample_population_leap'};
 const topic=shared.filter(w=>!GENERIC_TOPIC.has(w));
 if(!topic.length)return {verified:false,reason:'no_shared_sample_topic'};
 return {verified:true,reason:'limited_sample_claimed_as_whole_population',topic};
}