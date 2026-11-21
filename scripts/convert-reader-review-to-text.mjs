#!/usr/bin/env node
/**
 * Convert existing locally generated blind review TSV forms into plain text
 * for editing with Notepad, without Excel or spreadsheet software.
 * Reads only private local forms; no public-source text is committed.
 *
 * node scripts/convert-reader-review-to-text.mjs
 */
import {readFile,writeFile,access} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const local=name=>path.join(ROOT,"evaluation",name);
export const HEADER=[
 "reviewer","case_id","first_sentence","second_sentence",
 "judgement","confidence","notes"
].join("\t");
const labels=[
 "and_only — second sentence adds to or continues the first",
 "but_only — second sentence contrasts with or qualifies the first",
 "both — both interpretations are reasonable",
 "neither — neither relationship fits",
 "uncertain — not enough context to decide"
];
export function plainTextReview(tsv,reviewer){
 if(typeof tsv!=="string"||!["A","B"].includes(reviewer))
  throw Error("Invalid TSV or reviewer");
 const lines=tsv.replace(/\r?\n$/u,"").split(/\r?\n/u);
 if(lines.shift()!==HEADER)throw Error("Unexpected blind review columns");
 const cases=lines.map((line,i)=>{
  const cells=line.split("\t");
  if(cells.length!==7||cells[0]!==reviewer||
   !/^R\d{3}$/u.test(cells[1])||
   !cells[2].trim()||!cells[3].trim())
   throw Error("Malformed sentence pair at row "+(i+1));
  return {id:cells[1],first:cells[2],second:cells[3],
   judgement:cells[4],confidence:cells[5],notes:cells[6]};
 });
 if(cases.length!==48||
  new Set(cases.map(c=>c.id)).size!==48)
  throw Error("Expected 48 unique blind review cases");
 const out=[
  "BLIND SENTENCE REVIEW — REVIEWER "+reviewer,
  "=".repeat(52),"",
  "Assess how the second sentence relates to the first.",
  "Write one of these exact values after Judgement:",
  ...labels.map(x=>"  "+x),"",
  "Confidence (optional): 1 low, 2 medium, 3 high.",
  "Fill only Judgement, Confidence and Notes; preserve case IDs and sentences.",
  "Work independently and do not consult the other reviewer or answer key.",
  ""
 ];
 for(const [i,c] of cases.entries()){
  out.push("-".repeat(72),"",
   "CASE "+String(i+1).padStart(2,"0")+" / 48 ["+c.id+"]","",
   "Sentence 1:",c.first,"",
   "Sentence 2:",c.second,"",
   "Judgement: "+c.judgement,
   "Confidence: "+c.confidence,
   "Notes: "+c.notes,""
  );
 }
 return out.join("\n")+"\n";
}
async function main(){
 const args=process.argv.slice(2);
 if(args.includes("--help")||args.includes("-h")){
  console.log("node scripts/convert-reader-review-to-text.mjs");
  console.log("Converts existing private A/B TSV sheets into Notepad .txt files.");
  return;
 }
 if(args.length)throw Error("No options accepted");
 for(const reviewer of ["A","B"]){
  const input=local("reader-contrast-reviewer-"+reviewer.toLowerCase()+"-v1.tsv");
  const output=local("reader-contrast-reviewer-"+reviewer.toLowerCase()+"-v1.txt");
  try{await access(output);throw Error(
   "Refusing to overwrite existing review: "+output);
  }catch(e){if(e.code!=="ENOENT")throw e;}
  const result=plainTextReview(await readFile(input,"utf8"),reviewer);
  await writeFile(output,result);
  console.log("Created Notepad-friendly review: "+output);
 }
 console.log("After both people finish, upload the two edited .txt files to ChatGPT.");
 console.log("Do not commit the forms: they contain third-party source text.");
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
 main().catch(e=>{console.error(e?.stack||e);process.exitCode=1;});
