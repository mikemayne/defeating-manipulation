// Fast, deterministic, source-offset-preserving argument structure extraction.
// This module finds candidate premise/conclusion relationships; it never judges
// whether a conclusion is supported. Keep that decision in the NLI layer.
import { attributedSource } from './consistency.mjs';

const MAX_STATEMENTS = 80;
const MAX_ARGUMENTS = 8;
const MAX_PREMISES = 5;
const MAX_PREMISE_CHARS = 780;
const MAX_CONCLUSION_CHARS = 280;
const MAX_PARAGRAPH_BREAKS = 1;
const WORD = /\b[\w'-]+\b/g;
const NORMATIVE = /\b(?:should|ought|recommend|consider|prefer|hope|wish)\b|\b(?:we|you)\s+(?:(?:may|might|could|can)\s+)?(?:need to|want to|plan to|intend to)\b/i;
const LEADING_CONCLUSION = /^(?:(?:and|but)\s+)?(therefore|thus|hence|consequently|accordingly|as a result|it follows that|we can conclude that|this (?:shows|proves|demonstrates|confirms|means)(?: that)?|these (?:results|findings) (?:show|prove|demonstrate)(?: that)?|the evidence (?:shows|proves)(?: that)?|so)\s*[,;:\s]\s*/i;
const RESULT_MARKER = /\b(?:therefore|thus|hence|consequently|accordingly|as a result)\b\s*[,;:]?\s*/gi;
const INLINE_INFERENCE = /,\s*(?:which|and this)\s+(?:means|suggests|implies)(?:\s+that)?\s+|\b(?:indicates|suggests|implies|demonstrates|shows|indicating|suggesting|implying|showing)\s+that\s+/gi;
const POST_REASON = /\bbecause\s+/gi;
const LEADING_REASON = /^(?:however,\s*)?(because|since|given that|as)\s+/i;
const CONCLUDED = /,\s*(?:so\s+)?(?:(?:we|they|the\s+[\w'-]+(?:\s+[\w'-]+){0,3})\s+)?(?:concluded|determined)\s+(?:that\s+)?/gi;
const PARTICIPLE = /,\s*(?:(?:thereby|thus)\s+)?(?:making|meaning|putting|resulting in)\s+/gi;
const FOLLOWING_REASON = /^(?:this|that)\s+is\s+because\s+/i;

function words(text) { return (text.match(WORD) || []).length; }
function insideOpenQuote(text) {
 // A connective inside a quoted example is not the document's own inference.
 return ((text.match(/['\"“”‘’]/g) || []).length % 2) !== 0;
}
function paragraphBreaks(between) { return Math.floor((between.match(/\n/g) || []).length / 2); }

// Unlike /[^.!?]+/ this retains decimal points and ordinary domain names
// (for example trustedguide.org) inside a statement.
export function extractArgumentStatements(source) {
 if (typeof source !== 'string') return [];
 const found = [];
 let from = 0;
 function push(to) {
  let start = from, end = to;
  while (start < end && /\s/.test(source[start])) start++;
  while (end > start && /\s/.test(source[end - 1])) end--;
  const text = source.slice(start, end);
  if (text.length <= 550 && words(text) >= 3) found.push({start, end, text});
 }
 for (let i = 0; i < source.length && found.length < MAX_STATEMENTS; i++) {
  const c = source[i];
  if (c === '.' && /[\p{L}\d]/u.test(source[i-1] || '') &&
      /[\p{L}\d]/u.test(source[i+1] || '')) continue;
  if (c === '\n' || c === ';' || c === '.' || c === '?' || c === '!') {
   let end = i + 1;
   if (c === '.' || c === '!' || c === '?') {
    while (/[.!?]/.test(source[end] || '') && end < source.length) end++;
   }
   push(end);
   from = end;
   i = end - 1;
  }
 }
 if (from < source.length && found.length < MAX_STATEMENTS) push(source.length);
 return found;
}

function span(source, start, end, {stripIntro=false}={}) {
 while (start < end && /[\s,;:]/.test(source[start])) start++;
 while (end > start && /[\s,;:]/.test(source[end-1])) end--;
 if (stripIntro) {
  const m = /^(?:however,\s*)?(?:therefore|thus|hence|consequently|accordingly|as a result)\s*[,;:]?\s*/i.exec(source.slice(start,end));
  if (m) start += m[0].length;
 }
 return {start, end, text:source.slice(start,end)};
}
function argument(source, premise, conclusion, marker, inline=true) {
 if (!premise || !conclusion || premise.end <= premise.start ||
     conclusion.end <= conclusion.start || words(premise.text) < 3 ||
     words(conclusion.text) < 3 || conclusion.text.length < 12 ||
     conclusion.text.length > MAX_CONCLUSION_CHARS ||
     /[?!]\s*$/.test(conclusion.text) || NORMATIVE.test(conclusion.text)) return null;
 return {premise:premise.text, premises:[premise],
  conclusion:{...conclusion, marker:marker.toLowerCase(), inline},
  start:Math.min(premise.start, conclusion.start),
  end:Math.max(premise.end, conclusion.end)};
}
function inside(source, s) {
 const t=s.text, start=s.start;
 if (/[?!]\s*$/.test(t) || attributedSource(t)) return null;
 let m;
 // "Because the figures changed, the panel concluded ..."
 m=LEADING_REASON.exec(t);
 if (m) {
  const comma=t.indexOf(',',m[0].length);
  if (comma > 0 && words(t.slice(m[0].length,comma)) >= 4) {
   const prem=span(source,start+m[0].length,start+comma);
   let endStart=start+comma+1;
   const tail=t.slice(comma+1);
   const said=/^\s*(?:(?:we|they|the\s+[\w'-]+(?:\s+[\w'-]+){0,3})\s+)?(?:concluded|determined)\s+(?:that\s+)?/i.exec(tail);
   if (said) endStart+=said[0].length;
   const a=argument(source,prem,span(source,endStart,s.end),m[1]);
   if(a) return a;
  }
 }
 // "Therefore, X because Y": reason is within the same sentence.
 POST_REASON.lastIndex=0;
 while ((m=POST_REASON.exec(t))) {
  if (m.index === 0 || /^of\b/i.test(t.slice(POST_REASON.lastIndex))) continue;
  const left=span(source,start,start+m.index,{stripIntro:true});
  const right=span(source,start+POST_REASON.lastIndex,s.end);
  const a=argument(source,right,left,'because');
  if(a) return a;
 }
 // "... , we concluded [that] Y" (reason precedes verdict).
 CONCLUDED.lastIndex=0;
 while ((m=CONCLUDED.exec(t))) {
  const prem=span(source,start,start+m.index);
  const cons=span(source,start+CONCLUDED.lastIndex,s.end);
  // A reference to unspecified "reasons" is not a supplied premise.
  if (words(prem.text) < 4 || /^for (?:those|these|the) reasons?[,.]?$/i.test(prem.text)) continue;
  const a=argument(source,prem,cons,'concluded');
  if(a) return a;
 }
 // "X, therefore Y" and "X and therefore Y".
 RESULT_MARKER.lastIndex=0;
 while ((m=RESULT_MARKER.exec(t))) {
  if (m.index === 0) continue;
  let before=t.slice(0,m.index);
  if (insideOpenQuote(before)) continue;
  // "and therefore" makes the conjunction part of the bridge.
  const tail=/\s+and\s*$/i.exec(before);
  const beforeEnd=m.index-(tail?.[0].length||0);
  const prem=span(source,start,start+beforeEnd);
  const cons=span(source,start+RESULT_MARKER.lastIndex,s.end);
  // "physics is, therefore, necessary" splits an unfinished predicate;
  // a following "This is because" sentence is handled below.
  if (words(prem.text) < 5 ||
      /\b(?:is|are|was|were|be|been|being|has|have|had|can|could|may|might|will|would|must|shall|should)\s*$/i.test(prem.text)) continue;
  const a=argument(source,prem,cons,m[0].trim());
  if(a) return a;
 }
 // "... indicates that ..." and "..., which means ...".
 INLINE_INFERENCE.lastIndex=0;
 while ((m=INLINE_INFERENCE.exec(t))) {
  const prem=span(source,start,start+m.index);
  const cons=span(source,start+INLINE_INFERENCE.lastIndex,s.end);
  if (words(prem.text) < 7 ||
      /\bevidence\b/i.test(prem.text) && /\b(?:evidence|data|research)\b\s*$/i.test(prem.text)) continue;
  const a=argument(source,prem,cons,m[0].trim());
  if(a) return a;
 }
 // "... will be the first, putting the country in the lead".
 PARTICIPLE.lastIndex=0;
 while ((m=PARTICIPLE.exec(t))) {
  const prem=span(source,start,start+m.index);
  const cons=span(source,start+PARTICIPLE.lastIndex,s.end);
  if (words(prem.text) < 7 || words(cons.text) < 5) continue;
  const a=argument(source,prem,cons,m[0].trim());
  if(a) return a;
 }
 return null;
}

function precedingPremises(source, statements, index) {
 const preceding=[];
 let usedChars=0, totalParagraphBreaks=0, cursor=statements[index].start;
 for (let j=index-1;j>=0 && preceding.length<MAX_PREMISES;j--) {
  const s=statements[j];
  totalParagraphBreaks+=paragraphBreaks(source.slice(s.end,cursor));
  if (totalParagraphBreaks>MAX_PARAGRAPH_BREAKS || usedChars+s.text.length+1>MAX_PREMISE_CHARS ||
      s.text.trim().startsWith('>')) break;
  preceding.unshift(s);
  usedChars+=s.text.length+1;
  cursor=s.start;
 }
 return preceding;
}
export function extractArguments(source) {
 const statements=extractArgumentStatements(source);
 const results=[];
 for (let i=0;i<statements.length && results.length<MAX_ARGUMENTS;i++) {
  const s=statements[i];
  if (FOLLOWING_REASON.test(s.text) && i>0) {
   const m=FOLLOWING_REASON.exec(s.text);
   const premise=span(source,s.start+m[0].length,s.end);
   const conclusion=span(source,statements[i-1].start,statements[i-1].end);
   if (!attributedSource(conclusion.text) &&
       paragraphBreaks(source.slice(conclusion.end,premise.start))<=MAX_PARAGRAPH_BREAKS) {
    const a=argument(source,premise,conclusion,'this is because');
    if (a) results.push(a);
   }
   continue;
  }
  const inline=inside(source,s);
  if (inline) {results.push(inline);continue;}
  if (attributedSource(s.text)) continue;
  const marker=LEADING_CONCLUSION.exec(s.text);
  if (!marker) continue;
  const prior=precedingPremises(source,statements,i);
  if (!prior.length) continue;
  const conclusion=span(source,s.start+marker[0].length,s.end);
  if (words(conclusion.text)<3 || conclusion.text.length<12 ||
      conclusion.text.length>MAX_CONCLUSION_CHARS || /[?!]\s*$/.test(conclusion.text) ||
      NORMATIVE.test(conclusion.text)) continue;
  const combined=prior.map(x=>x.text).join(' ');
  results.push({premise:combined, premises:prior,
   conclusion:{...conclusion,marker:marker[1].toLowerCase()},
   start:prior[0].start,end:conclusion.end});
 }
 return results;
}