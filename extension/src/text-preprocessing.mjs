// Conservative, non-destructive local preprocessing: source offsets are fixed.
// Formatting is normalised for inference; misspellings receive tentative
// signals, not guesses about the writer's intentions.
import {findSpellingCandidates} from "./spelling-bait.mjs";
export const PREPROCESS_VERSION="reader-preprocess-v1";
const PROTECTED=/(?:\x60\x60\x60[\s\S]*?\x60\x60\x60|\x60[^\x60\n]*\x60|https?:\/\/[^\s<>]+|www\.[^\s<>]+|\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b)/giu;
const REPEAT=/[!?]{2,}|\.{4,}/gu;
const WORD_REPEAT=/\b([a-z]{3,})[ \t]+\1\b/giu;
const PREFIX=/\b(anti|pan|pre|post|non|re|co|ex|well|long|self|pro|techno)\s+-\s+(?=[a-z]{3})/giu;
const CONTRACTION_N=/\b([a-z]{2,})\s+n(['’])t\b/giu;
const CONTRACTION_S=/\b([a-z]{2,})\s+(['’])\s*(s|re|ve|ll|d|m)\b/giu;
const SPACE_PUNCT=/[ \t]+[,;:!?]/gu;
const SPACE_DOT=/[ \t]+\.(?!\s*\d)/gu;
const SPACE_RUN=/[ \t]{2,}/gu;
const overlap=(a,b)=>a.start<b.end&&b.start<a.end;
const protectedSpans=source=>[...source.matchAll(PROTECTED)]
 .map(m=>({start:m.index,end:m.index+m[0].length}));
const HOOK_TECHNIQUE=Object.freeze({id:"orthographic_attention_hook",
 title:"Possible punctuation attention hook",category:"Attention and memory",
 summary:"Unusual punctuation can attract attention, but it may be accidental or expressive. The writer's intention is unknown."});

export function preprocessText(source,{spellchecker=null,correctSpelling=true,
 maxSpelling=8}={}){
 if(typeof source!=="string"||source.length>35000)throw Error("Invalid preprocessing text");
 if(!Number.isSafeInteger(maxSpelling)||maxSpelling<0||maxSpelling>100)
  throw Error("Invalid spelling limit");
 const protectedRanges=protectedSpans(source),flags=[],proposed=[];
 const isProtected=(a,b)=>protectedRanges.some(x=>overlap(x,{start:a,end:b}));
 function flag(kind,start,end,details={}){
  flags.push({kind,start,end,original:source.slice(start,end),...details});
 }
 function edit(kind,start,end,replacement,reason){
  if(isProtected(start,end)||source.slice(start,end)===replacement)return;
  proposed.push({kind,start,end,replacement,reason});
  flag(kind,start,end,{replacement,reason,attentionSignal:false,confidence:"high"});
 }
 function replaceMatches(regex,replacer,reason){
  for(const m of source.matchAll(regex)){
   edit("formatting_artifact",m.index,m.index+m[0].length,
    replacer(m),reason);
  }
 }
 replaceMatches(CONTRACTION_N,m=>m[1]+"n"+m[2]+"t","detokenised contraction");
 replaceMatches(CONTRACTION_S,m=>m[1]+m[2]+m[3],"detokenised apostrophe");
 replaceMatches(PREFIX,m=>m[1]+"-","detokenised common hyphenated prefix");
 replaceMatches(SPACE_PUNCT,m=>m[0].trimStart(),"spacing before punctuation");
 replaceMatches(SPACE_DOT,()=>".","spacing before full stop");
 replaceMatches(SPACE_RUN,()=>" ","repeated horizontal spaces");
 const words=new Map();
 for(const candidate of maxSpelling===0?[]:
   findSpellingCandidates(source,spellchecker,maxSpelling)){
  const {start,end,original,suggestions}=candidate;
  // Dictionary matches inside inline code and quoted URLs must not be
  // promoted into text signals, even if spelling-bait is called separately.
  if(isProtected(start,end))continue;
  const word=original.toLowerCase();
  words.set(word,(words.get(word)||0)+1);
  const correction=correctSpelling?candidate.correction:null;
  if(correction&&!isProtected(start,end))
   proposed.push({kind:"spelling_candidate",start,end,
    replacement:correction,reason:"unique one-edit suggestion"});
  flag("spelling_candidate",start,end,{
   suggestions,correction,attentionSignal:true,confidence:"tentative",
   reason:"possible spelling error"});
 }
 for(const m of source.matchAll(REPEAT)){
  const start=m.index,end=start+m[0].length;
  if(!isProtected(start,end))flag("punctuation_anomaly",start,end,{
   attentionSignal:true,confidence:"observed",
   reason:"repeated emphatic punctuation"});
 }
 for(const m of source.matchAll(WORD_REPEAT)){
  const start=m.index,end=start+m[0].length;
  if(!isProtected(start,end))flag("repeated_word",start,end,{
   attentionSignal:true,confidence:"observed",
   reason:"adjacent repeated word"});
 }
 for(const f of flags)if(f.kind==="spelling_candidate"&&
  words.get(f.original.toLowerCase())>1)f.repeatedMisspelling=true;
 proposed.sort((a,b)=>a.start-b.start||a.end-b.end||
  Number(a.kind==="spelling_candidate")-Number(b.kind==="spelling_candidate"));
 const edits=[];
 for(const e of proposed)if(!edits.some(other=>overlap(other,e)))edits.push(e);
 let text="",origin=[],cursor=0;
 function copy(start,end){
  text+=source.slice(start,end);
  for(let i=start;i<end;i++)origin.push({start:i,end:i+1});
 }
 for(const e of edits){
  copy(cursor,e.start);
  text+=e.replacement;
  for(let i=0;i<e.replacement.length;i++)
   origin.push({start:e.start,end:e.end});
  cursor=e.end;
 }
 copy(cursor,source.length);
 if(text.length!==origin.length)throw Error("Bad source offset mapping");
 const result={
  version:PREPROCESS_VERSION,original:source,analysisText:text,
  flags:flags.sort((a,b)=>a.start-b.start||a.end-b.end),edits,
  characterOrigins:origin,
  signals:{
   formattingArtifacts:flags.filter(x=>x.kind==="formatting_artifact").length,
   spellingCandidates:flags.filter(x=>x.kind==="spelling_candidate").length,
   punctuationAnomalies:flags.filter(x=>x.kind==="punctuation_anomaly").length,
   repeatedWords:flags.filter(x=>x.kind==="repeated_word").length,
   repeatedMisspellings:flags.filter(x=>x.repeatedMisspelling).length,
   possibleAttentionHooks:flags.filter(x=>x.attentionSignal).length,
   correctionsApplied:edits.length,
   interpretationWarning:"Text anomalies can attract attention but do not demonstrate intentional manipulation."
  }
 };
 for(const flag of result.flags){
  const range=analysisRangeForOriginal(result,flag.start,flag.end);
  flag.analysisStart=range.start;flag.analysisEnd=range.end;
 }
 return result;
}
export function originalRangeForAnalysis(result,start,end){
 const map=result?.characterOrigins;
 if(!Array.isArray(map)||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||
  start<0||end<start||end>map.length)throw Error("Invalid analysis range");
 if(start===end){
  const at=start<map.length?map[start].start:result.original.length;
  return {start:at,end:at};
 }
 return {start:map[start].start,end:map[end-1].end};
}
export function analysisRangeForOriginal(result,start,end){
 const map=result?.characterOrigins;
 if(!Array.isArray(map)||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||
  start<0||end<start||end>result.original.length)
  throw Error("Invalid original range");
 let first=-1,last=-1;
 for(let i=0;i<map.length;i++)
  if(map[i].start<end&&map[i].end>start){
   if(first<0)first=i;last=i+1;
  }
 if(first<0){
  const at=map.findIndex(x=>x.start>=start);
  return {start:at<0?map.length:at,end:at<0?map.length:at};
 }
 return {start:first,end:last};
}
export function remapFindings(preprocessing,items){
 if(!Array.isArray(items))throw Error("Findings must be an array");
 return items.map(item=>{
  if(!Number.isSafeInteger(item.start)||!Number.isSafeInteger(item.end))
   return item;
  return {...item,...originalRangeForAnalysis(preprocessing,item.start,item.end)};
 });
}
export function punctuationHookFindings(preprocessing,{maxFindings=6}={}){
 return preprocessing.flags.filter(x=>x.kind==="punctuation_anomaly")
  .slice(0,maxFindings).map(x=>({
   start:x.analysisStart,end:x.analysisEnd,kind:"punctuation",
   technique:HOOK_TECHNIQUE,method:"punctuation_heuristic",
   score:0.25,strength:"Weak signal"
  }));
}
