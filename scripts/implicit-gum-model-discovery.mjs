// Optional model-assisted implied argument discovery on genuine GUM texts.
// Source stays in memory; log ONLY aggregate numerical diagnostics. This
// mechanism tests asymmetric entailment of nearby declarative sentences.
// It is *not* a general implied-conclusion generator or a proof of validity.
import {createHash} from "node:crypto";
import {extractArgumentStatements,extractArguments}
 from "../extension/src/argument-clauses.mjs";
import {discoverModelArgumentCandidates}
 from "../extension/src/argument-model-discovery.mjs";
import {analyseArguments}
 from "../extension/src/argument-analysis.mjs";

const sha=x=>createHash("sha256").update(String(x)).digest("hex");
export const VERSION="implicit-model-discovery-gum-v1";
export async function evaluateModelDiscovery(rows,scorePair,{
 limit=120,onStatus=()=>{}
}={}){
 if(!Array.isArray(rows)||!rows.length||typeof scorePair!=="function"||
  !Number.isSafeInteger(limit)||limit<1||limit>200)
  throw Error("Invalid model discovery study");
 const eligible=rows.filter(r=>!extractArguments(r.text,{includeImplicit:true}).length)
  .sort((a,b)=>sha("implicit-model-discovery|"+a.id)
   .localeCompare(sha("implicit-model-discovery|"+b.id)))
  .slice(0,limit);
 const summary={version:VERSION,inputParagraphs:rows.length,
  eligibleForDiscovery:eligible.length,withCandidate:0,
  candidates:0,modelScoringCalls:0,modelErrors:0,
  checkerAssessed:0,checkerLabels:{
   supported_conclusion:0,unsupported_conclusion:0,
   contradictory_claims:0,abstained:0
  },
  sourceOffsetsValid:true,byGenre:{},
  limitation:"The original GUM paragraphs carry no human reference labels "+
   "for the hypothesised omitted relationship; this is candidate "+
   "coverage only, not semantic precision or recall."};
 for(let i=0;i<eligible.length;i++){
  const row=eligible[i];
  const genre=row.genre||"unknown";
  const counts=summary.byGenre[genre]??={analysed:0,candidates:0};
  counts.analysed++;
  try{
   // Cache source-only model scores for both candidate discovery and the
   // actual argument checker. We never score a reconstructed link as
   // evidence supporting itself.
   const cache=new Map();
   const memoScore=async(premise,conclusion)=>{
    const key=JSON.stringify([premise,conclusion]);
    if(!cache.has(key)){
     summary.modelScoringCalls++;
     cache.set(key,Promise.resolve(scorePair(premise,conclusion)));
    }
    return cache.get(key);
   };
   const proposals=await discoverModelArgumentCandidates(
    row.text,extractArgumentStatements(row.text),memoScore);
   if(proposals.length)summary.withCandidate++;
   summary.candidates+=proposals.length;
   counts.candidates+=proposals.length;
   if(proposals.length){
    await analyseArguments(row.text,memoScore,{
     includeImplicit:true,includeModelDiscovery:true,
     onDiagnostic:d=>{
      if(!d.inferred)return;
      summary.checkerAssessed++;
      const k=Object.hasOwn(summary.checkerLabels,d.verdict)?
       d.verdict:"abstained";
      summary.checkerLabels[k]++;
     }
    });
   }
   for(const p of proposals)
    if(row.text.slice(p.conclusion.start,p.conclusion.end)!==
      p.conclusion.text||
      row.text.slice(p.premises[0].start,p.premises[0].end)!==
      p.premise)throw Error("Original-source offset invalid");
  }catch{
   summary.modelErrors++;
  }
  if((i+1)%30===0)onStatus({done:i+1,total:eligible.length});
 }
 return summary;
}
