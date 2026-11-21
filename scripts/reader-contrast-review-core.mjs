#!/usr/bin/env node
/**
 * Source-free core for blind, two-reviewer AND/BUT ambiguity study.
 * All real sentence data are passed at runtime and MUST remain gitignored.
 *
 * Deliberately separates (1) review selection/key, (2) blind shuffled
 * reviewer sheets, and (3) final comparison with labels/model outputs.
 */
import {createHash} from "node:crypto";

export const VERSION="reader-contrast-blind-review-v1";
export const SEED="20261121-and-but-ambiguity-v1";
export const TARGET_PER_STRATUM=12;
export const STRATA=Object.freeze([
 "false_but","missed_but","correct_but","correct_and"
]);
export const LABELS=Object.freeze([
 "and_only","but_only","both","neither","uncertain"
]);
export const REVIEW_HEADER=Object.freeze([
 "reviewer","case_id","first_sentence","second_sentence",
 "judgement","confidence","notes"
]);
export const sha=x=>createHash("sha256").update(String(x)).digest("hex");
const clean=x=>String(x??"").replace(/\s+/gu," ").trim();
// Safe for direct import into Excel/LibreOffice; do not allow a source
// sentence to start a spreadsheet formula.
export function safeCell(x){
 const s=clean(x).replace(/\t/gu," ");
 return /^[=+\-@]/u.test(s)?"'"+s:s;
}
export function stratum(row){
 if(row.gold==="but")return row.predicted==="but"?
  "correct_but":"missed_but";
 if(row.gold==="and")return row.predicted==="but"?
  "false_but":row.predicted==="and"?"correct_and":null;
 throw Error("Only authentic AND/BUT-labelled rows supported");
}
export function chooseReviewCases(rows,{
 excludedIds=[],seed=SEED,perStratum=TARGET_PER_STRATUM
}={}){
 if(!Array.isArray(rows)||rows.length<100||
  !Number.isSafeInteger(perStratum)||perStratum<1||perStratum>30||
  !Array.isArray(excludedIds)||!seed)
  throw Error("Invalid authentic review selection inputs");
 const excluded=new Set(excludedIds),all=new Set();
 const bins=Object.fromEntries(STRATA.map(k=>[k,[]]));
 for(const row of rows){
  if(typeof row.id!=="string"||all.has(row.id)||
   !row.document||!row.genre||
   !["and","but"].includes(row.gold)||
   !["and","but","keep"].includes(row.predicted)||
   typeof row.left!=="string"||!row.left.trim()||
   typeof row.right!=="string"||!row.right.trim())
   throw Error("Malformed or duplicate authentic row");
  all.add(row.id);
  if(excluded.has(row.id)||row.explicitChoice)continue;
  const bucket=stratum(row);
  if(bucket)bins[bucket].push(row);
 }
 const selected=[],documents=new Map(),genres=new Map();
 for(const bucket of STRATA){
  for(let n=0;n<perStratum;n++){
   const candidates=bins[bucket].filter(row=>!selected.some(x=>x.id===row.id)&&
    (documents.get(row.document)??0)<3&&(genres.get(row.genre)??0)<8);
   if(!candidates.length)throw Error(
    "Too few eligible source-diverse "+bucket+" examples ("+n+
    "/"+perStratum+")");
   candidates.sort((a,b)=>
    (documents.get(a.document)??0)-(documents.get(b.document)??0)||
    (genres.get(a.genre)??0)-(genres.get(b.genre)??0)||
    sha(seed+"|"+bucket+"|"+a.id)
     .localeCompare(sha(seed+"|"+bucket+"|"+b.id)));
   const chosen=candidates[0];
   selected.push({...chosen,selectionBucket:bucket});
   documents.set(chosen.document,(documents.get(chosen.document)??0)+1);
   genres.set(chosen.genre,(genres.get(chosen.genre)??0)+1);
  }
 }
 // IDs are not the original GUM IDs; nor do they betray gold or error status.
 selected.sort((a,b)=>sha(seed+"|assign|"+a.id)
  .localeCompare(sha(seed+"|assign|"+b.id)));
 const items=selected.map((r,i)=>({
  caseId:"R"+String(i+1).padStart(3,"0"),
  originalId:r.id,document:r.document,genre:r.genre,
  first:safeCell(r.left),second:safeCell(r.right),
  gold:r.gold,model:r.predicted,selectionBucket:r.selectionBucket,
  explicitChoice:r.explicitChoice??null,
  modelButScore:Number.isFinite(r.modelButScore)?r.modelButScore:null
 }));
 const fingerprint=sha(JSON.stringify(items.map(r=>[
  r.caseId,r.originalId,r.first,r.second,r.gold,r.model
 ])));
 return {
  version:VERSION,sourceFingerprint:fingerprint,
  design:"48 purposively balanced authentic training pairs; 12 per hidden "+
   "argmax-vs-GDTB stratum. 3 cases maximum per document and "+
   "8 per genre. Previously displayed examples excluded; reviewer "+
   "order independently shuffled. NOT representative prevalence.",
  count:items.length,items
 };
}
function tsvRows(rows){return [REVIEW_HEADER.join("\t"),...rows.map(r=>
 REVIEW_HEADER.map(k=>safeCell(r[k])).join("\t"))].join("\n")+"\n";}
export function reviewSheet(key,reviewer){
 if(key?.version!==VERSION||!Array.isArray(key.items)||
  !key.items.length||!["A","B"].includes(reviewer))
  throw Error("Missing review key or invalid reviewer");
 const ordered=[...key.items].sort((a,b)=>
  sha(SEED+"|reviewer-"+reviewer+"|"+a.caseId)
   .localeCompare(sha(SEED+"|reviewer-"+reviewer+"|"+b.caseId)));
 return tsvRows(ordered.map(r=>({
  reviewer,case_id:r.caseId,first_sentence:r.first,
  second_sentence:r.second,judgement:"",confidence:"",notes:""
 })));
}
export function parseReviewSheet(text,key,reviewer,{
 allowIncomplete=false
}={}){
 if(typeof text!=="string"||key?.version!==VERSION||
  !["A","B"].includes(reviewer))
  throw Error("Invalid reviewer sheet or key");
 const lines=text.trimEnd().split(/\r?\n/u);
 if(lines.shift()!==REVIEW_HEADER.join("\t"))
  throw Error("Reviewer sheet columns changed");
 const expected=new Map(key.items.map(r=>[r.caseId,r])),seen=new Map();
 for(const line of lines){
  const cells=line.split("\t");
  if(cells.length!==REVIEW_HEADER.length)
   throw Error("Unexpected tabs/newlines in reviewer sheet");
  const [who,id,first,second,judgement,confidence,notes]=cells;
  if(who!==reviewer||seen.has(id)||!expected.has(id))
   throw Error("Wrong reviewer, unknown or duplicate case "+id);
  const item=expected.get(id);
  if(first!==item.first||second!==item.second)
   throw Error("Review source text altered at "+id);
  const label=clean(judgement).toLowerCase();
  const conf=clean(confidence);
  if(!label){
   if(!allowIncomplete)throw Error("Missing judgement for "+id);
  }else if(!LABELS.includes(label))throw Error("Invalid judgement for "+id);
  if(conf&&!["1","2","3"].includes(conf))
   throw Error("Confidence must be blank or 1/2/3 at "+id);
  seen.set(id,{caseId:id,judgement:label||null,
   confidence:conf?Number(conf):null,notes:clean(notes)});
 }
 if(seen.size!==key.items.length)
  throw Error("Review sheet is incomplete: expected "+key.items.length+
   " rows, received "+seen.size);
 return seen;
}
const compatible=(gold,label)=>
 label==="both"||
 gold==="and"&&label==="and_only"||
 gold==="but"&&label==="but_only";
export function reconcileReviews(key,reviewA,reviewB){
 if(key?.version!==VERSION||!(reviewA instanceof Map)||
  !(reviewB instanceof Map)||reviewA.size!==key.items.length||
  reviewB.size!==key.items.length)
  throw Error("Both complete independent reviews required");
 const matrix=Object.fromEntries(LABELS.map(a=>[
  a,Object.fromEntries(LABELS.map(b=>[b,0]))
 ]));
 const cases=[],labels={};
 let agree=0,usable=0,modelCompatible=0,goldCompatible=0;
 for(const item of key.items){
  const a=reviewA.get(item.caseId),b=reviewB.get(item.caseId);
  if(!a||!b||!LABELS.includes(a.judgement)||
   !LABELS.includes(b.judgement))
   throw Error("Two complete valid review judgements required");
  matrix[a.judgement][b.judgement]++;
  const agreement=a.judgement===b.judgement;
  if(agreement)agree++;
  const consensus=agreement&&a.judgement!=="uncertain"?
   a.judgement:null;
  if(consensus){
   usable++;
   goldCompatible+=Number(compatible(item.gold,consensus));
   modelCompatible+=Number(compatible(item.model,consensus));
   labels[consensus]=(labels[consensus]??0)+1;
  }
  cases.push({caseId:item.caseId,reviewerA:a.judgement,
   reviewerB:b.judgement,consensus,gold:item.gold,
   model:item.model,bucket:item.selectionBucket,
   gdtbCompatible:consensus===null?null:compatible(item.gold,consensus),
   modelCompatible:consensus===null?null:compatible(item.model,consensus)
  });
 }
 const n=cases.length;
 const expected=LABELS.reduce((s,k)=>
  s+(LABELS.reduce((v,b)=>v+matrix[k][b],0)/n)*
  (LABELS.reduce((v,a)=>v+matrix[a][k],0)/n),0);
 const observed=agree/n;
 const kappa=expected>=1-1e-12?1:(observed-expected)/(1-expected);
 const byStratum=Object.fromEntries(STRATA.map(bucket=>{
  const items=cases.filter(r=>r.bucket===bucket);
  return [bucket,{
   sampled:items.length,agreement:items.filter(r=>
    r.reviewerA===r.reviewerB).length,
   usable:items.filter(r=>r.consensus!==null).length,
   gdtbIncompatible:items.filter(r=>r.gdtbCompatible===false).length,
   modelIncompatible:items.filter(r=>r.modelCompatible===false).length
  }];
 }));
 return {
  version:VERSION,sourceFingerprint:key.sourceFingerprint,
  methodology:"Two separate reviewers; classification blinded to "+
   "GDTB mapping and model predictions; balanced error-based sample "+
   "is NOT representative of natural frequencies.",
  sampled:n,agreementCount:agree,agreementRate:observed,
  cohenKappa:kappa,usableConsensus:usable,
  uncertainOrDisagreed:n-usable,
  consensusLabels:labels,
  gdtbCompatibleInConsensus:goldCompatible,
  modelCompatibleInConsensus:modelCompatible,
  byStratum,disagreementCount:n-agree,confusion:matrix,
  // IDs and labels only; no copied source content.
  caseAssessments:cases
 };
}
export function adjudicationSheet(key,reviewA,reviewB){
 const lines=["case_id\tfirst_sentence\tsecond_sentence\t"+
  "reviewer_a\treviewer_b\tadjudicated_label\tnotes"];
 for(const item of key.items){
  const a=reviewA.get(item.caseId),b=reviewB.get(item.caseId);
  if(!a||!b)throw Error("Incomplete review");
  if(a.judgement===b.judgement&&a.judgement!=="uncertain")continue;
  lines.push([item.caseId,item.first,item.second,a.judgement,
   b.judgement,"",""].map(safeCell).join("\t"));
 }
 return lines.join("\n")+"\n";
}
