// Two additional recovery passes for implicit argument connections.
// Reconstruction exists only in analysisText. Text/offsets stay original.
const WORD=/[\p{L}\p{N}]{3,}/gu;
const STOP=new Set("the and this that these those there their they them because when where while have has had been were was are from with your our into about which could would should will only most more some very just what then said says".split(" "));
const CLAIM=/\b(?:does(?:n't| not) match|does(?:n't| not) add up|is(?:n't| not) (?:true|correct|fair|ready|credible|reliable|justified)|not (?:true|correct|fair|ready|credible|reliable|justified)|contradict(?:s|ed)?|misleading|inconsistent|unreliable|unjustified|flawed|unfair|incorrect|unacceptable|unconvincing|wrong|not enough|can't be true|cannot be true|does not have|doesn't have|there is no evidence|i don't buy that|i do not buy that|doesn't make sense|does not make sense)\b/i;
const EVIDENCE=/\b(?:voted|recorded|measured|found|reported|published|counted|inspected|tested|paid|charged|increased|decreased|raised|reduced|received|provided|spent|rejected|approved|denied|passed|failed|promised|wrote|showed|says|said|states|stated|confirmed|delivered)\b|\b\d[\d,.]*(?:\s*%)?\b/i;
const ANAPHORA=/^(?:(?:and|but|well|now)[, ]+)?(?:this|that|it) (?:means|meant|shows|showed|demonstrates|demonstrated|suggests|suggested|indicates|indicated|proves|proved)(?: that)?\s+/i;
const FINITE=/\b(?:is|are|was|were|has|have|had|does|did|will|would|should|could|can|can't|cannot|won't|paid|voted|recorded|found|measured|reported|said|says|changed|approved|rejected|sent|provided|spent|promised|denied|failed|passed|worked|raised|reduced|received|delivered)\b/i;
function tokens(s){return new Set((s.toLowerCase().match(WORD)||[]).filter(w=>!STOP.has(w)));}
function related(a,b){
 const A=tokens(a),B=tokens(b);for(const w of A)if(B.has(w))return true;
 return /\b(?:he|his|him|she|her|they|their|them|it|its)\b/i.test(a)&&
  /\b(?:he|his|him|she|her|they|their|them|it|its|that|this)\b/i.test(b);
}
function complete(s){return s&&s.text.length>=18&&s.text.length<=430&&
 (s.text.match(WORD)||[]).length>=5&&FINITE.test(s.text)&&
 !/[?!]\s*$/.test(s.text)&&!/[“”]/.test(s.text)&&
 (s.text.match(/"/g)||[]).length<2;}
function stripEnd(s){return s.replace(/[.!?;]+\s*$/,"").trim();}
function propose(source,premise,conclusion,connector,method){
 return {premise:premise.text,premises:[premise],
  conclusion:{...conclusion,marker:connector,inline:false},
  start:Math.min(premise.start,conclusion.start),end:Math.max(premise.end,conclusion.end),
  inferred:true,inferredConnector:connector,
  analysisText:connector==="because"
   ?stripEnd(conclusion.text)+" because "+stripEnd(premise.text)+"."
   :stripEnd(premise.text)+" therefore "+stripEnd(conclusion.text)+".",
  reconstructionMethod:method};
}
export function recoverDiscourseArguments(source,statements,{limit=3}={}){
 if(typeof source!=="string"||!Array.isArray(statements)||!Number.isInteger(limit)||limit<1)return [];
 const out=[],seen=new Set();
 function add(premise,conclusion,connector,method){
  if(!complete(premise)||!complete(conclusion))return;
  if(source.slice(premise.start,premise.end)!==premise.text||
     source.slice(conclusion.start,conclusion.end)!==conclusion.text)return;
  const key=conclusion.start+":"+conclusion.end;
  if(seen.has(key))return;seen.add(key);
  out.push(propose(source,premise,conclusion,connector,method));
 }
 // First pass: recover a claim after a "That meant that" discourse marker.
 for(let i=1;i<statements.length;i++){
  const s=statements[i],m=ANAPHORA.exec(s.text);
  if(!m||!complete(statements[i-1]))continue;
  const offset=s.start+m[0].length,text=source.slice(offset,s.end).trim();
  if(!text||/^(?:addressing|providing|making|doing|taking|giving|being|having)\b/i.test(text))continue;
  const start=source.indexOf(text,offset);
  add(statements[i-1],{start,end:start+text.length,text},"therefore","anaphoric_inference");
 }
 // Second pass: relate adjacent evaluative claims and reported evidence.
 for(let i=0;i<statements.length-1;i++){
  const a=statements[i],b=statements[i+1];
  if(!complete(a)||!complete(b)||source.slice(a.end,b.start).includes("\n\n")||
     !related(a.text,b.text))continue;
  const claimA=CLAIM.test(a.text),claimB=CLAIM.test(b.text);
  if(claimA===claimB)continue;
  if(claimA&&EVIDENCE.test(b.text))add(b,a,"because","claim_then_evidence");
  if(claimB&&EVIDENCE.test(a.text))add(a,b,"therefore","evidence_then_claim");
 }
 return out.slice(0,Math.min(6,limit));
}
