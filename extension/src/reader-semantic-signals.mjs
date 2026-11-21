// Experimental semantic features for reader-join classification.
// The analyser already uses these two local models elsewhere. This module
// adds pairwise scoring; it never changes the input/source punctuation.
import {embeddingRows} from "./embedding-rows.mjs";
import {createNliScorer,NLI_MODEL} from "./nli-inference.mjs";

export const EMBEDDING_MODEL="Xenova/all-MiniLM-L6-v2";
export const SEMANTIC_SIGNAL_VERSION="reader-semantic-v1";
const RELATIONS=["contradiction","neutral","entailment"];

export function sentencePair(source,probe){
 if(typeof source!=="string"||!probe||!probe.first||!probe.second)
  throw Error("A source and valid boundary probe are required");
 if(source.slice(probe.punctuationStart,probe.punctuationEnd).length!==1)
  throw Error("Invalid sentence punctuation span");
 const left=source.slice(probe.first.start,probe.punctuationStart)
  .trim().replace(/[.!?;,\s]+$/u,"").trim();
 const right=source.slice(probe.punctuationEnd,probe.second.end).trim();
 if(!left||!right)throw Error("Incomplete boundary pair");
 return {left,right};
}
export function cosineSimilarity(a,b){
 if(!Array.isArray(a)||!Array.isArray(b)||!a.length||a.length!==b.length)
  throw Error("Vectors must have equal nonzero dimensions");
 let dot=0,aa=0,bb=0;
 for(let i=0;i<a.length;i++){
  const x=a[i],y=b[i];
  if(!Number.isFinite(x)||!Number.isFinite(y))
   throw Error("Nonfinite embedding value");
  dot+=x*y;aa+=x*x;bb+=y*y;
 }
 if(aa===0||bb===0)throw Error("Cannot compare zero vectors");
 return Math.max(-1,Math.min(1,dot/Math.sqrt(aa*bb)));
}
export function validateNliScores(s){
 if(!s||RELATIONS.some(label=>!Number.isFinite(s[label])||
  s[label]<0||s[label]>1))throw Error("Invalid NLI class scores");
 const sum=RELATIONS.reduce((n,k)=>n+s[k],0);
 if(Math.abs(sum-1)>0.005)throw Error("NLI class scores do not sum to one");
 return Object.fromEntries(RELATIONS.map(k=>[k,s[k]]));
}
export function validateSemanticSignals(s){
 if(!s||!Number.isFinite(s.similarity)||s.similarity< -1||
  s.similarity>1)throw Error("Invalid semantic similarity");
 return {
  similarity:s.similarity,
  forward:validateNliScores(s.forward),
  reverse:validateNliScores(s.reverse)
 };
}
export function semanticFeatures(signals){
 const {similarity,forward,reverse}=validateSemanticSignals(signals);
 return {
  semanticSimilarity:similarity,
  nliForwardContradiction:forward.contradiction,
  nliForwardEntailment:forward.entailment,
  nliReverseContradiction:reverse.contradiction,
  nliReverseEntailment:reverse.entailment,
  // Neutral is the residual of the other probabilities. Do not add a
  // perfectly redundant third feature for either direction.
  nliForwardNeutral:forward.neutral,
  nliReverseNeutral:reverse.neutral
 };
}
export async function createSemanticPairScorer({onStatus=()=>{}}={}){
 onStatus("Loading local sentence embeddings ("+EMBEDDING_MODEL+") and NLI ("+
  NLI_MODEL+"); first run may download models…");
 const {pipeline}=await import("@huggingface/transformers");
 const [embed,nli]=await Promise.all([
  pipeline("feature-extraction",EMBEDDING_MODEL,{dtype:"q8"}),
  createNliScorer({onStatus})
 ]);
 onStatus("Local semantic pair scorer ready");
 return async function score(left,right){
  if(typeof left!=="string"||typeof right!=="string"||!left||!right)
   throw Error("Nonempty sentence pair required");
  const tensor=await embed([left,right],{pooling:"mean",normalize:true});
  const vectors=embeddingRows(tensor,2);
  const similarity=cosineSimilarity(vectors[0],vectors[1]);
  // NLI is directional; both orders are retained as separate features.
  const forward=await nli(left,right);
  const reverse=await nli(right,left);
  return validateSemanticSignals({similarity,forward,reverse});
 };
}
export {NLI_MODEL};
