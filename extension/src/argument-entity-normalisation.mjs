// Open-class, conservative reference normalisation for local NLI inputs ONLY.
// Extract aliases from the words in the argument; no fixed occupations/roles.
// Do not alter source text, highlighting offsets or deterministic evidence checks.
// Do not infer that a person belongs to a group merely by being on a list.

const NON_NAMES = new Set((
 'A An All Any Both But By Each Every For From He Her His I If In It Its My No None Not Our ' +
 'She So Some That The Their Then There These They This Those To We When Where While Who Why ' +
 'You Your Therefore Thus Consequently Accordingly However Since Because Given Meanwhile ' +
 'Monday Tuesday Wednesday Thursday Friday Saturday Sunday January February March April May ' +
 'June July August September October November December'
).split(/\s+/));
const ESC = /[.*+?^${}()|[\]\\]/g;
const VERB = /^(?:is|was|were|has|had|will|would|can|could|did|does|do|became|remains?|joined|applied|entered|passed|completed|attended|received|spoke|said|told|asked|met|called|helped|finished|won|voted|studied|worked|accepted|shortlisted|submitted|returned|visited|wrote|reported|explained|presented|served|volunteered)\b/i;
const ROLE_BREAK = /\b(?:who|whom|whose|which|that|because|although|but|and|or|for|on|in|at|from|with|to|of|by|under|over|after|before|during|when|while|where|until|since|has|have|had|is|are|was|were|will|would|can|could|may|might|must|should|does|did|do|said|says|asked|told|joined|worked|spoke|submitted|applied|completed|finished)\b/i;
const PRONOUN = /\b(?:he|she)\b/i;

const escape = text => text.replace(ESC, '\\$&');
function namesIn(text) {
 const names=new Set();
 const pattern=/\b([A-Z][a-z]{1,24})(?:[ \t]+([A-Z][a-z]{1,24}))?\b/g;
 for(const m of text.matchAll(pattern)) {
  if(NON_NAMES.has(m[1])) continue;
  const second=m[2] && !NON_NAMES.has(m[2]) ? m[2] : null;
  names.add(second ? m[1]+' '+second : m[1]);
 }
 return [...names];
}
// Preserve enough descriptive words for "the marine biologist" and
// "the independent safety auditor"; we don't know professions in advance.
function nounPhrase(fragment) {
 const before=String(fragment).split(/[,.;!?\n]/,1)[0].trim();
 const tokens=before.match(/^[a-z][a-z-]*(?:\s+[a-z][a-z-]*){0,4}/i)?.[0];
 if(!tokens)return null;
 let words=tokens.toLowerCase().split(/\s+/);
 const stop=words.findIndex(w=>ROLE_BREAK.test(w));
 if(stop===0)return null;
 if(stop>0)words=words.slice(0,stop);
 if(words.length===0 || words.length>4)return null;
 // An identity label must end in a plausible open-class noun. A bare
 // evaluative / temporal / quantifier phrase isn't an identity link.
 const last=words[words.length-1];
 if(last.length<3 || /^(?:one|two|three|other|same|new|old|very|more|best|least|first|second|kind|sort)$/i.test(last))return null;
 return words.join(' ');
}
function singular(text) {
 const parts=text.split(' '),last=parts.pop();
 let noun=last;
 if(/ies$/.test(last) && last.length>4) noun=last.slice(0,-3)+'y';
 else if(/(?:ches|shes|sses|xes|zes)$/.test(last))noun=last.slice(0,-2);
 else if(/s$/.test(last)&&!/(?:ss|us|is)$/.test(last))noun=last.slice(0,-1);
 parts.push(noun);
 return parts.join(' ');
}
function labelsFor(text,name) {
 const escaped=escape(name),found=new Set();
 const add=part=>{const result=nounPhrase(part);if(result)found.add(result);};
 // Person is explicitly a <free-text description>.
 const pred=new RegExp('\\b'+escaped+'\\s+(?:is|was|became|remains)\\s+(?:an?|the)\\s+([^.!?;\\n]{3,90})','gi');
 for(const m of text.matchAll(pred))add(m[1]);
 // Person, a <free-text description>, ...
 const app=new RegExp('\\b'+escaped+'\\s*,\\s*(?:an?|the)\\s+([^,;.!?\\n]{3,60})\\s*,','gi');
 for(const m of text.matchAll(app))add(m[1]);
 // The <free-text description> Person ... (single NP, no title vocabulary).
 const pre=new RegExp('\\b(?:an?|the)\\s+([a-z][a-z-]*(?:\\s+[a-z][a-z-]*){0,3})\\s+'+escaped+'\\b','gi');
 for(const m of text.matchAll(pre))add(m[1]);
 // Person served/works/volunteers as a <free-text description>.
 const as=new RegExp('\\b'+escaped+'\\s+(?:served|works?|volunteered|acts?|worked)\\s+as\\s+(?:an?|the)\\s+([^,;.!?\\n]{3,70})','gi');
 for(const m of text.matchAll(as))add(m[1]);
 // Explicit group membership: Person is one of the <plural group>.
 const group=new RegExp('\\b'+escaped+'\\s+(?:is|was)\\s+one\\s+of\\s+(?:the|these|those)\\s+([a-z][a-z-]*(?:\\s+[a-z][a-z-]*){0,2})','gi');
 for(const m of text.matchAll(group)) {const phrase=nounPhrase(m[1]);if(phrase)found.add(singular(phrase));}
 return [...found];
}
function otherPossiblePerson(text,name,label) {
 const protectedTitle=label?text.replace(new RegExp('\\b(?:the|an?)\\s+'+escape(label)+'\\s+'+escape(name)+'\\b','gi'), ' EXPLICIT_PERSON '):text;
 const withoutName=protectedTitle.replace(new RegExp('\\b'+escape(name)+'\\b','g'), '');
 // Another grammatical actor can be named through a noun phrase rather
 // than a proper name. A pronoun is then not necessarily the named person's.
 const nounActor=/\b(?:the|a|an|another)\s+([a-z][a-z-]{2,})(?:\s+[a-z][a-z-]{2,})?\s+(?:said|asked|told|replied|spoke|interviewed|instructed|helped|met|advised|called|argued|claimed|answered)\b/gi;
 for(const m of withoutName.matchAll(nounActor)) {
  // A bare role phrase might name somebody else, even when it matches
  // the explicit role of our named person. Do not guess its referent.
  return true;
 }
 // With an additional object person, e.g. "Ada talked to the reporter",
 // the next "she" may refer to either participant. Prefer abstention.
 if(/\b(?:spoke|talked|asked|told|met|replied|answered)\s+(?:(?:to|with|for|at)\s+)?(?:the|a|an|another)\s+[a-z][a-z-]+\b/i.test(withoutName))return true;
 // Any additional subject performing an independent action might be a
 // person. The new actor's occupation is deliberately NOT hardcoded.
 if(/\bwrote\s+(?:to|with)\s+(?:the|a|an|another)\s+[a-z][a-z-]+\b/i.test(withoutName))return true;
 if(/\b(?:the|a|an|another)\s+[a-z][a-z-]{2,}(?:\s+[a-z][a-z-]{2,})?\s+(?:entered|arrived|left|worked|walked|approached|joined|spoke|applied|voted|called|replied|asked|said|met|helped|finished|signed|attended)\b/i.test(withoutName))return true;
 return false;
}
function aliasProtected(text,name,label) {
 const segments=[];
 const e=escape(name);
 if(label){
  // Keep the original role assertion intact as an explicit premise.
  const re=new RegExp('\\b'+e+'\\s+(?:is|was|became|remains)\\s+(?:a|an|the)\\s+'+escape(label)+'\\b','gi');
  text=text.replace(re,part=>{const tag='\uE100'+segments.length+'\uE101';segments.push(part);return tag;});
  const app=new RegExp('\\b'+e+'\\s*,\\s*(?:a|an|the)\\s+'+escape(label)+'\\s*,','gi');
  text=text.replace(app,part=>{const tag='\uE100'+segments.length+'\uE101';segments.push(part);return tag;});
  const group=new RegExp('\\b'+e+'\\s+(?:is|was)\\s+one\\s+of\\s+(?:the|these|those)\\s+'+escape(label)+'s?\\b','gi');
  text=text.replace(group,part=>{const tag='\uE100'+segments.length+'\uE101';segments.push(part);return tag;});
 }
 return {text,segments};
}
function normaliseText(text,name,label,{rewritePronouns}={}) {
 let protectedText=aliasProtected(text,name,label),out=protectedText.text;
 const canonical=label?'the '+label:name;
 if(label){
  // "the survey researcher Maya" -> "the survey researcher".
  const pre=new RegExp('\\b(?:the|an?|this)\\s+'+escape(label)+'\\s+'+escape(name)+'\\b','gi');
  out=out.replace(pre,canonical);
  out=out.replace(new RegExp('\\b'+escape(name)+'\\b','g'),canonical);
 }
 if(rewritePronouns){
  // Subject pronouns only, at clear sentence/clause boundaries. Do not
  // rewrite "she" in "Ada asked if she had..." or reported quotations.
  out=out.replace(/(^|[.!?]\s+|;\s*|,\s*(?:so|therefore|thus)\s+)(he|she)\b/gim,
   (_m,prefix,pronoun)=>prefix+(pronoun[0]===pronoun[0].toUpperCase()?
    canonical[0].toUpperCase()+canonical.slice(1):canonical));
 }
 out=out.replace(/\uE100(\d+)\uE101/g,(_m,i)=>protectedText.segments[Number(i)]);
 return out;
}
/**
 * Normalize a single, unambiguous named entity and explicit description.
 * This is not unrestricted coreference resolution. Null changes are safe.
 */
export function normaliseEntitiesForNli(argument,hypothesis) {
 const original=argument?.premise;
 const claim=typeof hypothesis==='string'?hypothesis:argument?.conclusion?.text;
 const baseline={premise:original||'',hypothesis:claim||'',changed:false,reason:'unchanged'};
 if(typeof original!=='string'||typeof claim!=='string')return {...baseline,reason:'invalid_input'};
 const context=original+' '+claim;
 if(context.length>1600||/["“”‘’]/.test(context))return {...baseline,reason:'quoted_or_long'};
 const people=namesIn(context);
 if(people.length!==1)return {...baseline,reason:'unresolved_multiple_or_missing_names'};
 const name=people[0],e=escape(name);
 // Require grammatical evidence that the capitalised token names an actor;
 // do not treat a capitalised place/word as a person automatically.
 const anchor=new RegExp('\\b'+e+'\\s+'+VERB.source.slice(1),'i');
 const explicitTitle=new RegExp('\\b(?:the|an?)\\s+[a-z][a-z-]+(?:\\s+[a-z][a-z-]+){0,3}\\s+'+e+'\\b','i');
 const appositive=new RegExp('\\b'+e+'\\s*,\\s*(?:a|an|the)\\s+[a-z][a-z-]+','i');
 if(!anchor.test(original)&&!explicitTitle.test(original)&&!appositive.test(original))return {...baseline,reason:'no_person_anchor'};
 const labels=labelsFor(original,name);
 if(labels.length>1)return {...baseline,reason:'multiple_possible_descriptions'};
 const label=labels[0]||null;
 const containsPronoun=PRONOUN.test(context);
 if(containsPronoun&&otherPossiblePerson(context,name,label))return {...baseline,reason:'other_possible_actor'};
 const both=/\bhe\b/i.test(context)&&/\bshe\b/i.test(context);
 if(both)return {...baseline,reason:'different_pronoun_referents'};
 const premise=normaliseText(original,name,label,{rewritePronouns:containsPronoun});
 const normalizedClaim=normaliseText(claim,name,label,{rewritePronouns:containsPronoun});
 if(premise===original&&normalizedClaim===claim)return baseline;
 return {premise,hypothesis:normalizedClaim,changed:true,
   name,canonical:label?'the '+label:name,reason:label?'explicit_noun_phrase':'single_person_pronoun'};
}
/** Apply the same *resolved* mapping to each separate NLI premise. */
export function normaliseEntityTextForNli(text,resolution) {
 if(typeof text!=='string'||!resolution?.changed)return text;
 return normaliseText(text,resolution.name,
   resolution.canonical===resolution.name?null:resolution.canonical.replace(/^the\s+/,''),
   {rewritePronouns:true});
}