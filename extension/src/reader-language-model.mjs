// Separate small local causal language model used for scoring complete
// punctuation reconstructions. MNLI entailment scores cannot measure fluency.
import { AutoModelForCausalLM, AutoTokenizer } from "@huggingface/transformers";
export const BOUNDARY_LM="Xenova/distilgpt2";

// Score only the candidate continuation given the same original left context.
// Average token log-probability reduces (but does not eliminate) token-length
// bias between "keep", "nothing", "and" and "but". Higher is more plausible.
export function continuationLogScore(inputIds,prefixIds,logits){
 if(!Array.isArray(inputIds)||!Array.isArray(prefixIds)||
    !logits?.data||!Array.isArray(logits.dims)||logits.dims.length!==3)return null;
 const [batch,sequence,vocabulary]=logits.dims;
 if(batch!==1||sequence!==inputIds.length||vocabulary<2)return null;
 let shared=0;
 while(shared<prefixIds.length&&shared<inputIds.length&&
  prefixIds[shared]===inputIds[shared])shared++;
 const first=Math.max(1,shared);
 if(first>=inputIds.length)return null;
 const values=logits.data;let total=0,n=0;
 for(let token=first;token<inputIds.length;token++){
  const id=inputIds[token],base=(token-1)*vocabulary;
  if(!Number.isSafeInteger(id)||id<0||id>=vocabulary)return null;
  let max=-Infinity;
  for(let k=0;k<vocabulary;k++){
   const v=Number(values[base+k]);
   if(v>max)max=v;
  }
  if(!Number.isFinite(max))return null;
  let sum=0;
  for(let k=0;k<vocabulary;k++)sum+=Math.exp(Number(values[base+k])-max);
  if(!(sum>0))return null;
  total+=Number(values[base+id])-max-Math.log(sum);
  n++;
 }
 return n?total/n:null;
}

export async function createBoundaryLanguageScorer({onStatus=()=>{}}={}){
 onStatus("Loading local language model for punctuation ranking (one-time download)…");
 const [tokenizer,model]=await Promise.all([
  AutoTokenizer.from_pretrained(BOUNDARY_LM),
  AutoModelForCausalLM.from_pretrained(BOUNDARY_LM,{dtype:"q8"})
 ]);
 onStatus("Local punctuation-ranking model ready");
 return async function scoreContinuation(prefix,completion){
  if(typeof prefix!=="string"||typeof completion!=="string"||
     !prefix||!completion)return null;
  const full=prefix+completion;
  const [prefixInput,input]=await Promise.all([
   tokenizer(prefix,{add_special_tokens:false}),
   tokenizer(full,{add_special_tokens:false})
  ]);
  const tokenIds=Array.from(input.input_ids.data,Number);
  const contextIds=Array.from(prefixInput.input_ids.data,Number);
  if(tokenIds.length<2||tokenIds.length>128)return null;
  const output=await model(input);
  return continuationLogScore(tokenIds,contextIds,output.logits);
 };
}
