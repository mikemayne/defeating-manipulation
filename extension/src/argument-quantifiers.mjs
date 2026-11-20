// Conservative, open-class quantifier reasoning over source assertions.
// Source and conclusion describe the SAME class and predicate in the SAME scope.
// Neither missing proof nor a merely strong word is enough for a finding.
const MAX_TEXT=1600;
const QUOTED=/["“”]/;
const HEDGE=/\b(?:may|might|could|perhaps|possibly|probably|seems?|suggests?|apparently|assuming|unless)\b/i;
const CONDITIONAL=/\b(?:if|unless|provided that|supposing|only when)\b/i;
const EXCEPTION=/\b(?:except|apart from|other than|excluding|not all)\b/i;
const QUANT=/\b(not a single|at least one|one of|none of|not one|nobody from|every|each|all|no|some|several|one)\s+/gi;
const VERB=/\b(?:were|was|are|is|be|have|has|had|will|did|does|do|can|must|passed|failed|submitted|pruned|departed|attended|voted|scored|reached|remained|reported|completed|received|opened|closed|accepted|rejected|worked|left)\b/i;
const PREAMBLE=/\b(?:according to|the report says|the report states|the record shows|the notice says|it claims)\b/i;
const DAYS=/\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|yesterday|today|tomorrow|midnight|morning|afternoon|evening|night)\b/gi;
const CLOCK=/\b(?:at\s+)?\d{1,2}:\d{2}\b/g;
const STOP_GROUP=new Set('the this that these those a an of'.split(' '));
const NUMBER_WORDS=new Set('one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty thirty forty fifty hundred'.split(' '));

function singular(word){
 if(word.endsWith('ies')&&word.length>4)return word.slice(0,-3)+'y';
 if(word.endsWith('ches')||word.endsWith('shes')||word.endsWith('sses'))return word.slice(0,-2);
 if(word.endsWith('s')&&!word.endsWith('ss')&&word.length>3)return word.slice(0,-1);
 return word;
}
function normalizeGroup(raw){
 const tokens=raw.toLowerCase().replace(/[’]/g,"'").replace(/[^a-z0-9\s-]/g,' ').replace(/-/g,' ').split(/\s+/).filter(Boolean)
  .filter(t=>!STOP_GROUP.has(t)&&!NUMBER_WORDS.has(t)&&!/^\d+$/.test(t));
 if(!tokens.length||tokens.length>9)return null;
 return tokens.map(singular).join(' ');
}
function scope(text){
 const t=text.toLowerCase();
 const days=[...t.matchAll(DAYS)].map(m=>m[0]);
 const hours=[...t.matchAll(CLOCK)].map(m=>m[0].replace(/^at\s+/,''));
 const regions=[...t.matchAll(/\b(?:in|at|from)\s+(?:the|this|that|same)?\s*(?:section|room|zone|ward|group)\s+([a-z0-9-]+)\b/g)].map(m=>m[1]);
 const months=[...t.matchAll(/\b(?:in|during|on)\s+(?:the|this|same)?\s*(january|february|march|april|may|june|july|august|september|october|november|december)\b/g)].map(m=>m[1]);
 return {days,hours,regions,months};
}
function scopeCompatible(p,c){
 const a=scope(p),b=scope(c);
 for(const key of ['days','hours','regions','months']){
  if(a[key].length>1||b[key].length>1)return false;
  if(a[key].length&&b[key].length&&a[key][0]!==b[key][0])return false;
  // An unqualified conclusion can omit a prior time, but a conclusion with
  // a new time cannot acquire evidence from an unqualified different event.
  if(!a[key].length&&b[key].length&&!/\b(?:same|that|those|the)\b/i.test(c))return false;
 }
 return true;
}
function canonicalPredicate(raw){
 let p=raw.toLowerCase().replace(/[,.;!?]+$/,'').replace(/[’]/g,"'").trim();
 if(!p||p.length>110)return null;
 // Ignore explicit relative time and section scopes after parsing them above.
 p=p.replace(/\b(?:yesterday|today|tomorrow)\b/g,'')
  .replace(/\b(?:during|on|at|throughout|in)\s+(?:the|that|this|same)?\s*(?:drill|inspection|briefing|test|session|meeting|event|period|day|shift|week|month|year|night|monday|tuesday|wednesday|thursday|friday|saturday|sunday|section\s+[a-z0-9]+)\b.*$/,'')
  .replace(/\s+/g,' ').trim();
 if(!p)return null;
 let polarity=true;
 if(/^(?:were|was|are|is|be|have|has|had|will be|did|does|do)\s+/.test(p))p=p.replace(/^(?:were|was|are|is|be|have|has|had|will be|did|does|do)\s+/, '');
 if(/^(?:not|never|did not|was not|were not|is not|are not)\b/.test(p)){
  polarity=false;p=p.replace(/^(?:not|never|did not|was not|were not|is not|are not)\s+/, '');
 }
 if(/^left\s+un[a-z]/.test(p))p=p.replace(/^left\s+/, '');
 if(/^failed\s+to\s+/.test(p)){polarity=!polarity;p=p.replace(/^failed\s+to\s+/, '');}
 if(/^(?:unlocked|unpruned|unaccepted|unapproved|unattended)$/.test(p)){
  polarity=!polarity;p=p.slice(2);
 }
 const opposite={passed:['pass',true],failed:['pass',false],locked:['lock',true],unlocked:['lock',false],pruned:['prune',true],unpruned:['prune',false],accepted:['accept',true],rejected:['accept',false],attended:['attend',true],unattended:['attend',false],submitted:['submit',true],departed:['depart',true],closed:['close',true],opened:['open',true]};
 const words=p.split(/\s+/);
 if(Object.hasOwn(opposite,words[0])){
  const [stem,affirm]=opposite[words[0]];
  words[0]=stem;polarity=polarity===affirm;
 }else if(words[0]==='submit'||words[0]==='pass'||words[0]==='prune'){
  // Already canonical infinitive after 'failed to'.
 }else if(words[0]==='not'){
  polarity=!polarity;words.shift();
 }
 if(!words.length)return null;
 const rest=words.join(' ').replace(/\b(?:the|that|this|same)\b/g,'').replace(/\s+/g,' ').trim();
 return rest?{predicate:rest,polarity}:null;
}
function quantified(text){
 const original=String(text||'');
 const out=[];
 for(const match of original.matchAll(QUANT)){
  const prefix=original.slice(Math.max(0,match.index-16),match.index);
  // Avoid quoted or explicitly conditional assertions.
  if(/\b(?:not|if|unless|whether)\s*$/.test(prefix.toLowerCase()))continue;
  const after=original.slice(match.index+match[0].length).split(/[.!?;]/,1)[0].trim();
  const verb=VERB.exec(after);
  if(!verb||verb.index<3||verb.index>105)continue;
  const group=normalizeGroup(after.slice(0,verb.index));
  const pred=canonicalPredicate(after.slice(verb.index));
  if(!group||!pred)continue;
  const quant=match[1].toLowerCase();
  const universal=/^(?:all|every|each)$/.test(quant);
  const none=/^(?:none of|no|not a single|nobody from|not one)$/.test(quant);
  const exists=/^(?:at least one|one of|one|some|several)$/.test(quant);
  if(!universal&&!none&&!exists)continue;
  out.push({group,predicate:pred.predicate,polarity:pred.polarity,quantifier:none?'none':universal?'all':'exists',source:original.slice(match.index,match.index+match[0].length+after.length),span:match.index});
  if(out.length>=6)break;
 }
 return out;
}
export function extractQuantifiedPropositions(text){
 if(typeof text!=='string'||text.length>MAX_TEXT)return [];
 return quantified(text);
}
export function inferQuantifierRelation(premise,conclusion){
 if(typeof premise!=='string'||typeof conclusion!=='string'||premise.length>MAX_TEXT||conclusion.length>400||
  QUOTED.test(premise)||QUOTED.test(conclusion)||HEDGE.test(conclusion)||
  CONDITIONAL.test(premise)||CONDITIONAL.test(conclusion)||EXCEPTION.test(premise))return null;
 const claims=quantified(conclusion),facts=quantified(premise);
 if(claims.length!==1||facts.length===0)return null;
 for(const a of facts)for(const b of claims){
  if(a.group!==b.group||a.predicate!==b.predicate||!scopeCompatible(a.source,b.source))continue;
  // ALL(P) conflicts with EXISTS(not P); NONE(P) conflicts with EXISTS(P).
  const contradicted=(a.quantifier==='all'&&b.quantifier==='exists'&&a.polarity!==b.polarity)||
   (a.quantifier==='none'&&b.quantifier==='exists'&&a.polarity===b.polarity)||
   (a.quantifier==='exists'&&b.quantifier==='none'&&a.polarity===b.polarity);
  if(contradicted)return {label:'contradictory_claims',reason:'quantified_predicate_conflict',
   chain:[{type:'quantified_premise',...a},{type:'quantified_conclusion',...b},
    {type:'rule',operation:'universal_existential_conflict'}],verified:true};
 }
 return null;
}