// Conservative, bounded claim completion for the *model input only*.
// Keep source text and offsets unchanged for rendering or quotation.
// Media posts frequently omit a repeated subject after "and therefore":
// "The service raised prices and therefore expects higher revenue."
// The NLI hypothesis should be "The service expects higher revenue."
//
// Do not guess missing arguments, invent evidence, or resolve ambiguous pronouns.
const FINITE_VERB = /\b(?:is|are|was|were|has|have|had|will|would|can|could|may|might|must|does|do|did|appears?|seems?|expects?|intends?|claims?|reports?|finds?|found|shows?|says?|said|raises?|raised|cuts?|cut|changed?|changes?|reduced?|reduces?|increased?|increases?|offers?|offered|serves?|served|receives?|received|continues?|continued|keeps?|kept|faces?|faced|carry|carries|believes?|believed)\b/gi;
const BARE_PREDICATE = /^(?:is|are|was|were|has|have|had|will|would|can|could|may|might|must|does|do|did|appears?|seems?|expects?|intends?|claims?|reports?|finds?|found|shows?|says?|said|raises?|raised|cuts?|cut|changes?|changed|reduces?|reduced|increases?|increased|offers?|offered|serves?|served|receives?|received|continues?|continued|keeps?|kept|faces?|faced|carry|carries|believes?|believed)\b/i;
const NOT_SUBJECT = /^(?:because|since|although|however|while|when|if|after|before|according|by|for|in|on|at|under|without|as|despite|given)\b/i;

function sharedSubject(premise) {
 if (typeof premise !== 'string') return null;
 const text=premise.trim();
 FINITE_VERB.lastIndex=0;
 let match;
 while ((match=FINITE_VERB.exec(text))) {
  const subject=text.slice(0,match.index).trim();
  // Restrict this to an uncomplicated clause-initial subject, not the subject
  // of a subordinate clause or something reconstructed from other sentences.
  if (!subject || subject.length>75 || subject.split(/\s+/).length>9 ||
      /[,;:.!?()\n]/.test(subject) || NOT_SUBJECT.test(subject)) return null;
  if (!/^[A-Z]/.test(subject) &&
      !/^(?:the|a|an|this|that|these|those|our|my|your|their|his|her|we|they|you|he|she|i)\b/i.test(subject))
   return null;
  if (/\b(?:that|which|who|whom|whose)\b/i.test(subject)) return null;
  return subject;
 }
 return null;
}

export function normaliseClaimForNli(argument) {
 const original=argument?.conclusion?.text;
 if (typeof original!=='string') return {text:'',expanded:false,reason:'invalid_conclusion'};
 const marker=argument.conclusion.marker||'';
 const isSharedCoordination=argument.conclusion.inline===true &&
  /^(?:therefore|thus|hence|consequently|accordingly)$/.test(marker.trim().toLowerCase()) &&
  argument.premises?.length===1 &&
  argument.premises[0]?.end<=argument.conclusion.start;
 if (!isSharedCoordination || !BARE_PREDICATE.test(original))
  return {text:original,expanded:false,reason:'unchanged'};
 const subject=sharedSubject(argument.premises[0].text);
 if (!subject) return {text:original,expanded:false,reason:'subject_uncertain'};
 return {text:subject+' '+original,expanded:true,reason:'shared_subject'};
}
