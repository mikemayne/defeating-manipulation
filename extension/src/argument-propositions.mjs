// Structured propositions for local paragraph arguments.  No model weights,
// source offsets, or displayed text are modified.  The extractor recognises
// small, observable logical relations; unknown syntax yields no verdict.
// It never treats a neutral NLI score as proof that a claim is unsupported.

const NUMBER_WORDS = Object.freeze({zero:0,one:1,two:2,three:3,four:4,five:5,
 six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,
 fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,
 twenty:20,thirty:30,forty:40,fifty:50,sixty:60,seventy:70,eighty:80,
 ninety:90,hundred:100,thousand:1000});
const AMOUNT = String.raw`(?:\d+(?:\.\d+)?|hundreds|hundred|eighteen|seventeen|sixteen|fifteen|fourteen|thirteen|nineteen|twelve|eleven|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|zero|one|two|three|four|five|six|seven|eight|nine|ten)`;
const EXCEPTION = /\b(?:except|unless|but not|different|other|separate|alternative|another|different period|next week|following week)\b/i;
const HEDGE = /\b(?:may|might|perhaps|possibly|apparently|could|seems|seem|likely|probably)\b/i;
const QUOTE = /["“”]/;
const STOP = /^(?:the|a|an|that|this|those|these|his|her|its|their|our|my|your)$/;
const PRONOUN = /^(?:he|she|him|her|they|them|it)$/;
const NOT_NAME = new Set('The This That All Every Each Any None Some Our Their My His Her Its No A An We You They He She If It As After Before Since When While Today Tomorrow Monday Tuesday Wednesday Thursday Friday Saturday Sunday'.split(' '));
const FILLER = /\b(?:the|a|an|that|this|those|these)\b/g;
function norm(s) {return String(s||'').toLowerCase().replace(/[’‘]/g,"'").replace(/\s+/g,' ').trim().replace(/[.!?;,]+$/,'');}
function singular(s) {
 const x=norm(s).replace(/'s$/,'').replace(/^(?:the|this|that|these|those|a|an)\s+/,'');
 if(x==='children')return 'child'; if(x==='people')return 'person';
 if(x.endsWith('ies')&&x.length>4)return x.slice(0,-3)+'y';
 if(x.endsWith('es')&&/(?:ches|shes|sses|xes|zes)$/.test(x))return x.slice(0,-2);
 if(x.endsWith('s')&&!/(?:ss|us|is)$/.test(x)&&x.length>3)return x.slice(0,-1);
 return x;
}
function number(s){
 const v=norm(s).replace(/,/g,''); if(/^\d+(?:\.\d+)?$/.test(v))return Number(v);
 if(Object.hasOwn(NUMBER_WORDS,v))return NUMBER_WORDS[v];
 const p=v.replace(/-/g,' ').split(' '); if(p.length<2||p.some(w=>!Object.hasOwn(NUMBER_WORDS,w)))return null;
 let n=0;for(const w of p) {if(w==='hundred'||w==='thousand')n*=NUMBER_WORDS[w];else n+=NUMBER_WORDS[w];}
 return n;
}
function predicate(s){
 return norm(s).replace(FILLER,' ').replace(/\b(?:are|were|is|was)\s+/g,'')
 .replace(/\b(received|receives)\b/g,'receive').replace(/\b(invited)\b/g,'invite')
 .replace(/\b(allowed)\b/g,'allow').replace(/\b(approved)\b/g,'approve')
 .replace(/\b(must|will)\b/g,'').replace(/\s+/g,' ').trim();
}
function simpleClauses(s){return String(s||'').replace(/[’‘]/g,"'").split(/(?<=[.!?])\s+(?=[A-Za-z])|(?<=;)\s+/).map(x=>x.trim()).filter(Boolean);}
// Non-exhaustive surface parse: each fact carries its original source clause.
function extractFacts(text) {
 const clauses=simpleClauses(text),facts=[];
 for(const c of clauses){
  // All applicants are invited / Every technician can enter.
  let m=/\b(?:all|every|each)\s+((?:[a-z-]+\s+){0,3}[a-z-]+?)\s+(are|were|is|was|can|may|must|will|receive|received|receives)\s+([^.;]+)/i.exec(c);
  if(m)facts.push({kind:'universal',group:singular(m[1]),predicate:predicate(m[3]),modal:norm(m[2]),clause:c});
  // A named individual is explicitly a member of a group (not merely on a list).
  m=/\b([A-Z][a-z]{1,24})\s+(?:is|was|became|remains)\s+(?:a|an|the)\s+((?:[a-z-]+\s+){0,2}[a-z-]+)\b/.exec(c.replace(/^(?:the|a|an)\s+/i,''));
  if(m&&m[1].length>1&&!NOT_NAME.has(m[1]))facts.push({kind:'member',name:m[1],group:singular(m[2]),clause:c});
  // Explicit policies requiring a class of object to carry/show a property.
  m=/\b(?:rules?|polic(?:y|ies)|regulations?|standards?|guidelines?)\s+require\s+(?:all|every|each)\s+((?:[a-z-]+\s+){0,2}[a-z-]+)\s+to\s+(?:carry|have|display|show|wear|include|provide)\s+(?:a|an|the)\s+((?:[a-z-]+\s+){0,2}[a-z-]+)/i.exec(c);
  if(m)facts.push({kind:'requirement',group:singular(m[1]),item:singular(m[2]),clause:c});
  m=/\b(?:all|every|each)\s+((?:[a-z-]+\s+){0,2}[a-z-]+)\s+(?:must|shall|has to|is required to|are required to)\s+(?:carry|have|display|show|wear|include|provide)\s+(?:a|an|the)\s+((?:[a-z-]+\s+){0,2}[a-z-]+)/i.exec(c);
  if(m)facts.push({kind:'requirement',group:singular(m[1]),item:singular(m[2]),clause:c});
  // Object is a member of the conditional class, e.g. this post is sponsored.
  m=/\b(?:this|that|the)\s+([a-z][a-z-]+)\s+is\s+([a-z][a-z-]+)\b/i.exec(c);
  if(m)facts.push({kind:'classified',group:singular(m[1]),qualifier:norm(m[2]),clause:c});
  m=/\b(?:has|have|had|with)\s+no\s+(?:such\s+)?((?:[a-z-]+\s+){0,2}[a-z-]+)/i.exec(c);
  if(m)facts.push({kind:'missing',item:singular(m[1]),clause:c});
  // Material presence in a named item's ingredients; material and item are open-class.
  m=/\b(?:lists?|includes?|contains?)\s+([a-z-]+)\s+(?:among|in)\s+(?:the\s+)?([a-z][a-z-]+)'s\s+ingredients?\b/i.exec(c);
  if(m&&!/\b(?:not|never|cannot|no)\b/i.test(c.slice(Math.max(0,m.index-35),m.index)))
   facts.push({kind:'contains',subject:singular(m[2]),material:singular(m[1]),clause:c});
  m=/\b(?:the|this|that)\s+([a-z][a-z-]+)\s+(?:contains?|includes?)\s+([a-z-]+)\b/i.exec(c);
  if(m&&!/\b(?:no|not|never|without)\b/i.test(c.slice(Math.max(0,m.index-15),m.index+m[0].length)))
   facts.push({kind:'contains',subject:singular(m[1]),material:singular(m[2]),clause:c});
  // Explicit inability to use a service for an item, without implied restoration.
  m=/\b(?:the|this|that|same)\s+([a-z-]+)\s+(?:was|is|has been)\s+(deleted|removed|closed|cancelled|suspended)\b/i.exec(c);
  if(m){const never=/(?:not been (?:restored|reopened|reinstated|resumed)|will not reopen|permanently closed|never reopens?|has not reopened)/i.test(c);
   facts.push({kind:'state',subject:singular(m[1]),state:norm(m[2]),persistent:never,clause:c});}
  // Permission with a named payment medium, scoped to a time window.
  m=/\b(?:customers?|users?|visitors?|members?|passengers?)\s+(?:can|may|are allowed to)\s+pay\s+(?:with|by|using)\s+([a-z][a-z -]{0,30}?)\s+(during|in|within)\s+([a-z][a-z -]{1,35})(?:[.;]|$)/i.exec(c);
  if(m)facts.push({kind:'permission',medium:norm(m[1]),window:norm(m[3]),positive:true,clause:c});
  // Survey population and an exact age window, with zero or positive counts.
  m=new RegExp('\\b(zero|no|'+AMOUNT+')\\s+(respondents?|participants?)\\s+(?:under|below|younger than)\\s+(?:the age of\\s+)?('+AMOUNT+')\\b','i').exec(c);
  if(m)facts.push({kind:'population',role:singular(m[2]),count:number(m[1]),ageMax:number(m[3]),clause:c});
  // Numeric age eligibility. Does not automatically infer category membership.
  m=new RegExp('\\b(?:children|kids|minors|passengers|visitors|people|persons)\\s+(?:under|below|younger than)\\s+('+AMOUNT+')\\s+(?:years?\\s+old\\s+)?(?:ride|travel|enter|attend|are admitted)\\s+free\\b','i').exec(c);
  if(m)facts.push({kind:'threshold',property:'free',test:'age_less_than',limit:number(m[1]),clause:c});
  m=new RegExp('\\b(?:my|our|the|this|that)\\s+(?:[a-z-]+\\s+){0,2}(?:is|was|aged)\\s+('+AMOUNT+')\\b','i').exec(c);
  if(m)facts.push({kind:'value',property:'age',value:number(m[1]),clause:c});
 }
 return facts;
}
function conclusionFact(text) {
 const c=norm(text);
 let m=/\b(?:cannot|can't|is not|isn't|was not|wasn't)\s+(?:accurately\s+)?(?:be\s+described\s+as\s+)?([a-z-]+)-free\b/i.exec(c);
 if(m)return {kind:'free_of',material:singular(m[1]),polarity:false,clause:c};
 m=/\b(?:is|was)\s+([a-z-]+)-free\b/i.exec(c);
 if(m)return {kind:'free_of',material:singular(m[1]),polarity:true,clause:c};
 m=/\b(?:fails?|violates?)\s+(?:that|this|the|its)\s+(?:specific\s+)?(?:[a-z-]+\s+){0,3}(?:requirement|rule|policy)\b/i.exec(c);
 if(m)return {kind:'compliance',polarity:false,clause:c};
 m=/\b(?:complies?\s+with|meets?)\s+(?:that|this|the|its)\s+(?:specific\s+)?(?:[a-z-]+\s+){0,3}(?:requirement|rule|policy)\b/i.exec(c);
 if(m)return {kind:'compliance',polarity:true,clause:c};
 m=/\b([a-z-]+(?:\s+[a-z-]+){0,2})\s+payment\s+(is|was)\s+(not\s+)?accepted\s+(?:during|within|in)\s+([a-z -]+)\b/i.exec(c);
 if(m)return {kind:'permission',medium:norm(m[1]),window:norm(m[4]),polarity:!m[3],clause:c};
 m=/\b(?:the|this|that|same)\s+([a-z-]+)\s+(?:is|was|remains)\s+(?:publicly\s+)?visible\b/i.exec(c);
 if(m)return {kind:'visible',subject:singular(m[1]),polarity:true,clause:c};
 m=/\b(?:no|not)\s+(?:[a-z -]+)?\s*(?:tickets?|seats?)\s+remain\b/i.exec(c);
 if(m)return {kind:'inventory',polarity:false,clause:c};
 m=new RegExp('\\b('+AMOUNT+'|hundreds)\\s+(?:of\\s+)?(?:[a-z-]+\\s+){0,2}(?:under|below|younger than)\\s+(?:the age of\\s+)?('+AMOUNT+')\\s+(?:participated|took part|responded)\\s+in\\s+(?:that|the|this)\\s+survey\\b','i').exec(c);
 if(m)return {kind:'population',count: m[1].toLowerCase()==='hundreds'?100:number(m[1]),ageMax:number(m[2]),clause:c};
 m=/\b(?:all|every)\s+([^.;]+?)\s+(?:were|are|was|is|will be)\s+(.+)$/i.exec(c);
 if(m)return {kind:'universal',group:singular(m[1]),predicate:predicate(m[2]),clause:c};
 return {kind:'assertion',text:c,clause:c};
}
function verdict(label,reason,facts,claim) {return {label,reason,propositions:facts,conclusion:claim};}
function inferMembership(facts,claim,text,premise){
 const rules=facts.filter(x=>x.kind==='universal'),members=facts.filter(x=>x.kind==='member');
 if(!rules.length||!members.length||HEDGE.test(text))return null;
 // Subject pronoun is only safe with one named person and no other actor.
 const names=new Set(members.map(x=>x.name));if(names.size!==1)return null;
 const person=[...names][0];
 const possible=[...(premise+' '+text).matchAll(/\b[A-Z][a-z]{1,22}\b/g)].map(x=>x[0]).filter(x=>!NOT_NAME.has(x));
 if(possible.some(x=>x!==person))return null;
 if(!new RegExp('\\b(?:'+person+'|he|she)\\b','i').test(text))return null;
 for(const rule of rules)for(const item of members){
  if(rule.group!==item.group)continue;
  const actual=norm(text).replace(new RegExp('^(?:'+person+'|she|he)\\s+','i'),'')
   .replace(/^(?:is|was|were|are|will be|can|must)\s+/, '');
  if(predicate(actual)!==rule.predicate)continue;
  return {reason:'quantified_rule_applied_to_explicit_member',rule,item};
 }
 return null;
}
function inferRequirement(facts,claim,premise){
 if(claim.kind!=='compliance'||EXCEPTION.test(premise)||HEDGE.test(claim.clause))return null;
 const rules=facts.filter(x=>x.kind==='requirement'); if(rules.length!==1)return null;
 const rule=rules[0];const [qualifier,group]=rule.group.split(' ').length===2?rule.group.split(' '):[null,rule.group];
 const classes=facts.filter(x=>x.kind==='classified'&&x.group===group&&(!qualifier||x.qualifier===qualifier));
 const missing=facts.filter(x=>x.kind==='missing'&&(x.item===rule.item||x.item.split(' ').at(-1)===rule.item.split(' ').at(-1)));
 if(classes.length!==1||missing.length!==1)return null;
 if(!/\b(?:this|that|the)\s+/i.test(classes[0].clause))return null;
 return {reason:'explicit_class_requirement_not_met',rule,membership:classes[0],missing:missing[0]};
}
function inferMaterial(facts,claim,original){
 if(claim.kind!=='free_of'||EXCEPTION.test(original)||EXCEPTION.test(claim.clause)||HEDGE.test(claim.clause))return null;
 const present=facts.filter(x=>x.kind==='contains'&&x.material===claim.material&&new RegExp('\\b'+x.subject+'\\b','i').test(claim.clause));
 if(present.length!==1)return null;
 return {reason:'listed_component_incompatible_with_free_of_component',item:present[0]};
}
function inferPermission(facts,claim,original){
 if(claim.kind!=='permission'||EXCEPTION.test(original)||EXCEPTION.test(claim.clause))return null;
 const permissions=facts.filter(x=>x.kind==='permission'&&x.medium===claim.medium);if(permissions.length!==1)return null;
 const p=permissions[0];
 if(claim.window!==p.window && !(/^(?:those|these|the same) hours$/.test(claim.window)&&/\bhours\b/.test(p.window)))return null;
 return {reason:'permission_and_acceptance_same_payment_and_time',item:p};
}
function inferContinuingState(facts,claim,original){
 if(claim.kind!=='visible'||EXCEPTION.test(original))return null;
 const states=facts.filter(x=>x.kind==='state'&&x.subject===claim.subject&&x.persistent&&
  ['deleted','removed','suspended'].includes(x.state));
 if(states.length!==1||!/\bsame\s+/.test(claim.clause))return null;
 return {reason:'deleted_and_not_restored_vs_visible_same_item',item:states[0]};
}
function inferSurveyPopulation(facts,claim,premise){
 if(claim.kind!=='population'||!Number.isFinite(claim.count)||claim.count<=0||
    !Number.isFinite(claim.ageMax)||EXCEPTION.test(premise))return null;
 const zero=facts.filter(x=>x.kind==='population'&&x.count===0&&x.ageMax===claim.ageMax&&
  ['respondent','participant'].includes(x.role) && /\bsurvey\b/i.test(x.clause));
 if(zero.length!==1 || !/\b(?:that|this|the)\s+survey\b/i.test(claim.clause))return null;
 return {reason:'zero_vs_positive_count_in_same_age_and_survey',item:zero[0]};
}
function inferAge(facts,claim,premise){
 const threshold=facts.filter(x=>x.kind==='threshold'&&x.test==='age_less_than');
 const ages=facts.filter(x=>x.kind==='value'&&x.property==='age');
 if(threshold.length!==1||ages.length!==1||!Number.isFinite(threshold[0].limit)||!Number.isFinite(ages[0].value)||EXCEPTION.test(premise)||EXCEPTION.test(claim.clause))return null;
 // A conclusion explicitly expresses the same 'free' benefit as zero price.
 if(!/(?:\bfare\b.{0,55}\bzero\b|\bfare\b.{0,55}\b(?:£\s*0|free)\b|\b(?:ride|travel|admission)\s+is\s+free\b)/i.test(claim.clause))return null;
 const person=ages[0].value; if(person<0||person>120)return null;
 if(!/\b(?:him|her|them|that child|that person|the child)\b/i.test(claim.clause))return null;
 if(person>=threshold[0].limit)return null; // A one-way eligibility condition does not prohibit other discounts.
 return {reason:'stated_age_satisfies_free_eligibility_threshold',rule:threshold[0],age:ages[0]};
}
// Exported representation can be inspected independently of its verdict.
export function structurePropositions(premise,conclusion){
 const p=String(premise||''),c=String(conclusion||'');
 const facts=extractFacts(p),claim=conclusionFact(c);
 const record={premises:facts,conclusion:claim,relation:null};
 if(!p||!c||p.length>1600||c.length>400||QUOTE.test(p)||QUOTE.test(c)||HEDGE.test(c))return record;
 const material=inferMaterial(facts,claim,p);
 if(material){record.relation=verdict(claim.polarity?'contradictory_claims':'supported_conclusion',material.reason,facts,claim);return record;}
 const requirement=inferRequirement(facts,claim,p);
 if(requirement){record.relation=verdict(claim.polarity?'contradictory_claims':'supported_conclusion',requirement.reason,facts,claim);return record;}
 const permission=inferPermission(facts,claim,p);
 if(permission){record.relation=verdict(claim.polarity?'supported_conclusion':'contradictory_claims',permission.reason,facts,claim);return record;}
 const persistent=inferContinuingState(facts,claim,p);
 if(persistent){record.relation=verdict('contradictory_claims',persistent.reason,facts,claim);return record;}
 const count=inferSurveyPopulation(facts,claim,p);
 if(count){record.relation=verdict('contradictory_claims',count.reason,facts,claim);return record;}
 const age=inferAge(facts,claim,p);
 if(age){record.relation=verdict('supported_conclusion',age.reason,facts,claim);return record;}
 const membership=inferMembership(facts,claim,c,p);
 if(membership){record.relation=verdict('supported_conclusion',membership.reason,facts,claim);return record;}
 return record;
}
export function inferPropositionRelation(premise,conclusion){
 return structurePropositions(premise,conclusion).relation;
}