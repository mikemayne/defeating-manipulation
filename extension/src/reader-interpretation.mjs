// Experimental reader-interpretation probe, separate from argument correctness.
// Original source text and character offsets are immutable. The NLI scores are
// uncalibrated evidence for competing interpretations, NOT reader percentages.
export const READER_RELATIONS = Object.freeze([
 { id:"contrast", connector:"but",
   hypothesis:"A typical reader would understand the second statement as contrasting with the first." },
 { id:"reason", connector:"because",
   hypothesis:"A typical reader would understand the second statement as giving a reason for the first." },
 { id:"consequence", connector:"therefore",
   hypothesis:"A typical reader would understand the second statement as a conclusion or consequence of the first." },
 { id:"sequence", connector:"then",
   hypothesis:"A typical reader would understand the second statement as happening later in a sequence." },
 { id:"addition", connector:"and",
   hypothesis:"A typical reader would understand the second statement as adding related information." },
 { id:"example", connector:"for example",
   hypothesis:"A typical reader would understand the second statement as illustrating the first with an example." },
 { id:"none", connector:null,
   hypothesis:"A typical reader would understand these as independent statements without an implied connection." }
]);
const WORD = /[\p{L}\p{N}]+/gu;
// Only unambiguous title abbreviations should survive even before a capitalised name.
const TITLES = new Set([
 "mr","mrs","ms","dr","prof","sen","rep","gen","gov",
 "sr","jr","rev","hon","capt","col","lt","sgt","st","mt"
]);
// These can end a sentence, so only suppress a period when the next word
// clearly continues the current phrase.
const INLINE_ABBREVIATIONS = new Set([
"vs","etc","inc","ltd","corp","co","fig","vol","dept","approx","no"
]);
const MAX_STATEMENTS=14, MAX_PAIRS=2, MAX_TEXT_LENGTH=3500;
function countWords(value){return (value.match(WORD)||[]).length;}
function span(source,a,b){
 while(a<b&&/\s/u.test(source[a]))a++;
 while(b>a&&/\s/u.test(source[b-1]))b--;
 if(a===b)return null;
 const text=source.slice(a,b);
 return {start:a,end:b,text};
}
function suppressedDot(source,i){
 // Ellipses are NOT three possible sentence boundaries.
 if(source[i-1]==="."||source[i+1]===".")return true;
 const before=source.slice(Math.max(0,i-24),i);
 const previous=(before.match(/[\p{L}]+$/u)||[])[0]||"";
 const next=source.slice(i+1).match(/^\s*(.)/u)?.[1]||"";
 const word=previous.toLowerCase();
 if(TITLES.has(word)&&/\p{L}/u.test(next))return true;
 if(INLINE_ABBREVIATIONS.has(word)&&/\p{Ll}/u.test(next))return true;
 if(word==="no"&&/\p{N}/u.test(next))return true;
 if(/\b(?:e\.g|i\.e|a\.m|p\.m)$/i.test(before)&&/\p{L}/u.test(next))
  return true;
 if(/\d/u.test(source[i-1]||"")&&/\d/u.test(next))return true;
 // Single initial: "J. Smith", "U.S. policy"; not an utterance boundary.
 if(previous.length===1&&/\p{L}/u.test(next))return true;
 if(/\p{L}/u.test(source[i-1]||"")&&/\p{L}/u.test(source[i+1]||""))return true;
 return false;
}
function finiteClause(text){
 return /\b(?:is|are|was|were|has|have|had|did|does|do|will|would|should|can|could|might|must|won't|doesn't|didn't|isn't|aren't|wasn't|were not|said|says|stated|voted|promised|raised|cut|reduced|lowered|increased|failed|received|found|recorded|measured|paid|published|reported|made|led|spent|worked|arrived|opened|closed|evacuated|bought|sold|changed|happened)\b/i.test(text);
}
export function extractReaderPairs(source,{maxPairs=MAX_PAIRS}={}){
 if(typeof source!=="string"||source.length>MAX_TEXT_LENGTH ||
    !Number.isSafeInteger(maxPairs)||maxPairs<1)return [];
 const statements=[];let from=0;
 function push(end){
  const unit=span(source,from,end);
  if(unit&&countWords(unit.text)>=2&&unit.text.length<=550)statements.push(unit);
  from=end;
 }
 for(let i=0;i<source.length&&statements.length<MAX_STATEMENTS;i++){
  const c=source[i];
  if(c==="\n"){
   // Single newline often separates utterances in transcripts.
   if(source.slice(from,i).trim())push(i);else from=i+1;
  }else if(c===";"||c==="!"||c==="?"||(c==="."&&!suppressedDot(source,i))){
   push(i+1);
  }
 }
 if(from<source.length&&statements.length<MAX_STATEMENTS)push(source.length);
 const pairs=[];
 function add(left,right,kind){
  if(!left||!right||left.end>right.start ||
    !countWords(left.text)||!countWords(right.text)||
    countWords(left.text)<3||countWords(right.text)<3 ||
    source.slice(left.end,right.start).match(/\n\s*\n/u))return;
  if(source.slice(left.start,left.end)!==left.text||
     source.slice(right.start,right.end)!==right.text)return;
  pairs.push({first:left,second:right,boundaryKind:kind,
   boundaryOffset:left.end});
 }
 for(let i=1;i<statements.length;i++)
  add(statements[i-1],statements[i],"sentence");
 // Include comma alternatives only where two fairly complete clauses exist;
 // short parenthetical commas ("Well, frankly, ...") are not boundaries.
 for(const item of statements){
  if(/["“”]/u.test(item.text))continue;
  const re=/,\s+/gu;let m;
  while((m=re.exec(item.text))){
   const left=span(source,item.start,item.start+m.index);
   const right=span(source,item.start+re.lastIndex,item.end);
   if(left&&right&&finiteClause(left.text)&&finiteClause(right.text))
    add(left,right,"comma");
  }
 }
 pairs.sort((a,b)=>a.boundaryOffset-b.boundaryOffset);
 // Prefer the first and last boundary on longer paragraphs, to avoid
 // exhausting the fixed neural budget only on the opening two sentences.
 const limit=Math.min(20,maxPairs);
 if(pairs.length<=limit)return pairs;
 if(limit===1)return [pairs[0]];
 return [pairs[0],pairs[pairs.length-1]];
}
export function validateReaderCases(items){
 if(!Array.isArray(items)||items.length<1||items.length>10000)
  throw Error("Reader interpretation mode expects 1 to 10,000 uploaded {id,text} cases");
 const ids=new Set();
 for(const item of items){
  if(!item||typeof item.id!=="string"||!item.id.trim()||
     typeof item.text!=="string"||!item.text.trim()||
     ids.has(item.id))throw Error("Invalid or duplicate reader interpretation case");
  ids.add(item.id);
 }
 return items;
}
function validNli(result){
 return result&&["entailment","neutral","contradiction"].every(k=>
  Number.isFinite(result[k])&&result[k]>=0&&result[k]<=1);
}
// A separate model score for "no implied connection" is compared directly
// against the other options. Low or tightly clustered scores => "uncertain"
// instead of inventing a definitive human interpretation.
export async function scoreReaderInterpretations(source,scorePair,{
 maxPairs=MAX_PAIRS,minScore=0.62,minMargin=0.12
}={}){
 if(typeof scorePair!=="function")return [];
 const pairs=extractReaderPairs(source,{maxPairs});
 const outputs=[];
 for(const pair of pairs){
  const probe="Statement one: "+pair.first.text+"\nStatement two: "+pair.second.text;
  const options=[];
  for(const relation of READER_RELATIONS){
   const result=await scorePair(probe,relation.hypothesis);
   options.push({relation:relation.id,connector:relation.connector,
    score:validNli(result)?result.entailment:null});
  }
  const sorted=options.filter(x=>Number.isFinite(x.score))
   .sort((a,b)=>b.score-a.score);
  const winner=sorted[0],runner=sorted[1];
  const margin=winner?(winner.score-(runner?.score??0)):null;
  const selected=winner&&winner.score>=minScore &&
   (runner===undefined||margin>=minMargin)?winner.relation:"uncertain";
  outputs.push({
   first:pair.first,second:pair.second,
   boundaryKind:pair.boundaryKind,boundaryOffset:pair.boundaryOffset,
   interpretation:selected,
   proposedConnector:selected==="uncertain"?null:
    READER_RELATIONS.find(x=>x.id===selected)?.connector??null,
   topModelOption:winner?.relation??null,
   topModelScore:winner?.score??null,
   margin,
   options,
   scoreType:"uncalibrated_nli_entailment",
   humanAgreementMeasured:false
  });
 }
 return outputs;
}
