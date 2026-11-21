// Compare two ways to infer a punctuation join over a growing paragraph.
// A: context-aware, independently score each boundary using original context.
// B: progressive, score the same boundary after applying earlier joins.
// Both use the same two scored conjunctions and JS KEEP fallback;
// no original source text is modified and neither method asserts causality.
import { extractBoundaryProbes, buildBoundaryChoices } from "./reader-boundary-scorer.mjs";
import {selectJoin,DEFAULT_JOIN_THRESHOLDS,validateJoinThresholds} from "./reader-join-thresholds.mjs";
const CHOICES=new Set(["keep","and","but"]);
const MAX_PAIRS=8;
const LEFT_CONTEXT_CHARS=130;
const LOWERCASE_AFTER_JOIN=/^(He|She|It|They|We|You|The|A|An|This|That|Those|These|There|His|Her|Their|Our|Your)\b/u;


function reconstructedPrefix(source,to,edits){
 if(!edits.length)return source.slice(0,to);
 let out="",at=0;
 for(const e of edits){
  if(e.start>=to)break;
  if(e.start<at||e.end>to)throw Error("Overlapping reconstruction edits");
  out+=source.slice(at,e.start)+e.value;
  at=e.end;
 }
 return out+source.slice(at,to);
}

function proposedEdits(source,boundary,choice){
 if(!CHOICES.has(choice)||choice==="keep")return [];
 const start=boundary.punctuationStart,end=boundary.punctuationEnd;
 const replacement=" "+choice;
 const edits=[{start,end,value:replacement}];
 if(choice==="and"||choice==="but"){
  let pos=end;
  while(pos<source.length&&/\s/u.test(source[pos]))pos++;
  const rest=source.slice(pos);
  const initial=LOWERCASE_AFTER_JOIN.exec(rest);
  if(initial)edits.push({
   start:pos,end:pos+initial[0].length,value:initial[0].toLowerCase()
  });
 }
 return edits;
}

function validatePairText(source,pair){
 return source.slice(pair.first.start,pair.first.end)===pair.first.text&&
  source.slice(pair.second.start,pair.second.end)===pair.second.text&&
  source.slice(pair.punctuationStart,pair.punctuationEnd).length===1;
}

export function validateStrategyCases(items){
 if(!Array.isArray(items)||items.length<1||items.length>10000)
  throw Error("Strategy comparison requires 1-10,000 uploaded {id,text} excerpts");
 const seen=new Set();
 for(const item of items){
  if(!item||typeof item.id!=="string"||!item.id.trim()||
    typeof item.text!=="string"||!item.text.trim()||seen.has(item.id))
   throw Error("Invalid strategy comparison case (id/text required, IDs unique)");
  seen.add(item.id);
  if(item.expected_boundaries!==undefined){
   if(!Array.isArray(item.expected_boundaries))
    throw Error("expected_boundaries must be an array of {offset,choice} labels");
   const offsets=new Set();
   for(const gold of item.expected_boundaries){
    if(!gold||!Number.isSafeInteger(gold.offset)||gold.offset<0||
      gold.offset>=item.text.length||!CHOICES.has(gold.choice)||
      offsets.has(gold.offset)||!/[,.!?;]/u.test(item.text[gold.offset]))
     throw Error("Invalid or duplicate expected boundary label in "+item.id);
    offsets.add(gold.offset);
   }
  }
 }
 return items;
}

export async function compareReaderStrategies(source,scoreContinuation,{
 maxPairs=MAX_PAIRS,
 minScore=DEFAULT_JOIN_THRESHOLDS.minScore,
 minMargin=DEFAULT_JOIN_THRESHOLDS.minMargin
}={}){
 const thresholds=validateJoinThresholds({minScore,minMargin});
 if(typeof source!=="string"||typeof scoreContinuation!=="function")
  return [];
 const bound=Number.isSafeInteger(maxPairs)?Math.min(MAX_PAIRS,Math.max(0,maxPairs)):0;
 if(!bound)return [];
 const boundaries=extractBoundaryProbes(source,{maxPairs:bound});
 const memo=new Map();
 const edits=[],outputs=[];
 let lastEnd=0,modelCalls=0;
 async function scoreCandidate(prefix,completion){
  const key=JSON.stringify([prefix,completion]);
  if(memo.has(key))return memo.get(key);
  modelCalls++;
  const score=await scoreContinuation(prefix,completion);
  const value=Number.isFinite(score)?score:null;
  memo.set(key,value);
  return value;
 }
 async function evaluate(candidates){
  const ranked=[];
  for(const c of candidates)
   ranked.push({id:c.id,score:await scoreCandidate(c.prefix,c.completion),
    analysisText:c.prefix+c.completion});
  return {...selectJoin(ranked,thresholds),candidates:ranked};
 }
 for(const boundary of boundaries){
  if(boundary.punctuationStart<lastEnd||!validatePairText(source,boundary))
   continue;
  const candidates=buildBoundaryChoices(source,boundary);
  if(candidates.length!==2)continue;
  // Both strategies receive the SAME right-hand continuation and the SAME
  // short context budget. Only past inferred edits can differ.
  const originalPrefix=candidates[0].prefix;
  const progressivePrefix=reconstructedPrefix(source,boundary.punctuationStart,edits)
   .slice(-LEFT_CONTEXT_CHARS).trimStart();
  if(!progressivePrefix)continue;
  const context=await evaluate(candidates);
  const progressiveCandidates=candidates.map(c=>({
   ...c,prefix:progressivePrefix
  }));
  const progressive=await evaluate(progressiveCandidates);
  const changed=progressivePrefix!==originalPrefix;
  const newEdits=proposedEdits(source,boundary,progressive.choice);
  if(!progressive.uncertain){
   for(const edit of newEdits)edits.push(edit);
   edits.sort((a,b)=>a.start-b.start);
  }
  outputs.push({
   punctuationStart:boundary.punctuationStart,
   punctuationEnd:boundary.punctuationEnd,
   punctuation:source.slice(boundary.punctuationStart,boundary.punctuationEnd),
   boundaryKind:boundary.boundaryKind,
   first:boundary.first,second:boundary.second,
   context,progressive,
   contextChangedByEarlierJoins:changed,
   sameChoice:context.choice===progressive.choice,
   progressiveReconstructionThroughSecond:
    reconstructedPrefix(source,boundary.second.end,edits),
   neuralCallsForCase:modelCalls
  });
  lastEnd=boundary.punctuationEnd;
 }
 return outputs;
}

export function summarizeStrategyComparison(predictions){
 const sum={
  cases:predictions.length,casesWithBoundaries:0,pairs:0,
  agree:0,disagree:0,changedContext:0,
  modelCalls:0,
  byContext:{},byProgressive:{},
  labelled:0,correctContext:0,correctProgressive:0,
  matchedLabels:0,unmatchedLabels:0
 };
 for(const item of predictions){
  const boundaries=item.boundaries||[];
  if(boundaries.length)sum.casesWithBoundaries++;
  sum.pairs+=boundaries.length;
  sum.modelCalls+=item.modelCalls??0;
  const expected=new Map((item.expected_boundaries||[])
    .map(g=>[g.offset,g.choice]));
  let matched=0;
  for(const pair of boundaries){
   const a=pair.context.choice,b=pair.progressive.choice;
   if(a===b)sum.agree++;else sum.disagree++;
   if(pair.contextChangedByEarlierJoins)sum.changedContext++;
   sum.byContext[a]=(sum.byContext[a]||0)+1;
   sum.byProgressive[b]=(sum.byProgressive[b]||0)+1;
   if(expected.has(pair.punctuationStart)){
    matched++;sum.labelled++;sum.matchedLabels++;
    if(a===expected.get(pair.punctuationStart))sum.correctContext++;
    if(b===expected.get(pair.punctuationStart))sum.correctProgressive++;
   }
  }
  sum.unmatchedLabels+=expected.size-matched;
 }
 return sum;
}
