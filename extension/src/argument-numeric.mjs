// Bounded, evidence-grounded arithmetic for paragraph arguments.
// JS owns all calculations. Unresolved object, time or unit alignment abstains.
// This module never accesses web content, changes source offsets, or guesses quantities.

const WORDS = Object.freeze({zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20,thirty:30,forty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90,hundred:100,thousand:1000});
const DIGIT = String.raw`(?:\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)`;
const WRITTEN = String.raw`(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)(?:[ -](?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand))*`;
const QUANTITY = String.raw`(?:minus\s+)?(?:${DIGIT}|${WRITTEN})`;
const HEDGE=/\b(?:may|might|possibly|perhaps|probably|apparently|could|suggests?|potentially|assuming|unless)\b/i;
const QUOTED=/[“”"‘’]/;
const EXCEPT=/\b(?:except|excluding|other than|different|separate|instead of|another|revised|originally|previously|initially)\b/i;
const FLOAT_EPS=1e-8;
const STOP=new Set('the a an this that those these its their our my your his her same final total exact exactly recorded stated according to report reports lists listed shows showed says said has had have was were is are of for with by at on in during as from to and or one each both every all amount number value count reading quantity there then thus therefore hence so plus minus times multiplied multiply subtract subtracted divided compared measured record entry per'.split(' '));
const MEASURE_UNIT = Object.freeze({'£':'GBP','$':'USD','€':'EUR','pound':'GBP','pounds':'GBP','pence':'GBP_pence','cent':'cent','cents':'cent','dollar':'USD','dollars':'USD','litre':'L','litres':'L','liter':'L','liters':'L','ml':'mL','millilitre':'mL','millilitres':'mL','kg':'kg','kilogram':'kg','kilograms':'kg','g':'g','grams':'g','gram':'g','cm':'cm','centimetres':'cm','centimeters':'cm','metres':'m','meters':'m','m':'m','minutes':'min','minute':'min','hours':'h','hour':'h','seconds':'s','second':'s','°c':'C','degrees':'degree','%':'percent','percent':'percent'});
const SCOPE=/\b(?:today|tomorrow|yesterday|tonight|this week|next week|last week|this month|next month|last month|last year|this year|next year|on monday|on tuesday|on wednesday|on thursday|on friday|on saturday|on sunday|in january|in february|in march|in april|in may|in june|in july|in august|in september|in october|in november|in december|first year|second year|in 20\d\d|during 20\d\d)\b/gi;
const SCOPE_PRON=/\b(?:same|that|those)\s+(?:day|week|month|year|time|period|date|event|inspection|test)\b/i;
const CONTENT = /[a-z]+(?:'[a-z]+)?/g;
const DISTINCT=/\b(?:only|at least|at most|approximately|around|about|more than|less than|under|over)\b/i;

function clean(text){return String(text||'').toLowerCase().replace(/[’]/g,"'").replace(/\s+/g,' ').trim();}
export function parseNumber(input){
 if(typeof input!=='string'&&typeof input!=='number')return null;
 const s=clean(input).replace(/,/g,'');
 if(/^-?\d+(?:\.\d+)?$/.test(s)){const n=Number(s);return Number.isFinite(n)?n:null;}
 const parts=s.replace(/-/g,' ').split(' ');
 if(parts[0]==='minus'){const n=parseNumber(parts.slice(1).join(' '));return n===null?null:-n;}
 if(parts.length>7 || parts.some(x=>!Object.hasOwn(WORDS,x)))return null;
 let sum=0,part=0;
 for(const word of parts){
  const n=WORDS[word];
  if(word==='hundred'){if(part===0)return null;part*=100;}
  else if(word==='thousand'){if(part===0)return null;sum+=part*1000;part=0;}
  else part+=n;
 }
 return sum+part;
}
function normalizeUnit(s){
 const normalized=clean(s).replace(/\.$/,'');
 if(Object.hasOwn(MEASURE_UNIT,normalized))return MEASURE_UNIT[normalized];
 if(/^[a-z][a-z-]{2,25}$/.test(normalized))return normalized.replace(/ies$/,'y').replace(/s$/,'');
 return null;
}
function factor(unit){if(unit==='GBP_pence'||unit==='cent')return 0.01;if(unit==='mL'||unit==='g')return .001; if(unit==='h')return 60;return 1;}
function baseUnit(unit){return {GBP_pence:'GBP',cent:'USD',mL:'L',g:'kg',h:'min'}[unit]??unit;}
function quantize(v,unit){return unit==='GBP'||unit==='USD'||unit==='EUR'?Math.round(v*100):v;}
function sameNumeric(x,y){return Math.abs(x-y)<=FLOAT_EPS*Math.max(1,Math.abs(x),Math.abs(y));}
export function arithmeticComparison(a,b,operation='eq'){
 if(!a||!b||a.unit!==b.unit||!Number.isFinite(a.value)||!Number.isFinite(b.value))return null;
 const av=a.value,bv=b.value;
 return {eq:sameNumeric(av,bv),ne:!sameNumeric(av,bv),gt:av>bv&&!sameNumeric(av,bv),lt:av<bv&&!sameNumeric(av,bv),gte:av>bv||sameNumeric(av,bv),lte:av<bv||sameNumeric(av,bv)}[operation]??null;
}
function mentions(text){
 // Scan the ORIGINAL string so the exported source spans are exact even for
 // irregular whitespace, punctuation and mixed-case proper names.
 const t=String(text||''),matches=[];
 const re=new RegExp(String.raw`(?<![a-z0-9])(?:(£|\$|€)\s*)?(${QUANTITY})(?![a-z0-9])(?:\s*(°c|%|[a-z]+))?`,'gi');
 let m;
 while((m=re.exec(t))){
  const rawNumber=m[2],v=parseNumber(rawNumber);
  if(v===null)continue;
  let unit= m[1] ? normalizeUnit(m[1]) : normalizeUnit(m[3]||'');
  if(!m[1] && m[3] && STOP.has(m[3].toLowerCase()))unit=null;
  if(unit && /^\d/.test(m[3]||''))unit=null;
  if(!unit && !m[1] && /^\d{1,2}$/.test(rawNumber) && /^\s*:\s*\d{2}/.test(t.slice(re.lastIndex)))continue; // clock components
  if(!unit && (/\b(?:unit|sample|checkout|platform|chapter|level|room|model|service|route)\s+$/.test(t.slice(Math.max(0,m.index-12),m.index))))continue; // identifiers
  if(!unit && /^\d{4}$/.test(rawNumber) && Number(rawNumber)>=1900&&Number(rawNumber)<=2100)continue; // year
  if(!unit && /^\d{1,2}$/.test(rawNumber) && /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/.test(t.slice(re.lastIndex,re.lastIndex+13)))continue; // calendar date
  const val=quantize(v*factor(unit),baseUnit(unit));
  // Regex permits arbitrary open-class units. A following preposition is
  // context, not a unit; leave it available for noun-phrase coreference.
  const consumedStop=m[3]&&!m[1]&&STOP.has(m[3].toLowerCase())?m[3]:
   (m[3]&&m[1]&&STOP.has(m[3].toLowerCase())?m[3]:null);
  const end=consumedStop ? re.lastIndex-consumedStop.length-1 : re.lastIndex;
  matches.push({value:val,unit:baseUnit(unit),raw:t.slice(m.index,end),start:m.index,end,
   contextBefore:t.slice(Math.max(0,m.index-70),m.index).toLowerCase(),contextAfter:t.slice(end,end+70).toLowerCase()});
 }
 return matches;
}
function labels(text){
 return new Set((clean(text).match(CONTENT)||[]).filter(x=>x.length>2&&!STOP.has(x)).map(x=>x.replace(/ies$/,'y').replace(/s$/,'')));
}
function sharedTopic(p,c){const a=labels(p),b=labels(c);let count=0;for(const x of a)if(b.has(x))count++;return count;}
function timeCompatible(p,c){
 const source=[...clean(p).matchAll(SCOPE)].map(x=>x[0]);
 const target=[...clean(c).matchAll(SCOPE)].map(x=>x[0]);
 if(source.length>1||target.length>1){
  // Explicit multiple times may be a valid comparison, but cannot be assumed same scope.
  return target.length===0;
 }
 // Explicit different named localities or distinct numbered cohorts cannot be collapsed.
 const place=(x)=>[...String(x).matchAll(/\b(?:in|at|from)\s+(?:the\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g)].map(y=>y[1]);
 const a=place(p),b=place(c);if(a.length===1&&b.length===1&&a[0]!==b[0])return false;
 if(!source.length||!target.length)return true;
 return source[0]===target[0]||SCOPE_PRON.test(c);
}
function valueResult(label,reason,premise,claim,steps=[]){return {label,reason,chain:[{type:'source',text:premise},{type:'goal',text:claim},...steps],verified:true};}

// A single exact quantity compared with a single exact quantity in the same
// subject/unit/scope. No inference when the unit is missing on one side, or
// when equality/total status is not established in the supplied statements.
function exactValue(p,c){
 const source=mentions(p),claim=mentions(c);
 if(source.length!==1||claim.length!==1||!timeCompatible(p,c)||EXCEPT.test(p)||EXCEPT.test(c)||
   /\b(?:minimum|maximum|at least|at most|no less than|no more than|lower bound|upper bound)\b/i.test(p))return null;
 const x=source[0],y=claim[0];if(!x.unit||x.unit!==y.unit)return null;
 if(!/\b(?:exactly|final|total|record(?:s|ed)?|show(?:s|ed)?|lists?|states?|fixes?|allocated?|contains?|holds?|has|had|was|were|is|are|equals?)\b/i.test(p))return null;
 if(!/\b(?:exactly|final|total|record(?:s|ed)?|show(?:s|ed)?|lists?|states?|fixes?|allocated?|contains?|holds?|had|was|were|is|are|equal|same)\b/i.test(c))return null;
 // Two independent noun anchors in the local claims, or the same distinctive
 // noun phrase plus its explicit shared scope (e.g. same purchase).
 if(sharedTopic(p,c)<2)return null;
 if(DISTINCT.test(p.replace(x.raw,''))||DISTINCT.test(c.replace(y.raw,'')))return null;
 const eq=arithmeticComparison(x,y,'eq');if(eq===null)return null;
 return valueResult(eq?'supported_conclusion':'contradictory_claims','exact_same_scope_quantity',p,c,
  [{type:'arithmetic',operator:'=',left:x.value,right:y.value,unit:x.unit,consistent:eq}]);
}

// Values explicitly assigned to two named alternatives (categories are open
// class). Claimed delta/ordering is calculated in JS, not by the NLI model.
function alternativeName(hit){
 // Prefer an attached label following the number, e.g. 'for Elm' or
 // 'in sample A'; otherwise use the subject of an explicit copular value.
 const after=hit.contextAfter;
 const afterMatch=/^\s*(?:in|for|by|to|at)\s+(?:(?:the|a|an)\s+)?([a-z][a-z-]{1,24})(?:\s+([a-z0-9][a-z0-9-]{0,24}))?/i.exec(after);
 if(afterMatch)return (afterMatch[1]+(afterMatch[2]&&!STOP.has(afterMatch[2])&&!['and','while','but','versus'].includes(afterMatch[2])?' '+afterMatch[2]:'')).toLowerCase();
 const before=hit.contextBefore;
 const m=/(?:^|\b(?:and|while|but|versus|vs\.?|whereas)\s+)(?:(?:the|a|an)\s+)?([a-z][a-z-]{1,20}(?:\s+[a-z][a-z-]{1,20})?)\s+(?:is|was|were|had|has|costs?|records?|recorded|measures?|measured|:|=)\s*$/i.exec(before);
 return m?m[1].toLowerCase().replace(/^(?:published|recorded)\s+/,''):null;
}
function pairedValues(p,c){
 const hits=mentions(p);
 if(hits.length!==2||!timeCompatible(p,c)||EXCEPT.test(p))return null;
 const [a,b]=hits;
 // The unit may be ellipted in the second parallel observation, but only
 // when explicit distinct object labels are present and first unit is known.
 const ua=a.unit,ub=b.unit||((a.unit&&alternativeName(a)&&alternativeName(b))?a.unit:null);
 if(!ua||!ub||ua!==ub)return null;
 const x=alternativeName(a),y=alternativeName(b);
 if(!x||!y||x===y)return null;
 const qa=x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const qb=y.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 if(!new RegExp('\\b'+qa+'\\b','i').test(c)||!new RegExp('\\b'+qb+'\\b','i').test(c))return null;
 const greater=/\b(?:more|higher|greater|larger|longer|exceeded|exceeds|above)\b/i;
 const fewer=/\b(?:fewer|lower|less|shorter|below)\b/i;
 const first=c.toLowerCase().indexOf(x),second=c.toLowerCase().indexOf(y);
 if(first<0||second<0)return null;
 const positive=greater.test(c),negative=fewer.test(c);
 if(positive===negative)return null;
 const order=(positive === (first<second))?'gt':'lt';
 const ok=arithmeticComparison({value:a.value,unit:ua},{value:b.value,unit:ua},order);
 return valueResult(ok?'supported_conclusion':'contradictory_claims','same_metric_numeric_order',p,c,
  [{type:'arithmetic',operator:order,left:a.value,right:b.value,unit:ua,consistent:ok,objects:[x,y]}]);
}

// Arithmetic expression present as an equation, not generated by free
// association. Resolve +,-,*,/ only with same-unit operands and explicit
// count factors. Multi-term general parsing is intentionally bounded.
function explicitEquation(p,c){
 if(!timeCompatible(p,c)||EXCEPT.test(p)||EXCEPT.test(c))return null;
 const vals=mentions(p).filter(x=>x.unit!==null);
 const out=mentions(c).filter(x=>x.unit!==null);
 if(vals.length!==2||out.length!==1||vals[0].unit!==vals[1].unit||vals[0].unit!==out[0].unit)return null;
 if(sharedTopic(p,c)<1)return null;
 const between=clean(p).slice(vals[0].end,vals[1].start);
 let value,operator;
 if(/\b(?:plus|added to|combined with|together with)\b|\+/.test(between)&&/\b(?:totals?|sum|combined|altogether|in all|together)\b/i.test(c)){
  value=vals[0].value+vals[1].value;operator='+';
 }else if(/\b(?:minus|less|subtract|removed|deducted|taken away)\b|\-/.test(between)&&/\b(?:remain|left|difference|less|after|shorter|fewer)\b/i.test(c)){
  value=vals[0].value-vals[1].value;operator='-';
 }else return null;
 const ok=sameNumeric(value,out[0].value);
 return valueResult(ok?'supported_conclusion':'contradictory_claims','explicit_same_unit_arithmetic',p,c,
  [{type:'arithmetic',operator,left:vals[0].value,right:vals[1].value,result:value,claimed:out[0].value,unit:vals[0].unit,consistent:ok}]);
}


// A stated physical lower/upper bound is incompatible with an observation
// outside that bound, provided measurement units and described scope align.
function explicitBound(p,c){
 const a=mentions(p),b=mentions(c);
 if(a.length!==1||b.length!==1||!a[0].unit||a[0].unit!==b[0].unit||
   !timeCompatible(p,c)||sharedTopic(p,c)<2)return null;
 const prefix=a[0].contextBefore.slice(-60);
 let bound=null;
 if(/\b(?:minimum|no less than|lower bound|at least)\b/.test(prefix))bound='min';
 if(/\b(?:maximum|no more than|upper bound|at most)\b/.test(prefix))bound='max';
 if(!bound||/\b(?:may|might|hypothetical|forecast)\b/i.test(p))return null;
 if(!/\b(?:was|is|reached|recorded|measured|read|stood at|held at)\b/i.test(c))return null;
 const valid=bound==='min' ? a[0].value<=b[0].value : a[0].value>=b[0].value;
 if(valid)return null; // Bound satisfaction does not establish the observation actually occurred.
 return valueResult('contradictory_claims','observed_quantity_violates_stated_bound',p,c,
  [{type:'arithmetic',operator:bound==='min'?'>=':'<=',bound:a[0].value,
    observed:b[0].value,unit:a[0].unit,consistent:false}]);
}

export function extractNumericalPropositions(text){return mentions(String(text||'')).map(x=>({kind:'quantity',value:x.value,unit:x.unit,source:x.raw,start:x.start,end:x.end}));}
export function inferNumericRelation(premise,conclusion){
 if(typeof premise!=='string'||typeof conclusion!=='string'||!premise.trim()||!conclusion.trim()||
   premise.length>1600||conclusion.length>400||QUOTED.test(premise)||QUOTED.test(conclusion)||HEDGE.test(conclusion))return null;
 return exactValue(premise,conclusion)||explicitBound(premise,conclusion)||pairedValues(premise,conclusion)||explicitEquation(premise,conclusion);
}