// Simple deterministic lexical features for sentence-pair relation experiments.
// No dictionary, corpus statistics, neural inference or model downloads.
// Stopwords are deliberately limited so content-word overlap remains visible.
// This is not word-sense disambiguation; e.g. "bass" still overlaps across senses.
const STOP=new Set(("a an and are as at be been being by can could did do does for from "+
 "had has have he her hers him his i in into is it its itself me my of on or our "+
 "ours she should so than that the their them there these they this those to was "+
 "we were what when where which who why will with would you your yet not no "+
 "after before then also just very more most much many such any each every "+
 "some over under between through during without within about once up down out "+
 "off if but because since until only all one two three").split(" "));

export function contentWords(text){
 if(typeof text!=="string")throw Error("Sentence must be a string");
 return new Set((text.toLowerCase().match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)?/gu)||[])
  .filter(word=>word.length>1&&!STOP.has(word)));
}
export function lexicalOverlapFeatures(left,right,semanticSimilarity){
 if(!Number.isFinite(semanticSimilarity)||semanticSimilarity< -1||
    semanticSimilarity>1)throw Error("Semantic similarity must be in [-1,1]");
 const a=contentWords(left),b=contentWords(right);
 let shared=0;
 for(const word of a)if(b.has(word))shared++;
 const union=a.size+b.size-shared;
 const min=Math.min(a.size,b.size);
 const jaccard=union?shared/union:0;
 const overlap=min?shared/min:0;
 // The interaction is meaningful only when vocabulary overlaps. Low
 // contextual similarity makes that overlap more suspicious, not proof of KEEP.
 const mismatch=jaccard*Math.max(0,0.6-semanticSimilarity);
 return {
  lexicalJaccard:jaccard,
  lexicalContainment:overlap,
  lexicalSharedCount:Math.min(shared,5)/5,
  lexicalSemanticMismatch:mismatch
 };
}
export const LEXICAL_FEATURE_NAMES=Object.freeze([
 "lexicalJaccard","lexicalContainment","lexicalSharedCount",
 "lexicalSemanticMismatch"
]);
