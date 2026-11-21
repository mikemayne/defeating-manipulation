// Deterministic, narrow evidence of contrast BETWEEN two statements.
// Opposing properties of DIFFERENT subjects are a contrast, not necessarily
// a contradiction. Negation alone is never a sufficient signal.
// Also detects a reported result explicitly qualified by unclear causation.
// No inference about author intent, real-world truth, or calibrated confidence.
const MAX=1200;
const COPULA="(?:is|are|was|were|am|be|been)";
const NEGATIVE="(?:not|never|no)";
const PRONOUN=new Set(["he","she","it","i","we","they","you"]);
const GENERIC=new Set([
 "thing","things","one","ones","way","ways","part","parts",
 "type","types","time","times","problem","problems","issue","issues",
 "point","points","fact","facts","result","results","example","examples",
 "case","cases","question","questions","sure","certain","clear",
 "good","bad","right","wrong","true","false"
]);
function normalise(raw){
 return raw.toLowerCase().replace(/[’‘]/gu,"'")
  .replace(/\b(is|are|was|were|has|have|had|do|does|did|would|could|should|must|will|can)\s+n\s*'\s*t\b/gu,"$1 not")
  .replace(/\b(is|are|was|were|has|have|had|do|does|did|would|could|should|must|will|can)n\s*'\s*t\b/gu,"$1 not")
  .replace(/\b(won)\s*'\s*t\b/gu,"will not")
  .replace(/\b(can)\s*'\s*t\b/gu,"can not")
  .replace(/\s+/gu," ").trim();
}
function singular(w){
 const s=w.replace(/[^a-z-]/gu,"");
 if(s.endsWith("ies")&&s.length>=6)return s.slice(0,-3)+"y";
 if(/(?:sses|ches|shes|xes|zes)$/u.test(s))return s.slice(0,-2);
 if(s.length>4&&s.endsWith("s")&&!/(?:ss|us|is)$/u.test(s))
  return s.slice(0,-1);
 return s;
}
function negativeMember(text){
 const re=new RegExp("\\b("+COPULA+")\\s+"+NEGATIVE+
  "\\s+(?:a|an|the)\\s+([a-z][a-z-]{2,})\\b","gu");
 for(const m of text.matchAll(re)){
  const property=singular(m[2]),subject=text.slice(0,m.index).trim();
  if(GENERIC.has(property)||subject.length<2||subject.length>85||
   /[.!?;]/u.test(subject))continue;
  return {subject,property};
 }
 return null;
}
function positiveCategorySubject(text,property){
 // Inspect the head of a NEW subject, not a mere object later in the clause.
 const toks=text.match(/[a-z]+/gu)||[];
 if(!toks.length)return false;
 let i=0;
 if(toks[0]==="there"&&["were","was","are","is"].includes(toks[1]))i=2;
 if(toks[i]==="a"&&["lot","number","group","bunch","handful"].includes(toks[i+1])&&toks[i+2]==="of")i+=3;
 else if(toks[i]==="the"&&["majority","minority","rest"].includes(toks[i+1])&&toks[i+2]==="of")i+=3;
 else if(["many","several","some","most","few","other","all","both","numerous","various",
  "these","those","the","a","an","each","every","one","two","three","four","five"].includes(toks[i]))i++;
 if(["other","local","different"].includes(toks[i]))i++;
 if(i>=toks.length||singular(toks[i])!==property)return false;
 if(toks.slice(0,i).some(w=>["no","non","not","without"].includes(w)))return false;
 // Do not conflate a class of people with a named property of some object.
 if(["people","policy","politics","flag","car","cars","music","history",
  "culture","food","party","school","language","company","companies","film"].includes(toks[i+1]))return false;
 return true;
}
function otherPositiveMember(text,property,leftSubject){
 const re=new RegExp("\\b("+COPULA+")\\s+(?:a|an|the)\\s+([a-z][a-z-]{2,})\\b","gu");
 for(const m of text.matchAll(re)){
  if(singular(m[2])!==property)continue;
  const subject=text.slice(0,m.index).trim();
  if(!subject||subject.length>85||/[.!?;]/u.test(subject)||
   subject===leftSubject||/\b(?:no|not|never|without)\s*$/u.test(subject))continue;
  // A subsequent pronoun could refer to the original named person.
  if(PRONOUN.has(subject)&&!PRONOUN.has(leftSubject))continue;
  return true;
 }
 return false;
}
function distinctCategoryMembership(left,right){
 const member=negativeMember(left);
 return Boolean(member&&(positiveCategorySubject(right,member.property)||
  otherPositiveMember(right,member.property,member.subject)));
}
function uncertaintyAboutExplanation(left,right){
 const intro=/^(?:(?:but|however|yet|still|nevertheless)\s*,?\s*)?(?:(?:it|this|that)\s+(?:still\s+)?(?:remains|is|was|remained)\s+(?:unclear|unknown|uncertain)|(?:the|an?|its|their|these)\s+(?:cause|reason|explanation|mechanism|basis|source)s?\b.{0,85}?\b(?:remain|remains|is|are|was|were)\s+(?:unclear|unknown|uncertain))/iu;
 const cause=/\b(?:why|because|explain|explanation|caus(?:e|es|ed|ing)|attribut(?:ed|ion)|account(?:ed|s)?|responsible|underlie|behind|mechanism|reasons?)\b/iu;
 const observed=/\b(?:observ(?:ed|ation)|found|show(?:ed|n|s)?|report(?:ed|s)?|gain(?:ed|s)?|improv(?:ed|ement|ements)|increas(?:ed|es)?|decreas(?:ed|es)?|results?|benefit(?:s|ted)?|discover(?:ed|y)|perform(?:ed|ance)|stud(?:y|ies))\b/iu;
 return intro.test(right)&&cause.test(right)&&observed.test(left);
}
/**
 * Signal only. Never rewrite source text or supply any source sentence,
 * document identifier, or model score in the output.
 */
export function structuralContrastEvidence(first,second){
 if(typeof first!=="string"||typeof second!=="string"||
  !first.trim()||!second.trim()||first.length>MAX||second.length>MAX)
  return {contrastCandidate:false,kind:null};
 const left=normalise(first),right=normalise(second);
 if(distinctCategoryMembership(left,right))
  return {contrastCandidate:true,kind:"different_subject_category_polarity"};
 if(uncertaintyAboutExplanation(left,right))
  return {contrastCandidate:true,kind:"finding_qualified_by_unknown_explanation"};
 return {contrastCandidate:false,kind:null};
}
