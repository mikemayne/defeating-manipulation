// Experimental bidirectional text infilling, separate from production detection.
// No source text or character offsets are changed.
import { extractBoundaryProbes } from "./reader-boundary-scorer.mjs";
import { leadingExplicitConnector } from "./reader-connector-normalisation.mjs";

export const MASK_MODEL="Xenova/distilbert-base-uncased";
export const MASK_TEMPLATE_VERSION="masked-gap-v1";
export const MASK_WORDS=Object.freeze(["and","but","so","erm","um","uh","well","anyway","-","—","."]);
export const NEUTRAL_WORDS=Object.freeze(["erm","um","uh","well","anyway","-","—","."]);
export const CLASS_LABELS=Object.freeze(["keep","and","but"]);
export const MASK_PLACEHOLDER="[MASK]";
const LOWERCASE_START=/^(He|She|It|They|We|You|The|A|An|This|That|Those|These|There|His|Her|Their|Our|Your)\b/u;

// The mask is one token between the two statements, including punctuation.\n// A hyphen or em dash is an experimental nonlexical KEEP candidate, not\n// evidence that the statements have no semantic relationship.\n// The mask is a single position between statements, not a replacement of
// source punctuation. Existing explicit connectives are stripped only from
// the *experimental model prompt*, to avoid e.g. "but But ..." duplication.
export function maskedGapPrompt(source,probe,{mask=MASK_PLACEHOLDER}={}){
 if(typeof source!=="string"||!probe||typeof mask!=="string"||!mask)return null;
 const left=source.slice(probe.first?.start,probe.punctuationStart).trim();
 const rawRight=source.slice(probe.punctuationEnd,probe.second?.end).trim();
 if(!left||!rawRight)return null;
 const explicit=leadingExplicitConnector(rawRight);
 const right=(explicit?rawRight.slice(explicit.end).trimStart():rawRight)
  .replace(LOWERCASE_START,v=>v.toLowerCase());
 if(!right)return null;
 const truncatedLeft=left.slice(-160).trimStart();
 const truncatedRight=right.slice(0,160).trimEnd();
 return {text:truncatedLeft+" "+mask+" "+truncatedRight,
  before:truncatedLeft,after:truncatedRight,
  strippedConnector:explicit?.marker??null,
  sourceOffset:probe.punctuationStart};
}

export function scoreMaskLogits(tokenIds,maskTokenId,logits,wordToTokenId){
 if(!Array.isArray(tokenIds)||!Number.isSafeInteger(maskTokenId)||
  !logits?.data||!Array.isArray(logits.dims)||logits.dims.length!==3)
  throw Error("Invalid masked-LM tensors");
 const [batch,sequence,vocabulary]=logits.dims;
 if(batch!==1||sequence!==tokenIds.length||vocabulary<2||
  logits.data.length!==sequence*vocabulary)
  throw Error("Unexpected masked-LM logits shape");
 const positions=tokenIds.flatMap((id,i)=>id===maskTokenId?[i]:[]);
 if(positions.length!==1)throw Error("Exactly one mask token is required");
 const base=positions[0]*vocabulary;
 const scores={};
 for(const [word,id] of Object.entries(wordToTokenId)){
  if(!Number.isSafeInteger(id)||id<0||id>=vocabulary)continue;
  const value=Number(logits.data[base+id]);
  if(Number.isFinite(value))scores[word]=value;
 }
 return scores;
}

export function listEligibleMaskWords(tokenizer,words=MASK_WORDS){
 const tokenIds={},excluded={};
 const unknown=Number(tokenizer.unk_token_id);
 for(const word of words){
  const encoded=tokenizer(word,{add_special_tokens:false});
  const ids=Array.from(encoded.input_ids.data,Number);
  if(ids.length===1&&Number.isSafeInteger(ids[0])&&ids[0]!==unknown)
   tokenIds[word]=ids[0];
  else excluded[word]=ids.length!==1?
   "Requires "+ids.length+" WordPiece tokens; single-mask test excludes it":
   "Token is unavailable/unknown";
 }
 return {tokenIds,excluded};
}

export async function createMaskedGapScorer({onStatus=()=>{}}={}){
 onStatus("Loading "+MASK_MODEL+" for fill-in-the-middle (first run may download model)…");
 const {AutoModelForMaskedLM,AutoTokenizer}=await import("@huggingface/transformers");
 const [tokenizer,model]=await Promise.all([
  AutoTokenizer.from_pretrained(MASK_MODEL),
  AutoModelForMaskedLM.from_pretrained(MASK_MODEL,{dtype:"q8"})
 ]);
 const mask=tokenizer.mask_token||MASK_PLACEHOLDER;
 const maskTokenId=Number(tokenizer.mask_token_id);
 if(!Number.isSafeInteger(maskTokenId))throw Error("Tokenizer has no mask token ID");
 const {tokenIds,excluded}=listEligibleMaskWords(tokenizer);
 if(!Number.isSafeInteger(tokenIds.and)||!Number.isSafeInteger(tokenIds.but))
  throw Error("Model must support one-token AND and BUT");
 onStatus("Masked-LM ready; candidates: "+Object.keys(tokenIds).join(", ")+
  (Object.keys(excluded).length?"; excluded: "+JSON.stringify(excluded):""));
 return {
  model:MASK_MODEL,tokenIds,excluded,
  async score(source,probe){
   const prompt=maskedGapPrompt(source,probe,{mask});
   if(!prompt)return null;
   const input=tokenizer(prompt.text);
   const ids=Array.from(input.input_ids.data,Number);
   if(ids.length>256)throw Error("Masked prompt unexpectedly exceeds token budget");
   const output=await model(input);
   return {...prompt,scores:scoreMaskLogits(ids,maskTokenId,output.logits,tokenIds)};
  }
 };
}
export {extractBoundaryProbes};
