// Experimental local-LLM reconstruction of conclusions implied by rhetorical questions.
// Generated words are interpretations only, never evidence or red-underline grounds.
const WORD=/[\p{L}\p{N}]+/gu;
const STOP=new Set('the a an and are was were who whom what when where why how can could should would will from with this that these those there their they them his her him you your our for after given about into have has had did does do really supposed trust believe being been very still now then not yes no one all some any much just'.split(' '));
const RHETORICAL=/^(?:(?:and|but|so)\s+)?(?:how\s+(?:can|could|would)|why\s+(?:should|would|could)|who\s+(?:would|could|can)|(?:(?:are|were)\s+(?:we|you|they)|(?:we|you|they)(?:'re| are))\s+(?:really|supposed)|(?:do|does|did|can|could|should|would|will)\s+(?:we|you|they|anyone)\s+really)\b/i;
const CUES=/\b(?:supposed\s+to|really|after\s+(?:what|all|that)|given\s+(?:what|that|the)|despite|how\s+can|why\s+should|who\s+would|who\s+could|seriously|ever|possibly)\b/i;
const EVALUATION=/\b(?:trust|believe|accept|support|rely|credible|reliable|honest|fair|justify|justified|defend|defensible|expect|ignore|take\s+seriously|be\s+sure)\b/i;
const FINITE=/\b(?:is|are|was|were|has|have|had|can|cannot|can't|could|should|would|will|must|does|do|did|isn't|aren't|won't|ought|appears|seems|remains|deserves|lacks|needs)\b/i;
const MAX_QUESTION=260, MAX_OUTPUT=210, MAX_INPUT=2800;
function words(text){return text.match(WORD)||[];}
function terms(text){
 return new Set(words(text.toLowerCase()).filter(x=>x.length>=4&&!STOP.has(x))
  .map(x=>x.replace(/(?:ing|ed|es|s)$/,'')));
}
function validSpan(source,span){
 return span&&Number.isSafeInteger(span.start)&&Number.isSafeInteger(span.end)&&
  span.start>=0&&span.end<=source.length&&span.end>span.start&&
  source.slice(span.start,span.end)===span.text;
}
function eligibleQuestion(source,question){
 if(!validSpan(source,question)||question.text.length>MAX_QUESTION||
    words(question.text).length<7||!/\?\s*$/.test(question.text)||
    !RHETORICAL.test(question.text)||!CUES.test(question.text)||
    !EVALUATION.test(question.text))return false;
 if(/["“”\x60]/.test(question.text)||/https?:\/\//i.test(question.text)||
    /^(?:according to|the reporter asked|he asked|she asked|they asked)\b/i.test(question.text))
  return false;
 return true;
}
function precedingContext(source,statements,index){
 if(index===0)return null;
 const prior=statements[index-1],question=statements[index];
 if(!validSpan(source,prior)||prior.text.length>270||
    words(prior.text).length<5||/[?!]\s*$/.test(prior.text)||
    /["“”\x60]/.test(prior.text)||
    !(FINITE.test(prior.text)||/\b[a-z]{4,}ed\b/i.test(prior.text))||
    /\n\s*\n/.test(source.slice(prior.end,question.start)))return null;
 return prior;
}
export function findImplicitConclusionQuestions(source,statements,{limit=2}={}){
 if(typeof source!=='string'||source.length>MAX_INPUT||
    !Array.isArray(statements)||!Number.isSafeInteger(limit)||limit<1)return [];
 const found=[];
 for(let i=0;i<statements.length&&found.length<Math.min(2,limit);i++){
  if(!eligibleQuestion(source,statements[i]))continue;
  found.push({question:statements[i],context:precedingContext(source,statements,i)});
 }
 return found;
}
function promptFor(item){
 // User-supplied wording is data. Generated output is validated and not executed.
 return 'Rewrite the likely implied conclusion as one short declarative sentence. '+
  'Do not add facts, people or numbers. If the question could simply be seeking '+
  'information, or has no clear implied conclusion, output NONE.\n'+
  'Context: '+JSON.stringify(item.context?.text||'')+'\n'+
  'Question: '+JSON.stringify(item.question.text)+'\n'+
  'Implied conclusion:';
}
export function validateImpliedConclusion(raw,item){
 if(typeof raw!=='string'||!item?.question)return null;
 let conclusion=raw.trim().replace(/^\s*(?:implied\s+)?conclusion\s*:\s*/i,'').trim();
 if(/^(?:none|no\s+(?:clear\s+)?conclusion|n\/a)\.?$/i.test(conclusion))return null;
 if(conclusion.length<18||conclusion.length>MAX_OUTPUT||
    /[\n\r<>\[\]{}]|https?:\/\/|(?:^|\s)(?:system|assistant|user)\s*:/i.test(conclusion)||
    /\?|[.!?].+\S/.test(conclusion.replace(/[.!]\s*$/,''))||
    /^\s*(?:i\s+(?:think|infer)|perhaps|maybe|it\s+suggests|the\s+question)/i.test(conclusion))
  return null;
 conclusion=conclusion.replace(/[.!]\s*$/,'').trim()+'.';
 if(!FINITE.test(conclusion))return null;
 const sourceText=[item.question.text,item.context?.text||''].join(' ');
 const sourceTerms=terms(sourceText);
 if(![...terms(conclusion)].some(token=>sourceTerms.has(token)))return null;
 const sourceNumbers=new Set(sourceText.match(/\b\d+(?:\.\d+)?\b/g)||[]);
 for(const number of conclusion.match(/\b\d+(?:\.\d+)?\b/g)||[])
  if(!sourceNumbers.has(number))return null;
 const sourceNames=new Set(sourceText.match(/\b[A-Z][a-z]{2,}\b/g)||[]);
 const outputNames=conclusion.slice(conclusion.indexOf(' ')+1).match(/\b[A-Z][a-z]{2,}\b/g)||[];
 for(const name of outputNames)if(!sourceNames.has(name))return null;
 if(conclusion.toLowerCase().replace(/[.!?]/g,'').trim()===
    item.question.text.toLowerCase().replace(/[.!?]/g,'').trim())return null;
 return conclusion;
}
export async function reconstructImplicitConclusions(source,statements,generate,options={}){
 if(typeof generate!=='function')return [];
 const targets=findImplicitConclusionQuestions(source,statements,options),result=[];
 const report=details=>{
  // Diagnostics are optional. A consumer callback cannot alter detection.
  try{options.onAttempt?.(details);}catch{}
 };
 for(const target of targets){
  const details={start:target.question.start,end:target.question.end,
   question:target.question.text};
  try{
   const raw=await generate(promptFor(target));
   const conclusion=validateImpliedConclusion(raw,target);
   const none=typeof raw==='string'&&/^(?:none|no\s+(?:clear\s+)?conclusion|n\/a)\.?$/i.test(raw.trim());
   report({...details,status:conclusion?'accepted':none?'none':'rejected',
    rawOutput:typeof raw==='string'?raw.slice(0,500):null,
    impliedConclusion:conclusion});
   if(!conclusion)continue;
   result.push({start:target.question.start,end:target.question.end,
    original:target.question.text,impliedConclusion:conclusion,
    context:target.context,provisional:true,
    reconstructionMethod:'local_llm_implied_conclusion'});
  }catch(error){
   report({...details,status:'model_error',
    error:String(error?.message||error).slice(0,200)});
  }
 }
 return result;
}
// The checker consumes only a *stated preceding premise*, never the rhetorical
// question itself (which would make the generated conclusion self-supporting).
export async function checkImpliedConclusions(proposals,check){
 if(!Array.isArray(proposals)||typeof check!=='function')return [];
 const out=[];
 for(const proposal of proposals){
  if(!proposal.context){
   out.push({...proposal,supportStatus:'no_explicit_premise'});continue;
  }
  try{
   const result=await check(proposal.context.text,proposal.impliedConclusion);
   out.push({...proposal,supportStatus:result?.label||'inconclusive'});
  }catch{
   out.push({...proposal,supportStatus:'model_unavailable'});
  }
 }
 return out;
}
const TECHNIQUE=Object.freeze({id:'possible_implicit_conclusion',
 title:'Possible implied conclusion',category:'Scrutiny',
 summary:'This wording may invite a conclusion that is not stated outright. It is a possible interpretation, not an established logical error. Check the context and evidence.'});
export function implicitConclusionFindings(source,proposals,{maxFindings=2}={}){
 if(typeof source!=='string'||!Array.isArray(proposals))return [];
 return proposals.filter(p=>validSpan(source,{start:p.start,end:p.end,text:p.original})&&
   typeof p.impliedConclusion==='string'&&p.provisional===true)
  .slice(0,Math.max(0,Math.min(2,maxFindings))).map(p=>({
   kind:'scrutiny',start:p.start,end:p.end,method:'implied_conclusion_review',
   technique:TECHNIQUE,strength:'Review context',score:0.35,
   signals:['Possible reading: '+p.impliedConclusion,
    p.context?'Check whether the preceding statement supports that reading':
     'No explicit supporting premise was identified in the selection']
  }));
}