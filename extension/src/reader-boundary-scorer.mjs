// Local reconstruction candidates for the meaning a reader may take from a
// punctuation boundary. This is NOT an argument verdict or reader-percentage
// estimate. Every candidate is analysis-only; source offsets stay untouched.
import { extractReaderPairs } from "./reader-interpretation.mjs";
import {selectJoin,DEFAULT_JOIN_THRESHOLDS,validateJoinThresholds} from "./reader-join-thresholds.mjs";
import {explicitBoundaryConnector,normaliseConnectorCandidate} from "./reader-connector-normalisation.mjs";
export const BOUNDARY_CHOICES=Object.freeze([{id:"and",label:"and"},{id:"but",label:"but"}]);
const MAX_PAIRS=2,MAX_STRATEGY_PAIRS=8,MAX_CONTEXT_LEFT=130,MAX_CONTEXT_RIGHT=95;
// Titles, initials, common inline abbreviations, decimals and ellipses are
// handled deterministically by extractReaderPairs. They must never be
// treated as optional discourse-join sites or sent to the language model.
export function extractBoundaryProbes(source,{maxPairs=MAX_PAIRS}={}){
 if(typeof source!=="string"||source.length>3500||!Number.isSafeInteger(maxPairs)||maxPairs<1)return [];
 const pairs=extractReaderPairs(source,{maxPairs:20}),probes=[];
 for(const pair of pairs){
  const between=source.slice(pair.first.end,pair.second.start);
  let start,end;
  if(pair.boundaryKind==="comma"){
   const index=between.indexOf(",");
   if(index<0)continue;
   start=pair.first.end+index;end=start+1;
  }else {
   const text=pair.first.text;
   const match=/([.!?;])\s*$/u.exec(text);
   if(!match)continue;
   start=pair.first.end-match[0].length;
   end=start+1;
  }
  if(source.slice(start,end).match(/[,.!?;]/u))
   probes.push({...pair,punctuationStart:start,punctuationEnd:end});
 }
 probes.sort((a,b)=>a.punctuationStart-b.punctuationStart);
 const unique=[];const seen=new Set();
 for(const p of probes){
  if(seen.has(p.punctuationStart))continue;
  seen.add(p.punctuationStart);unique.push(p);
 }
 const limit=Math.min(MAX_STRATEGY_PAIRS,maxPairs);
 if(unique.length<=limit)return unique;
 // The historical two-boundary diagnostic sampled first + last. The new
 // progressive chain must instead use consecutive boundaries, otherwise
 // skipped middle joins cannot contribute to the growing reconstruction.
 if(limit>2)return unique.slice(0,limit);
 if(limit===1)return [unique[0]];
 return [unique[0],unique[unique.length-1]];
}
function normalizeRightStart(s){
 // A sentence-initial capital is often lowercase after a conjunction.
 // Keep proper names and "I" unchanged.
 return s.replace(/^(He|She|It|They|We|You|The|A|An|This|That|Those|These|There|His|Her|Their|Our|Your)(?=\b)/u,
  match=>match.toLowerCase());
}
function windowAround(source,probe){
 const {punctuationStart:start,punctuationEnd:end}=probe;
 if(source.slice(start,end).length!==1)throw Error("Invalid punctuation span");
 const before=source.slice(Math.max(0,start-MAX_CONTEXT_LEFT),start).trimStart();
 const after=source.slice(end,Math.min(source.length,end+MAX_CONTEXT_RIGHT)).trim();
 if(!before||!after)return null;
 return {before,after,punctuation:source.slice(start,end)};
}
export function buildBoundaryChoices(source,probe){
 const context=windowAround(source,probe);
 if(!context)return [];
 const {before,after}=context;
 return BOUNDARY_CHOICES.map(({id,label})=>{
  // Remove an already present connector from the analysis-only candidate.
  // Explicit relationships are classified by JS without model scoring.
  const normalised=normaliseConnectorCandidate(id,after);
  const completion=" "+id+" "+normalizeRightStart(normalised.text);
  return {id,label,analysisText:before+completion,
   prefix:before,completion,removedConnector:normalised.removedConnector};
 });
}
export async function rankBoundaryChoices(source,scoreContinuation,{
 maxPairs=MAX_PAIRS,
 minScore=DEFAULT_JOIN_THRESHOLDS.minScore,
 minMargin=DEFAULT_JOIN_THRESHOLDS.minMargin
}={}){
 if(typeof scoreContinuation!=="function")return [];
 const thresholds=validateJoinThresholds({minScore,minMargin});
 const probes=extractBoundaryProbes(source,{maxPairs}),out=[];
 for(const probe of probes){
  const choices=buildBoundaryChoices(source,probe);
  if(choices.length!==2)continue;
  const explicit=explicitBoundaryConnector(source,probe);
  const originalWindow=
   source.slice(Math.max(0,probe.punctuationStart-MAX_CONTEXT_LEFT),probe.punctuationStart).trimStart()+
   source.slice(probe.punctuationStart,probe.punctuationEnd)+" "+
   source.slice(probe.punctuationEnd,Math.min(source.length,probe.punctuationEnd+MAX_CONTEXT_RIGHT)).trim();
  if(explicit){
   // This is classification of an already expressed relationship, not a
   // recommendation to replace the existing punctuation.
   out.push({
    first:probe.first,second:probe.second,boundaryKind:probe.boundaryKind,
    punctuation:source.slice(probe.punctuationStart,probe.punctuationEnd),
    punctuationStart:probe.punctuationStart,punctuationEnd:probe.punctuationEnd,
    choice:explicit.choice,relationship:explicit.relation,
    decisionSource:"explicit_connector",explicitConnector:explicit.marker,
    punctuationAction:"keep",uncertain:false,
    leadingModelChoice:null,topModelScore:null,margin:null,thresholds,
    keepIsDefault:false,analysisText:originalWindow,
    candidates:choices.map(c=>({id:c.id,label:c.label,
      analysisText:c.analysisText,score:null})),
    scoreType:"explicit_connector_rule",humanAgreementMeasured:false
   });
   continue;
  }
  const ranked=[];
  for(const c of choices){
   const value=await scoreContinuation(c.prefix,c.completion);
   ranked.push({id:c.id,label:c.label,analysisText:c.analysisText,
    score:Number.isFinite(value)?value:null});
  }
  const decision=selectJoin(ranked,thresholds);
  const choice=decision.choice;
  out.push({
   first:probe.first,second:probe.second,
   boundaryKind:probe.boundaryKind,
   punctuation:source.slice(probe.punctuationStart,probe.punctuationEnd),
   punctuationStart:probe.punctuationStart,
   punctuationEnd:probe.punctuationEnd,
   ...decision,
   relationship:choice==="keep"?null:choice==="and"?"addition":"contrast",
   decisionSource:"language_model",explicitConnector:null,
   punctuationAction:choice==="keep"?"keep":"analysis_only_replace",
   analysisText:choice==="keep"?originalWindow:
    ranked.find(x=>x.id===choice)?.analysisText??null,
   candidates:ranked,
   scoreType:"mean_conditional_token_log_probability",
   humanAgreementMeasured:false
  });
 }
 return out;
}
