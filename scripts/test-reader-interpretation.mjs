import assert from "node:assert/strict";
import {
 READER_RELATIONS, extractReaderPairs, scoreReaderInterpretations,
 validateReaderCases
} from "../extension/src/reader-interpretation.mjs";

// All fixtures are invented; no real-world excerpts enter Git.
function scores(entailment){
 return {entailment,neutral:1-entailment,contradiction:0};
}
const contrast="He promised lower taxes. He raised them.";
const pairs=extractReaderPairs(contrast);
assert.equal(pairs.length,1);
assert.equal(pairs[0].first.text,"He promised lower taxes.");
assert.equal(pairs[0].second.text,"He raised them.");
const abbr=extractReaderPairs("Mr. Smith arrived. He was late.");
assert.equal(abbr.length,1,"Honor titles before sentence boundaries");
assert.equal(abbr[0].first.text,"Mr. Smith arrived.");
const decimal=extractReaderPairs("The price was 9. 2 pounds. It rose again.");
assert.equal(decimal.length,1,"Do not split malformed decimal text");
assert.equal(decimal[0].first.text,"The price was 9. 2 pounds.");
const within=extractReaderPairs("The alarm failed, then the building was evacuated.");
assert.equal(within.length,1,"Comma between complete clauses is an optional boundary");
assert.equal(within[0].boundaryKind,"comma");
for(const sample of [contrast,
 "Mr. Smith arrived. He was late.",
 "The alarm failed, then the building was evacuated."]){
 for(const entry of extractReaderPairs(sample)){
  assert.equal(sample.slice(entry.first.start,entry.first.end),entry.first.text);
  assert.equal(sample.slice(entry.second.start,entry.second.end),entry.second.text);
 }
}
const template=READER_RELATIONS.find(x=>x.id==="contrast").hypothesis;
const none=READER_RELATIONS.find(x=>x.id==="none").hypothesis;
const mock=async (_prompt,hypothesis)=>{
 if(hypothesis===template)return scores(.96);
 if(hypothesis===none)return scores(.03);
 return scores(.04);
};
const before=contrast;
const result=await scoreReaderInterpretations(contrast,mock);
assert.equal(contrast,before,"Original source stays unchanged");
assert.equal(result.length,1);
assert.equal(result[0].interpretation,"contrast");
assert.equal(result[0].proposedConnector,"but");
assert.equal(result[0].humanAgreementMeasured,false);
assert.equal(result[0].scoreType,"uncalibrated_nli_entailment");
assert.equal(result[0].options.length,7);
assert.equal(result[0].first.text,"He promised lower taxes.");
assert.equal((await scoreReaderInterpretations(contrast,
 async (_prompt,h)=>scores(h===none?.98:.02)))[0].interpretation,"none",
 "No implied connection must be a genuine scored option");
assert.equal((await scoreReaderInterpretations(contrast,
 async ()=>scores(.32)))[0].interpretation,"uncertain",
 "Low scores must not be forced into a predicted relation");
assert.equal((await scoreReaderInterpretations(contrast,
 async (_prompt,h)=>scores(h===template?.94:.88)))[0].interpretation,"uncertain",
 "Small margin must not be forced into a predicted relation");
assert.equal((await scoreReaderInterpretations(contrast,
 async ()=>null))[0].interpretation,"uncertain",
 "Invalid local model responses abstain safely");
let calls=0;
const three="He promised lower taxes. He raised them. The committee disagreed.";
const many=await scoreReaderInterpretations(three,async ()=>{
 calls++;return scores(.02);
});
assert.equal(many.length,2);
assert.equal(calls,14,"Seven hypotheses per pair, at most two pairs");
assert.deepEqual(extractReaderPairs("The report was filed yesterday."),[],
 "Single assertions cannot generate a two-statement inference");
assert.equal(validateReaderCases([{id:"a",text:contrast,source_url:"local"}]).length,1);
assert.throws(()=>validateReaderCases([{id:"same",text:"x"},{id:"same",text:"y"}]),/duplicate/i);
console.log("Reader inference: 7 relation options, no-link and uncertain, bounded calls, exact offsets, title/decimal/comma cases passed.");
