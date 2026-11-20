// Conservative entity coreference for local NLI inputs only.
// Original text, source offsets, quotations and deterministic evidence remain untouched.
// Only an explicitly linked *single* named person can become "the candidate" etc.
const ROLES="candidate|applicant|student|resident|member|employee|delegate|visitor|subscriber|customer|councillor|volunteer";
const IGNORE=new Set("A An All Any Both But By Each Every For From He Her His I If In It Its My No None Not Our She So Some That The Their Then There These They This Those To We When Where While Who Why You Your Therefore Thus Consequently Accordingly However Since Because Given Meanwhile".split(" "));
const DAYS=new Set("Monday Tuesday Wednesday Thursday Friday Saturday Sunday January February March April May June July August September October November December".split(" "));
const VERBS=/^(?:is|was|were|has|had|will|would|can|could|did|does|do|remains?|became|joined|presented|submitted|applied|entered|passed|completed|attended|received|spoke|talked|said|told|asked|met|called|helped|finished|won|voted|studied|worked|accepted|shortlisted)\b/i;
const OTHER=/\b(?:another|someone else|other person|other candidate|other applicant|a second person|interviewer|reporter|colleague|friend|sister|brother|mother|father|teacher|manager|assistant|supervisor|neighbour|neighbor)\b/i;
const ESCAPE=/[.*+?^$()|[\]{}\\]/g;
function properNames(text) {
 const names=new Set(),tokens=/\b([A-Z][a-z]{1,25})(?:\s+([A-Z][a-z]{1,25}))?\b/g;
 let m;
 while((m=tokens.exec(text))) {
  if(IGNORE.has(m[1])||DAYS.has(m[1]))continue;
  const second=m[2]&&!IGNORE.has(m[2])&&!DAYS.has(m[2])?m[2]:null;
  names.add(second?m[1]+" "+second:m[1]);
 }
 return [...names];
}
function findRole(text,name) {
 const e=name.replace(ESCAPE,"\\$&");
 const direct=[
  new RegExp("\\b"+e+"\\s+(?:is|was|became|remains)\\s+(?:a|an|the)\\s+(?:shortlisted\\s+)?("+ROLES+")\\b","i"),
  new RegExp("\\b"+e+"\\s*,\\s*(?:a|an|the)\\s+(?:shortlisted\\s+)?("+ROLES+")\\b","i"),
  new RegExp("\\b(?:the|a|an)\\s+("+ROLES+")\\s+"+e+"\\b","i")
 ];
 for(const p of direct){const m=p.exec(text);if(m)return m[1].toLowerCase();}
 const listed=new RegExp("\\b"+e+"\\s+(?:is|was)\\s+(?:on|in)\\s+(?:that|the|this)\\s+shortlist\\b","i").test(text);
 if(listed) {
  const m=/\b(?:all|every)\s+(?:(?:the|those)\s+)?(?:(?:shortlisted)\s+)?(candidates|applicants)\b.{0,75}\bshortlist\b/i.exec(text);
  if(m)return m[1].replace(/s$/,"");
 }
 return null;
}
function change(text,name,canonical) {
 const e=name.replace(ESCAPE,"\\$&"),role=canonical.slice(4);
 // "the candidate Ada" is already a direct role label; avoid duplicating it.
 let transformed=text.replace(new RegExp("\\b(?:the|a|an)\\s+"+role+"\\s+"+e+"\\b","gi"),canonical);
 // Retain explicit alias declarations. "Ada is a candidate" conveys the
 // identity link; transforming it into "the candidate is a candidate" does not.
 const aliases=[];
 transformed=transformed.replace(new RegExp("\\b"+e+"\\s+(?:is|was|became|remains)\\s+(?:a|an|the)\\s+"+role+"\\b","gi"),part=>{
  const tag="\uE000"+aliases.length+"\uE001";aliases.push(part);return tag;
 });
 transformed=transformed.replace(new RegExp("\\b"+e+"\\b","g"),canonical)
  .replace(/\b(?:she|he)\b/gi,canonical);
 transformed=transformed.replace(/\uE000(\d+)\uE001/g,(_full,n)=>aliases[Number(n)]);
 return transformed.replace(/(^|[.!?]\s+)(the\s+(?:candidate|applicant|student|resident|member|employee|delegate|visitor|subscriber|customer|councillor|volunteer))\b/g,
  (_whole,prefix,label)=>prefix+label.charAt(0).toUpperCase()+label.slice(1));
}
/** Resolve a single role-linked name and unambiguous subject pronouns. */
export function normaliseEntitiesForNli(argument,hypothesis) {
 const premise=argument?.premise,claim=typeof hypothesis==="string"?hypothesis:argument?.conclusion?.text;
 if(typeof premise!=="string"||typeof claim!=="string")
  return {premise:premise||"",hypothesis:claim||"",changed:false,reason:"invalid"};
 const baseline={premise,hypothesis:claim,changed:false,reason:"unchanged"};
 const context=premise+" "+claim;
 if(context.length>1600||/["“”]/.test(context)||OTHER.test(context))
  return {...baseline,reason:"ambiguous_or_quoted"};
 const names=properNames(context);
 if(names.length!==1)return {...baseline,reason:"not_one_named_person"};
 const name=names[0],role=findRole(premise,name);
 if(!role)return {...baseline,reason:"role_not_established"};
 const escaped=name.replace(ESCAPE,"\\$&");
 const occurrence=new RegExp("\\b"+escaped+"\\b","i").exec(premise);
 const tail=occurrence?premise.slice(occurrence.index+occurrence[0].length).trimStart():"";
 if(!VERBS.test(tail)&&
    !new RegExp("\\b(?:the|a|an)\\s+(?:"+ROLES+")\\s+"+escaped+"\\b","i").test(premise))
  return {...baseline,reason:"name_not_subject"};
 const canonical="the "+role;
 const normalizedPremise=change(premise,name,canonical);
 const normalizedClaim=change(claim,name,canonical);
 if(normalizedPremise===premise&&normalizedClaim===claim)return baseline;
 return {premise:normalizedPremise,hypothesis:normalizedClaim,changed:true,
  reason:"unique_named_role",name,canonical};
}
/** Apply the same proven entity mapping to an individual premise for NLI. */
export function normaliseEntityTextForNli(text,resolution) {
 if(typeof text!=="string"||!resolution?.changed)return text;
 return change(text,resolution.name,resolution.canonical);
}
