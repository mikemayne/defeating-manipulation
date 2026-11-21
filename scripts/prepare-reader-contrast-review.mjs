#!/usr/bin/env node
/**
 * Prepare two independent blind AND/BUT human-review sheets (48 real pairs).
 * Usage: node scripts/prepare-reader-contrast-review.mjs --offline
 * The private answer key must never be shared with a reviewer or committed.
 */
import {readFile,writeFile,access,mkdir} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {trainFusion} from "./evaluate-reader-fusion.mjs";
import {transferRows,syntheticTraining,scoreBatch}
 from "./evaluate-reader-gum-transfer.mjs";
import {documentFolds,FEATURE_SETS}
 from "./evaluate-reader-gum-but-cv.mjs";
import {verifyExpansion} from "./build-reader-gum-contrast-expansion.mjs";
import {chooseReviewCases,reviewSheet}
 from "./reader-contrast-review-core.mjs";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const file=n=>path.join(ROOT,"evaluation",n);
const INPUT={
 base:file("reader-gum-transfer-v1.json"),
 oldManifest:file("reader-authentic-transfer-documents-v1.json"),
 newManifest:file("reader-gum-contrast-expanded-documents-v1.json"),
 but:file("reader-gum-contrast-expansion-v1.json"),
 previousAudit:file("reader-contrast-error-audit-v1.json"),
 oldJoin:file("reader-join-cross-validation.json"),
 oldMask:file("reader-mask-infill.json"),
 oldDataset:file("reader-strategy-synthetic-reference.json"),
 v1Scores:file("reader-holdout-v1-scores.json"),
 previousSemantic:file("reader-semantic-pair-scores.json"),
 trainLm:file("reader-gum-transfer-train-lm-v1.json"),
 trainSem:file("reader-gum-transfer-train-sem-v1.json"),
 butLm:file("reader-gum-contrast-expansion-lm-v1.json"),
 butSem:file("reader-gum-contrast-expansion-sem-v1.json")
};
const OUTPUT={
 key:file("reader-contrast-review-key-v1.json"),
 a:file("reader-contrast-reviewer-a-v1.tsv"),
 b:file("reader-contrast-reviewer-b-v1.tsv"),
 instructions:file("reader-contrast-review-instructions-v1.md")
};
const json=p=>readFile(p,"utf8").then(JSON.parse);
export function alreadyDisplayed(audit){
 if(!audit||typeof audit!=="object"||!audit.outcomes)
  throw Error("Previously inspected error audit required for blind exclusion");
 const ids=new Set();
 for(const scenario of Object.values(audit.outcomes)){
  for(const label of ["false_but","missed_but"]){
   if(!Array.isArray(scenario.cases?.[label]))
    throw Error("Previous audit lacks category exclusions");
   for(const row of scenario.cases[label].slice(0,3))ids.add(row.id);
  }
 }
 return [...ids];
}
export function buildFrozenOutOfFold(synthetic,original,extraBut){
 if(synthetic.length!==402||original.length!==308||
  extraBut.length!==110)
  throw Error("Expected unchanged 402/308/110 score caches");
 const heldouts=documentFolds(original),classified=[];
 const keys=FEATURE_SETS["full-fusion"];
 for(const fold of heldouts){
  const hidden=new Set(fold.documents);
  const training=[...synthetic,
   ...original.filter(r=>!hidden.has(r.document)),
   ...extraBut.filter(r=>!hidden.has(r.document))]
   .filter(r=>!r.explicit);
  if(training.some(r=>hidden.has(r.document)))
   throw Error("Held-out source document entered training");
  const model=trainFusion(training,keys,{
   balanced:true,classWeights:{keep:1,and:1,but:1}
  });
  for(const r of fold.rows)classified.push({
   id:r.id,document:r.document,genre:r.genre,
   left:r.left,right:r.right,gold:r.gold,
   predicted:r.explicit?.choice??model(r),
   explicitChoice:r.explicit?.choice??null,
   modelButScore:model.probabilities(r).but
  });
 }
 if(new Set(classified.map(r=>r.id)).size!==308)
  throw Error("CV lost examples");
 const correct=classified.filter(r=>r.gold===r.predicted).length;
 const predictedBut=classified.filter(r=>r.predicted==="but").length;
 if(correct!==187||predictedBut!==113)
  throw Error("Historical CV baseline changed: correct "+correct+
   " (expected 187), predicted BUT "+predictedBut+" (expected 113)");
 return classified;
}
export const INSTRUCTIONS=[
 "# Blind review of 48 genuine sentence pairs",
 "",
 "Reviewer A and B receive the same pairs in different random orders.",
 "Please use TWO DIFFERENT people. Do not consult either the answer key",
 "or the other reviewer's answers until both sheets are complete.",
 "",
 "Edit ONLY judgement, confidence and notes in your assigned TSV.",
 "",
 "Allowed judgement: and_only, but_only, both, neither, uncertain.",
 "and_only: The second sentence continues or adds to the first.",
 "but_only: The second sentence introduces a meaningful contrast,",
 "  qualification, or violation of a reasonable expectation.",
 "both: Both the AND and BUT interpretations are reasonable.",
 "neither: Neither relationship seems coherent.",
 "uncertain: Not enough context or confidence to make a judgement.",
 "",
 "Judge meaning, not simply whether a conjunction is grammatical.",
 "Negation inside one sentence does not by itself establish a",
 "contrast between the two. When both readings are reasonable,",
 "choose BOTH rather than forcing a false distinction.",
 "",
 "Confidence: optional 1 (low), 2 (medium), 3 (high).",
 "Notes: optional, one line per row; no tabs or newlines inside cells.",
 "Do not change reviewer, case_id, first_sentence or second_sentence.",
 "",
 "The sample is deliberately balanced across model disagreements and",
 "correct controls. It is NOT representative of natural prevalence.",
 "Original GDTB labels and model predictions are concealed.",
 "",
 "After independent reviews, run:",
 "node scripts/finalize-reader-contrast-review.mjs --reviewer-a PersonA --reviewer-b PersonB",
 "",
 "Generated packets contain third-party writing. DO NOT COMMIT THEM.",
 "The answer key is private until both reviewers finish.",
 ""
].join("\n");
function args(argv){
 let preview=false;
 for(const arg of argv){
  if(arg==="--help"||arg==="-h"){
   console.log("node scripts/prepare-reader-contrast-review.mjs "+
    "[--preview] [--offline]\n"+
    "Creates two TSV reviewer sheets and a separate PRIVATE answer key.");
   process.exit(0);
  }
  if(arg==="--preview")preview=true;
  else if(arg!=="--offline")throw Error("Invalid option "+arg);
 }
 return {preview};
}
async function main(){
 const {preview}=args(process.argv.slice(2));
 const [corpus,old,manifest,but,previousAudit]=await Promise.all([
  json(INPUT.base),json(INPUT.oldManifest),json(INPUT.newManifest),
  json(INPUT.but),json(INPUT.previousAudit)
 ]);
 verifyExpansion(but,corpus,old,manifest);
 const excludes=alreadyDisplayed(previousAudit);
 const original=transferRows(corpus.train);
 const extraBut=transferRows(but.cases);
 if(preview){
  console.log("Blind review: "+original.length+" authentic TRAIN pairs, "+
   excludes.length+" previously displayed excluded; no inference.");
  return;
 }
 for(const [name,filename] of Object.entries(OUTPUT)){
  try{
   await access(filename);
   throw Error("Refusing to overwrite existing "+name+" at "+filename);
  }catch(e){if(e.code!=="ENOENT")throw e;}
 }
 const synthetic=await syntheticTraining(INPUT);
 const genuine=(await scoreBatch(original,{
  lmPath:INPUT.trainLm,semPath:INPUT.trainSem,offline:true,
  hash:corpus.meta.selectionHash+"|train"
 })).rows;
 const expanded=(await scoreBatch(extraBut,{
  lmPath:INPUT.butLm,semPath:INPUT.butSem,offline:true,
  hash:but.meta.selectionHash+"|training-only-contrast"
 })).rows;
 const classified=buildFrozenOutOfFold(synthetic,genuine,expanded);
 const key=chooseReviewCases(classified,{excludedIds:excludes});
 if(key.count!==48)throw Error("Unexpected blind review count");
 await mkdir(path.dirname(OUTPUT.key),{recursive:true});
 await Promise.all([
  writeFile(OUTPUT.key,JSON.stringify(key,null,2)+"\n"),
  writeFile(OUTPUT.a,reviewSheet(key,"A")),
  writeFile(OUTPUT.b,reviewSheet(key,"B")),
  writeFile(OUTPUT.instructions,INSTRUCTIONS)
 ]);
 console.log("BLIND REVIEW: "+key.count+" pairs from "+
  new Set(key.items.map(r=>r.document)).size+" original documents and "+
  new Set(key.items.map(r=>r.genre)).size+" genres.");
 console.log("Reviewer sheets shuffled independently.");
 console.log("Private answer key (never share before review): "+OUTPUT.key);
 console.log("Reviewer A: "+OUTPUT.a);
 console.log("Reviewer B: "+OUTPUT.b);
 console.log("Instructions: "+OUTPUT.instructions);
 console.log("Only local cached scores used; no fresh inference.");
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
 main().catch(e=>{console.error(e?.stack||e);process.exitCode=1;});
