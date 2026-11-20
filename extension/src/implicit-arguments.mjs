// Conservative inference of omitted discourse links. Source text is NEVER edited.
// Every candidate exposes original offsets; the bridged text is analysis-only.
const STOP = new Set('the a an and or but this that those these into about from with when where there were have has had was are for our your their him her his its they them you she who then than been each which would could should will can not one two more some many very only much just said says does did'.split(' '));
const WORD = /[\p{L}\p{N}]+/gu;
const CLAIM = /\b(?:does(?:n't| not) match|does(?:n't| not) reflect|contradict(?:s|ed)?|inconsistent|misleading|incorrect|wrong|flawed|unfair|unjustified|unreliable|unconvincing|not credible|not reliable|not accurate|not true|cannot work|won't work|will not work|doesn't work|is unsafe|is false|is unfair|lacks evidence|no evidence|should never|not fit|not prepared|isn't ready|is not ready|is inadequate|is ineffective|doesn't add up|does not add up|falls short|is too (?:high|low|expensive|risky)|not enough)\b/i;
const EVIDENCE = /\b(?:voted|recorded|measured|found|reported|documented|showed|published|counted|calculated|surveyed|inspected|tested|approved|rejected|raised|reduced|paid|charged|increased|decreased|fell|rose|contained|included|excluded|required|requires|says|states|shows|said|spent|received|supplied|provided|sent|delivered|recalled|failed|passed)\b|\b\d+(?:\.\d+)?\s*(?:percent|%|times|people|residents|votes|pounds|dollars|units|days|weeks|months|years)?\b/i;
const VERB = /\b(?:is|are|was|were|has|have|had|does|did|do|will|would|can|could|should|must|doesn't|isn't|won't|voted|counted|tested|found|reported|approved|rejected|measured|recorded|charged|raised|reduced|paid|requires|require|provided|passed|failed|costs|shows|said|says|became|remains|does not|is not)\b/i;
const LEADING_LINK = /^(?:so|therefore|thus|hence|consequently|accordingly|however|but|because|since|for example|this is because|this means|that means|this meant|that meant)\b/i;
const QUOTE = /["“”‘’]/;
const REJECT_START = /^(?:according to|the speaker said|the reporter said|she said|he said)\b/i;
const MAX_CHARS = 330;
function tokens(text){return new Set((text.toLowerCase().match(WORD)||[]).filter(x=>x.length>=4&&!STOP.has(x)));}
function pronounBridge(a,b){
 const x=a.toLowerCase(), y=b.toLowerCase();
 for(const [left,right] of [ [/\b(?:he|his|him)\b/,/\b(?:he|his|him)\b/], [/\b(?:she|her|hers)\b/,/\b(?:she|her|hers)\b/], [/\b(?:they|them|their)\b/,/\b(?:they|them|their)\b/], [/\b(?:it|its)\b/,/\b(?:it|its)\b/] ])
  if(left.test(x)&&right.test(y))return true;
 return false;
}
function related(a,b){
 const x=tokens(a),y=tokens(b);
 for(const term of x)if(y.has(term))return true;
 return pronounBridge(a,b);
}
function words(s){return (s.match(WORD)||[]).length;}
function eligible(s){
 if(!s||s.text.length>MAX_CHARS||words(s.text)<4||/[?!]\s*$/.test(s.text)||
    QUOTE.test(s.text)||REJECT_START.test(s.text)||!VERB.test(s.text)||
    LEADING_LINK.test(s.text.trim()))return false;
 return true;
}
function withoutPeriod(s){return s.replace(/[.?!;]+\s*$/,'').trim();}
function make(source, first, second, connector){
 const claim=connector==='because'?first:second;
 const proof=connector==='because'?second:first;
 const analysisText=connector==='because'
  ?withoutPeriod(claim.text)+' because '+withoutPeriod(proof.text)+'.'
  :withoutPeriod(proof.text)+' therefore '+withoutPeriod(claim.text)+'.';
 return {
  premise:proof.text, premises:[proof],
  conclusion:{...claim,marker:connector,inline:false},
  start:Math.min(proof.start,claim.start),end:Math.max(proof.end,claim.end),
  inferred:true,inferredConnector:connector,analysisText,
  // Confidence describes the structure heuristic, not truth or soundness.
  reconstructionConfidence:0.6
 };
}
function propose(source, first, second){
 if(!eligible(first)||!eligible(second)||
    source.slice(first.end,second.start).match(/\n\s*\n/)||
    !related(first.text,second.text))return null;
 const firstClaim=CLAIM.test(first.text), secondClaim=CLAIM.test(second.text);
 const firstEvidence=EVIDENCE.test(first.text),secondEvidence=EVIDENCE.test(second.text);
 if(firstClaim&&!secondClaim&&secondEvidence)return make(source,first,second,'because');
 if(secondClaim&&!firstClaim&&firstEvidence)return make(source,first,second,'therefore');
 return null;
}
function commaPairs(source,s){
 // Only split complete adjacent clauses; never treat list commas as evidence.
 const items=[];
 const re=/,\s+/g;let match;
 while((match=re.exec(s.text))){
  const a={start:s.start,end:s.start+match.index,text:source.slice(s.start,s.start+match.index).trim()};
  const b={start:s.start+re.lastIndex,end:s.end,text:source.slice(s.start+re.lastIndex,s.end).trim()};
  if(a.text&&b.text){
   const x=a.start+source.slice(a.start,a.end).indexOf(a.text),y=b.start+source.slice(b.start,b.end).indexOf(b.text);
   items.push([{...a,start:x,end:x+a.text.length},{...b,start:y,end:y+b.text.length}]);
  }
 }
 return items;
}
export function inferImplicitArguments(source,statements,{limit=3}={}){
 if(typeof source!=='string'||!Array.isArray(statements)||!Number.isSafeInteger(limit)||limit<1)return [];
 const found=[];const seen=new Set();
 function add(a,b){
  if(found.length>=limit)return;
  const candidate=propose(source,a,b);
  if(!candidate)return;
  // No inferred connector or punctuation is ever written to the source.
  const c=candidate.conclusion;
  if(source.slice(c.start,c.end)!==c.text ||
     source.slice(candidate.premises[0].start,candidate.premises[0].end)!==candidate.premise)return;
  const key=c.start+':'+c.end;
  if(!seen.has(key)){seen.add(key);found.push(candidate)}
 }
 for(let i=1;i<statements.length&&found.length<limit;i++)add(statements[i-1],statements[i]);
 for(const s of statements){
  if(found.length>=limit)break;
  for(const pair of commaPairs(source,s))add(...pair);
 }
 return found;
}
