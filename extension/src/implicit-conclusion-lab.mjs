// Local-only batch evaluation for the implicit-conclusion detector.
// Reference labels describe annotators' expected reading, not a claim about truth.
export const MAX_IMPLICIT_LAB_CASES=2000;
export function validateImplicitConclusionCases(cases){
 if(!Array.isArray(cases)||cases.length===0||cases.length>MAX_IMPLICIT_LAB_CASES)
  throw Error("Upload 1–"+MAX_IMPLICIT_LAB_CASES+" implicit-conclusion examples as a JSON array, {cases:[...]}, or JSONL.");
 const ids=new Set();
 for(const [index,item] of cases.entries()){
  if(!item||typeof item.id!=="string"||!item.id.trim()||item.id.length>120||
     ids.has(item.id)||typeof item.text!=="string"||!item.text.trim()||
     item.text.length>35000||
     (Object.hasOwn(item,"expected_implicit")&&typeof item.expected_implicit!=="boolean")||
     (item.expected_conclusion!=null&&(typeof item.expected_conclusion!=="string"||
      !item.expected_conclusion.trim()||item.expected_conclusion.length>300))||
     (item.source_url!=null&&typeof item.source_url!=="string")||
     (item.source_title!=null&&typeof item.source_title!=="string"))
   throw Error("Invalid implicit-conclusion case "+(index+1)+
    ". Use unique {id,text}, optional expected_implicit:true/false, expected_conclusion:string, source_url and source_title.");
  ids.add(item.id);
 }
 return cases;
}
export function summarizeImplicitConclusionCases(rows){
 const out={cases:rows.length,withCandidates:0,eligibleQuestions:0,
  withSuggestions:0,suggestions:0,accepted:0,rejected:0,returnedNone:0,errors:0,
  skipped:0,labelled:0,labelledProvided:0,unscoredModelErrors:0,tp:0,fp:0,fn:0,tn:0};
 for(const item of rows){
  const candidates=item.candidates||[],attempts=item.attempts||[];
  out.eligibleQuestions+=candidates.length;
  if(candidates.length)out.withCandidates++;
  else out.skipped++;
  out.suggestions+=(item.conclusions||[]).length;
  if(item.predicted_implicit)out.withSuggestions++;
  for(const attempt of attempts){
   if(attempt.status==="accepted")out.accepted++;
   else if(attempt.status==="rejected")out.rejected++;
   else if(attempt.status==="none")out.returnedNone++;
   else if(attempt.status==="model_error")out.errors++;
  }
  if(typeof item.expected_implicit==="boolean"){
   out.labelledProvided++;
   if(attempts.some(a=>a.status==="model_error")){
    out.unscoredModelErrors++;
    continue;
   }
   out.labelled++;
   if(item.expected_implicit&&item.predicted_implicit)out.tp++;
   else if(!item.expected_implicit&&item.predicted_implicit)out.fp++;
   else if(item.expected_implicit&&!item.predicted_implicit)out.fn++;
   else out.tn++;
  }
 }
 // Null, not 0%: an undefined denominator is not measured precision/recall.
 out.precision=out.tp+out.fp?out.tp/(out.tp+out.fp):null;
 out.recall=out.tp+out.fn?out.tp/(out.tp+out.fn):null;
 out.accuracy=out.labelled?(out.tp+out.tn)/out.labelled:null;
 return out;
}
