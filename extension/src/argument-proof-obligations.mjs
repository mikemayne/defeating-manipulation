// Explicit burden-of-proof mismatches in one-paragraph arguments.
// A missing derivation alone NEVER establishes a deficiency. Return a finding
// only when the conclusion visibly claims universal/ranking/precise certainty
// from an explicitly narrow, different kind of evidence.
const MAX_PREMISE=1200,MAX_CLAIM=340;
const HEDGE=/\b(?:might|may|could|possibly|perhaps|likely|appears?|seems?|suggests?|potentially|perhaps|estimate[ds]?|forecast\s+to|might\s+eventually|assuming|in theory)\b/i;
const QUOTED=/[“”"]/;
const EXPRESS_RULE=/\b(?:if|whenever|provided that|assuming that|only when|if and only if|because every|since every)\b/i;
const UNDERLYING_EVIDENCE=/\b(?:audit(?:ed)?|independent(?:ly)?\s+(?:verif(?:ied|ication)|assess(?:ed|ment)|test(?:ed|ing))|representative\s+survey|comprehensive\s+study|randomized|randomised|validated\s+simulation|measured|measurement|experiment(?:ally)?|certified|statistically\s+significant)\b/i;
const ALL_PREMISES=/\b(?:all|every|everybody|everyone|none|nobody|everywhere|throughout|the whole|the entire|all future|will never|will always|guarantee(?:s|d)?)\b/i;
const LOCAL_EVENT=/\b(?:added|bought|purchased|installed|repainted|redesigned|replaced|renewed|opened|launched|introduced|released|created|posted|published|donated|held|attended|planted|supplied|delivered|announced|changed|edited|updated|painted|repaired|ordered|commissioned|signed|fitted|issued|hired|recruited|presented|received|began|started|displayed|featured|provided|offered|removed|registered|submitted)\b/i;
const FINITE_OBSERVATION=/\b(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+|a single|a new|a first|one particular|the latest|some|a few)\b/i;
const UNIVERSAL=/\b(?:every|everybody|everyone|all|nobody|no one|never|no longer|not one|entire|whole|everywhere|nowhere|permanently|anywhere|all future|throughout the year|without exception)\b/i;
const GUARANTEE=/\b(?:guarantee(?:d|s)?|certain|inevitable|definite|will never|will always|must now|must have|will every|will all|no risk|no chance)\b/i;
const RANK=/\b(?:most (?:trusted|important|accessible|popular|effective|reliable|successful|valuable|accurate)|best|safest|number one|highest.ranked|nation's most|region's most)\b/i;
const EXPLICIT_PRECISION=/\b(?:exactly|precisely)\s+(?:\d+(?:\.\d+)?\s*(?:%|percent|degrees?|minutes?|hours?|days?|pounds?|\w+)|\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten)\b)/i;
const SCALE=/\b(?:next\s+\d+|next\s+few|every\s+future|throughout\s+(?:the\s+)?(?:next|coming)|forever|ever again|entire|every|all|nationwide|districtwide|regionwide|citywide|in the country|in the region|in the district|in Europe|across the country)\b/i;
const PLANNED=/\b(?:plans?|planning|propos(?:ed|al)|feasibility\s+stud(?:y|ies)|consultation|intention|draft|strategy|forecast|commissions? a study)\b/i;
const COMPLETED=/\b(?:already\s+(?:built|completed|finished|open|running|delivered)|have all been|has been|are now|is now|fully built|completed|finished|achieved|realised|realized|operational|open to the public)\b/i;
const DOCUMENTARY_EVIDENCE=/\b(?:report|review|audit|survey|research|analysis|financial statement|assessment)\b/i;
const SOURCE_SUPPORTS_PLAN=/\b(?:implemented|already built|already delivered|completed|fully funded|opened|finished|operational|now open|was constructed|has been completed)\b/i;

function statementCount(s){return s.split(/[.!?]+\s*/).filter(x=>x.trim()).length;}
function topicTerms(s){
 const stop=new Set('the a an and or but if all every each some many with from to for into of at in on now there are was were is has have it its this that their his her they he she which who what where who will should would could might may most very been as by after before during because so therefore thus hence shows showed says said gave made mean means proves prove no never every all'.split(' '));
 return new Set((s.toLowerCase().match(/[a-z][a-z-]{2,}/g)||[])
  .filter(x=>!stop.has(x)).map(x=>x.endsWith('ies')?x.slice(0,-3)+'y':x.endsWith('ed')&&x.length>5?x.slice(0,-2):x.endsWith('s')&&!x.endsWith('ss')?x.slice(0,-1):x));
}
function unmatchedOutcome(p,c){
 // A positive source fact that directly measures the outcome makes this
 // inference unsafe. Refuse to guess whether a measurement/rule is sufficient.
 const a=topicTerms(p),b=topicTerms(c);
 const shared=[...a].filter(x=>b.has(x));
 const conclusionOutcome=new Set([...b].filter(x=>
  /(?:trust|accur|risk|profit|poverty|satisf|pollut|recover|success|secure|safety|temperature|literacy|fair|access|available|convenien|on.time|guarantee|reliab|confus|malfunction|homeless|everywhere)/.test(x)));
 // Topic words may not indicate a metric, but do not overrule a directly
 // stated outcome if the source supplies explicit outcome evidence.
 return conclusionOutcome.size===0 || ![...conclusionOutcome].some(x=>a.has(x)) ? true:
  !UNDERLYING_EVIDENCE.test(p) && shared.length<=1;
}
function sameStatedMeasurement(p,c){
 const r=/\b(\d+(?:\.\d+)?)\s*(degrees?|percent|%|minutes?|hours?|litres?|metres?|kg|pounds?|dollars?|euros?)\b/gi;
 const a=[...p.matchAll(r)].map(x=>x[1]+'|'+x[2].toLowerCase());
 const b=[...c.matchAll(r)].map(x=>x[1]+'|'+x[2].toLowerCase());
 const shared=[...topicTerms(p)].filter(x=>topicTerms(c).has(x));
 return a.length>0&&b.length>0&&shared.length>=1&&a.some(x=>b.includes(x));
}
function supportedBySamePopulation(p,c){
 // Do not accidentally flag a restatement of a complete population fact.
 if(!ALL_PREMISES.test(p))return false;
 const a=topicTerms(p),b=topicTerms(c);
 const overlap=[...a].filter(x=>b.has(x));
 return overlap.length>=2;
}
export function inferExplicitProofObligationGap(premise,conclusion,{inferenceMarker=''}={}){
 if(typeof premise!=='string'||typeof conclusion!=='string'||
  premise.length>MAX_PREMISE||conclusion.length>MAX_CLAIM)return null;
 const p=premise.trim(),c=conclusion.trim();
 if(!p||!c||QUOTED.test(p)||QUOTED.test(c)||HEDGE.test(c)||
  EXPRESS_RULE.test(p)||EXPRESS_RULE.test(c)||
  statementCount(p)>1 || supportedBySamePopulation(p,c))return null;
 const finite=LOCAL_EVENT.test(p)||FINITE_OBSERVATION.test(p);
 if(!finite)return null;
 // A published report may contain additional evidence outside this excerpt.
 // Lack of a derived proof does not justify a red underline.
 if(DOCUMENTARY_EVIDENCE.test(p) && !PLANNED.test(p))return null;
 // Plan publication cannot by itself establish plan completion, even when
 // it is a detailed or properly published plan.
 if(PLANNED.test(p)&&COMPLETED.test(c)&&!SOURCE_SUPPORTS_PLAN.test(p))
  return {label:'unsupported_conclusion',reason:'plan_published_not_implemented',
   obligation:'verified_completion',observed:'proposal_or_plan'};
 // A specific observed or local event is not a statistically complete
 // ranking across a national/international comparison population.
 if(RANK.test(c)&&!UNDERLYING_EVIDENCE.test(p)&&!RANK.test(p)&&
   !/\b(?:rank(?:ed|ing)?|comparison|comparative|survey|census)\b/i.test(p))
  return {label:'unsupported_conclusion',reason:'local_event_not_comparative_ranking',
   obligation:'comparative_population_evidence',observed:'finite_local_event'};
 // An explicit 100%-scope claim about future events, worldwide outcomes,
 // or everyone is not warranted by a single modification/observation.
 if((UNIVERSAL.test(c)||GUARANTEE.test(c))&&
    (LOCAL_EVENT.test(p)||FINITE_OBSERVATION.test(p))&&
    (!ALL_PREMISES.test(p)||SCALE.test(c))&&
    unmatchedOutcome(p,c)&&
    !UNDERLYING_EVIDENCE.test(p))
  return {label:'unsupported_conclusion',reason:'finite_event_to_absolute_outcome',
   obligation:'complete_population_or_causal_rule',observed:'finite_local_event'};
 // Exact quantified causal results need a measurement, model, or a direct
 // relationship between the quantity in the source and claimed effect.
 if(EXPLICIT_PRECISION.test(c)&&
    (LOCAL_EVENT.test(p)||FINITE_OBSERVATION.test(p))&&
    !EXPLICIT_PRECISION.test(p)&&!UNDERLYING_EVIDENCE.test(p)&&
    !sameStatedMeasurement(p,c)&&
    unmatchedOutcome(p,c))
  return {label:'unsupported_conclusion',reason:'unmeasured_precise_causal_outcome',
   obligation:'quantitative_outcome_evidence',observed:'unrelated_action_or_count'};
 return null;
}