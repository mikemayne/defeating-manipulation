// Local, premise-grounded multi-step reasoning over time, eligibility and
// equivalent predicates. The rules are deliberately narrow: an unknown or
// ambiguous scope produces no verdict. Only original source text is analysed.
// The output contains evidence chains for diagnostics; it does not edit text.
const UNCERTAIN = /\b(?:may|might|could|perhaps|possibly|apparently|allegedly|probably|likely|seems)\b/i;
const EXCEPTION = /\b(?:except|unless|other|another|different|separate|additional exception|resale|secondary market|potentially|reopened|will reopen)\b/i;
const QUOTE = /["“”]/;
const DAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
const NUMBER = Object.freeze({one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10});
function normalize(t) {return String(t||'').replace(/[’‘]/g,"'").replace(/\s+/g,' ').trim();}
function noun(t){return normalize(t).toLowerCase().replace(/^(?:the|a|an|this|that)\s+/,'').replace(/[.!?,;]+$/,'').trim();}
function clauses(t){return normalize(t).split(/(?<=[.!?])\s+(?=[A-Za-z])|\s*;\s*/).filter(Boolean);}
function positiveInt(t){const x=normalize(t).toLowerCase();return /^\d+$/.test(x)?Number(x):(NUMBER[x]??null);}
function sameWord(a,b){return noun(a)===noun(b);}
function dayMatch(day,clause){return new RegExp('\\b'+day+'s?\\b','i').test(clause);}
function support(reason,chain) {return {label:'supported_conclusion',reason,chain};}

// Capture explicit, time-scoped policy changes. The group and day are values
// extracted from the premise, never a configured council/parking list.
function waivedGroupFee(p,c){
 const rule=/\b(?:removed|abolished|waived|eliminated|cancelled|scrapped)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+(?:parking\s+)?(?:charges?|fees?)\s+from\s+(?:all|every|each)\s+([a-z][a-z\s-]{3,70}?)(?=[.;]|$)/i.exec(p);
 if(!rule||/\b(?:not|never|might|may|could)\s+(?:have\s+|be\s+)?$/i.test(p.slice(Math.max(0,rule.index-28),rule.index)))return null;
 const day=rule[1].toLowerCase(),group=noun(rule[2]);
 const concept=group.match(/^([a-z-]+)\s+(.+)$/);if(!concept)return null;
 const qualifier=concept[1],category=concept[2].replace(/s$/i,'');
 // Require a unique named facility that contains the category in its proper
 // name, AND is explicitly said to have the rule's qualifier.
 const categoryWords=category.split(/\s+/);
 const entityRx=new RegExp('\\b([A-Z][a-z]+(?:\\s+[A-Z][a-z]+){0,4}\\s+'+categoryWords.map(escapeRx).join('\\s+')+')\\s+is\\s+'+escapeRx(qualifier)+'\\b','i');
 const memberText=p.slice(rule.index+rule[0].length);
 const entity=entityRx.exec(memberText);
 if(!entity)return null;
 // No second facility of the same category may compete with "there".
 const names=[...memberText.matchAll(new RegExp('\\b([A-Z][a-z]+(?:\\s+[A-Z][a-z]+){0,4}\\s+'+categoryWords.map(escapeRx).join('\\s+')+')\\b','gi'))];
 if(new Set(names.map(m=>m[1])).size!==1)return null;
 if(!/\bparking there\b/i.test(c)||!/\bis free\b/i.test(c)||!/\b(?:under the (?:new|updated) policy|under that policy|by that rule|under this policy|on those terms)\b/i.test(c))return null;
 if(!dayMatch(day,c))return null;
 return support('scoped_fee_waiver_applies_to_explicit_group_member',[
  {kind:'fee_waiver',day,group,category},
  {kind:'member',name:entity[1],group},
  {kind:'derived',predicate:'no_payment_due',day,name:entity[1]}]);
}
// "Entry fees removed for every member" => "entry is free for members".
// Group, service, and quantifier must remain the same; a single discounted
// transaction is not a general fee waiver.
function waivedServiceFee(p,c){
 const r=/\b(?:removed|waived|abolished|eliminated|scrapped)\s+(?:all\s+)?([a-z][a-z-]{2,28})\s+(?:fees?|charges?)\s+(?:for|from)\s+(?:all|every|each)\s+((?:[a-z-]+\s+){0,2}[a-z-]+)\b/i.exec(p);
 if(!r||/\b(?:not|never|might|may|could)\s+(?:have\s+|be\s+)?$/i.test(p.slice(Math.max(0,r.index-28),r.index)))return null;
 if(/\b(?:temporarily|for one day|for this week|during this week|today only|yesterday only)\b/i.test(p))return null;
 const service=r[1].toLowerCase(),group=noun(r[2]);
 const match=/\b([a-z][a-z-]{2,28})\s+is\s+free\s+for\s+(?:all|every|each)?\s*((?:[a-z-]+\s+){0,2}[a-z-]+)\b/i.exec(c);
 if(!match||!sameWord(service,match[1])||!sameWord(group,match[2]))return null;
 if(/\b(?:one-off|just one|only one|selected|some|limited number)\b/i.test(p))return null;
 return support('equivalent_removed_fee_and_free_service_same_scope',[
  {kind:'fee',service,group,obligation:'removed'},
  {kind:'derived',service,group,payment_due:false}]);
}
function escapeRx(s){return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
// A named, explicitly closed facility stays closed at a future point only if
// the text states it is permanent, and the *same* facility is in the claim.
function continuingClosure(p,c){
 const m=/\b(?:the|this|that|its)\s+([A-Z][A-Za-z\s'-]{1,65}?)\s+(?:has\s+)?(?:been\s+)?(?:permanently closed|closed permanently)\s+(?:and|,)\s+(?:will not reopen|won't reopen|shall not reopen)\b/.exec(p);
 if(!m||/\b(?:denied|disputed|unconfirmed|rumou?red|unverified)\b/i.test(p))return null;
 const phrase=m[1].trim(),category=phrase.split(/\s+/).at(-1).toLowerCase();
 // A deictic "that branch" is ambiguous if multiple named branches appear.
 const facilityMentions=[...p.matchAll(new RegExp('\\b[A-Z][A-Za-z-]+(?:\\s+[A-Z][A-Za-z-]+){0,4}\\s+'+escapeRx(category)+'\\b','g'))].map(x=>x[0]);
 if(new Set(facilityMentions).size>1)return null;
 if(!/\b(?:customers?|visitors?|users?|members?|patients?)\s+(?:cannot|can't|will not be able to)\s+(?:shop|enter|visit|use|attend|obtain service)\b/i.test(c))return null;
 if(!new RegExp('\\b(?:at|in|from)\\s+(?:the|this|that|same)\\s+'+escapeRx(category)+'\\b','i').test(c))return null;
 if(!/\b(?:tomorrow|next week|next month|next year|in the future)\b/i.test(c))return null;
 if(/\b(?:online|website|by phone|through delivery)\b/i.test(c))return null;
 return support('permanent_state_prevents_future_on_site_use',[
  {kind:'state',subject:phrase,value:'closed',persistent:true},
  {kind:'future',reference:'after closure'},
  {kind:'derived',subject:phrase,value:'not_open_at_that_site'}]);
}
function depletedInventory(p,c){
 const rule=/\b(?:all|every)\s+(?:the\s+)?(seat|ticket)s?\s+(?:for\s+(?:the\s+)?([a-z0-9' -]{2,65}?)\s+)?(?:has|have)\s+(?:been\s+)?sold\b/i.exec(p);
 if(!rule||/\b(?:not|never|might|may|could)\s*$/i.test(p.slice(Math.max(0,rule.index-24),rule.index)))return null;
 const resource=rule[1].toLowerCase();
 const n=new RegExp('\\bno\\s+(?:further|extra|additional|new)\\s+'+resource+'s?\\s+(?:will|would)\\s+be\\s+(?:released|added|made available)\\b','i');
 if(!n.test(p))return null;
 if(!/\bno\s+(?:more\s+)?tickets?\s+remain\b/i.test(c))return null;
 const scope=rule[2]?.trim().toLowerCase();
 if(scope){
  // "that screening" may refer to one explicit screening in the premise.
  const type=scope.split(/\s+/).at(-1).replace(/[^a-z]/g,'');
  if(!/\b(?:that|this|the|same)\s+screening\b/i.test(c)||type!=='screening')return null;
  if((p.match(/\bscreening\b/gi)||[]).length!==1)return null;
 } else if(!/\b(?:for that screening|for the performance|for that event|at the venue|at the box office)\b/i.test(c))return null;
 return support('finite_inventory_exhausted_without_new_release',[
  {kind:'inventory',item:resource,count_available:0},
  {kind:'new_release',count:0},
  {kind:'derived',item:'ticket',count_available:0}]);
}
function exclusiveEligibility(p,c){
 const r=/\b(?:restricts?|restricted|limits?|limited)\s+(?:the|this|that)\s+(offer|discount|promotion|deal|benefit)\s+to\s+new\s+([a-z-]+)s\b/i.exec(p);
 if(!r||/\b(?:not|never|might|may|could)\s*$/i.test(p.slice(Math.max(0,r.index-24),r.index)))return null;
 const benefit=r[1],group=r[2].toLowerCase();
 // The person has already occupied the role for a significant, explicit
 // duration. Being on a mailing list is not sufficient.
 const old=new RegExp('\\b([A-Z][a-z]{1,26})\\s+has\\s+been\\s+(?:a\\s+|an\\s+)?'+escapeRx(group.replace(/er$/,'').replace(/ib$/,''))+'[a-z]*\\s+for\\s+(\\d+|one|two|three|four|five|six|seven|eight|nine|ten)\\s+years?\\b','i').exec(p);
 if(!old)return null;
 const years=positiveInt(old[2]);if(years===null||years<2)return null;
 if(!new RegExp('\\b(?:the|this|that)\\s+'+benefit+'\\s+(?:does not|doesn\'t|cannot|can\'t)\\s+apply\\s+to\\s+(?:him|her|'+escapeRx(old[1])+')\\b','i').test(c))return null;
 if((p.match(/\b[A-Z][a-z]{1,26}\s+has\s+been\b/g)||[]).length!==1)return null;
 return support('exclusive_new_member_condition_fails_for_established_member',[
  {kind:'necessary_condition',benefit,condition:'new '+group},
  {kind:'tenure',name:old[1],group,years},
  {kind:'derived',name:old[1],eligible:false}]);
}
function deadlineRule(p,c){
 // Only resolve cyclic days when the *following* week relation is explicit;
 // a bare "Monday" is not necessarily after the Friday referenced.
 const r=/\bevery\s+([a-z-]+)\s+submitted\s+after\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+(?:attracts?|incurs?|gets?)\s+([^.;]{3,65})/i.exec(p);
 if(!r||/\b(?:not|never|might|may|could)\s*$/i.test(p.slice(Math.max(0,r.index-24),r.index)))return null;
 const category=r[1].toLowerCase(),after=r[2].toLowerCase();
 const submitted=new RegExp('\\b(?:a|the|this|that)\\s+\\w+\\s+submitted\\s+(?:his|hers|the|their|a|an|its)\\s+(?:'+escapeRx(category)+'\\s+)?on\\s+(?:the\\s+)?following\\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\\b','i').exec(p);
 if(!submitted)return null;
 const day=submitted[1].toLowerCase();if(day===after)return null;
 if(!new RegExp('\\b(?:his|her|their|that|the)\\s+'+escapeRx(category)+'\\s+(?:falls? under|qualifies for|is subject to)\\s+(?:that|the|this)\\s+','i').test(c))return null;
 return support('explicitly_ordered_submission_satisfies_deadline_rule',[
  {kind:'deadline',category,day:after,relation:'after'},
  {kind:'submission',day,category},
  {kind:'derived',subject:category,condition:'late'}]);
}
/** This is a forward, bounded proof search; it never uses model NLI scores. */
export function inferReasoningBridge(premise,conclusion){
 const p=normalize(premise),c=normalize(conclusion);
 if(!p||!c||p.length>1600||c.length>400||QUOTE.test(p)||QUOTE.test(c)||UNCERTAIN.test(c)||EXCEPTION.test(p)||EXCEPTION.test(c))return null;
 // Ordering matters: each rule must independently establish its conclusion.
 return waivedGroupFee(p,c)||waivedServiceFee(p,c)||continuingClosure(p,c)||depletedInventory(p,c)||exclusiveEligibility(p,c)||deadlineRule(p,c)||null;
}