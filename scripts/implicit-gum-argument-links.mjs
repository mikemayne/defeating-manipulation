// Genuine GUM declarative implicit-relation evaluation (source-free).
// Uses existing paragraph parser and actual local NLI argument checker;
// does NOT manufacture missing premises or measure semantic correctness.
// The candidate source text stays in memory; only aggregate counts escape.
import {createHash} from "node:crypto";
import {extractArguments}
 from "../extension/src/argument-clauses.mjs";
import {analyseArguments}
 from "../extension/src/argument-analysis.mjs";

const sha=x=>createHash("sha256").update(String(x)).digest("hex");
export const VERSION="implicit-declarative-gum-v1";
export const LIMIT=40;
const labelCount=()=>({
 supported_conclusion:0,unsupported_conclusion:0,
 contradictory_claims:0,inconclusive:0,model_unavailable:0,
 abstained:0
});
export function identifyImplicitLinks(rows){
 if(!Array.isArray(rows)||!rows.length||
  rows.some(r=>typeof r.id!=="string"||typeof r.text!=="string"))
  throw Error("Source-paragraph rows required");
 const output=[];
 let explicit=0,implicit=0,withImplicit=0;
 const byGenre={};
 for(const row of rows){
  const original=extractArguments(row.text);
  const expanded=extractArguments(row.text,{includeImplicit:true});
  const inferred=expanded.filter(c=>c.inferred===true);
  explicit+=original.length;implicit+=inferred.length;
  withImplicit+=Number(inferred.length>0);
  const stats=byGenre[row.genre||"unknown"]??={paragraphs:0,
   explicitArguments:0,inferredArguments:0,withInferred:0};
  stats.paragraphs++;
  stats.explicitArguments+=original.length;
  stats.inferredArguments+=inferred.length;
  stats.withInferred+=Number(inferred.length>0);
  for(const candidate of inferred){
   const c=candidate.conclusion;
   if(!Number.isInteger(c.start)||!Number.isInteger(c.end)||
    row.text.slice(c.start,c.end)!==c.text||
    row.text.slice(candidate.premises[0].start,
     candidate.premises[0].end)!==candidate.premise)
    throw Error("Source offset integrity violated in implicit argument");
  }
  output.push({row,count:inferred.length});
 }
 return {version:VERSION,paragraphs:rows.length,
  explicitCandidates:explicit,implicitCandidates:implicit,
  withImplicit,byGenre,entries:output};
}
export async function scoreImplicitLinks(inspected,scorePair,{
 maxParagraphs=LIMIT,onStatus=()=>{}
}={}){
 if(!inspected?.entries||typeof scorePair!=="function"||
  !Number.isSafeInteger(maxParagraphs)||maxParagraphs<1||maxParagraphs>100)
  throw Error("Valid previously inspected paragraphs and scorer required");
 const selected=inspected.entries.filter(r=>r.count>0)
  .sort((a,b)=>sha("implicit-score-gum-v1|"+a.row.id)
   .localeCompare(sha("implicit-score-gum-v1|"+b.row.id)))
  .slice(0,maxParagraphs);
 const results={version:VERSION,withImplicit:inspected.withImplicit,
  candidates:inspected.implicitCandidates,scoredParagraphs:0,
  scoredInferredCandidates:0,scoredExplicitCandidates:0,
  labels:labelCount(),failedParagraphs:0,validSourceSpans:true,
  note:"No human reference labels for implied links in GUM. "+
   "NLI model verdicts are diagnostic, not independently verified."};
 for(const entry of selected){
  const diagnostics=[];
  try{
   await analyseArguments(entry.row.text,scorePair,{
    includeImplicit:true,
    onDiagnostic:d=>{
     diagnostics.push({inferred:d.inferred===true,
      label:d.verdict??null,status:d.status??null});
    }
   });
   results.scoredParagraphs++;
   const implicit=diagnostics.filter(d=>d.inferred);
   const explicit=diagnostics.filter(d=>!d.inferred);
   results.scoredInferredCandidates+=implicit.length;
   results.scoredExplicitCandidates+=explicit.length;
   for(const d of implicit){
    const label=d.label;
    if(label&&Object.hasOwn(results.labels,label))
     results.labels[label]++;
    else results.labels.abstained++;
   }
  }catch{
   results.failedParagraphs++;
  }
  if((results.scoredParagraphs+results.failedParagraphs)%10===0)
   onStatus({done:results.scoredParagraphs+results.failedParagraphs,
    total:selected.length});
 }
 return results;
}
