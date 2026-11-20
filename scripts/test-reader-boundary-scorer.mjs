import assert from "node:assert/strict";
import {
 BOUNDARY_CHOICES, extractBoundaryProbes, buildBoundaryChoices, rankBoundaryChoices
} from "../extension/src/reader-boundary-scorer.mjs";
import { continuationLogScore } from "../extension/src/reader-language-model.mjs";

// All examples are synthetic; no private benchmark data is committed.
assert.deepEqual(BOUNDARY_CHOICES.map(x=>x.id),["keep","nothing","and","but"]);
const sample="He promised lower taxes. He raised them.";
const probes=extractBoundaryProbes(sample);
assert.equal(probes.length,1);
assert.equal(sample.slice(probes[0].punctuationStart,probes[0].punctuationEnd),".");
const variants=buildBoundaryChoices(sample,probes[0]);
assert.deepEqual(variants.map(x=>x.id),["keep","nothing","and","but"]);
assert.equal(variants[0].analysisText,sample);
assert.equal(variants[1].analysisText,"He promised lower taxes He raised them.");
assert.equal(variants[2].analysisText,"He promised lower taxes and he raised them.");
assert.equal(variants[3].analysisText,"He promised lower taxes but he raised them.");
const before=sample;
let calls=0;
const scored=await rankBoundaryChoices(sample,async (_prefix,completion)=>{
 calls++;
 return completion.includes("but")?-1:completion.includes("and")?-2:
  completion.startsWith(".")?-3:-4;
});
assert.equal(sample,before,"Source text must not be rewritten");
assert.equal(calls,4,"Four candidate continuations for one punctuation boundary");
assert.equal(scored[0].choice,"but");
assert.equal(scored[0].uncertain,false);
assert.equal(scored[0].humanAgreementMeasured,false);
assert.equal(scored[0].candidates.length,4);
assert.equal(scored[0].scoreType,"mean_conditional_token_log_probability");
assert.equal((await rankBoundaryChoices(sample,async()=>-2))[0].choice,"keep");
assert.equal((await rankBoundaryChoices(sample,async()=>-2))[0].uncertain,true,
 "Near-ties must retain original punctuation");
const title="Mr. Smith arrived. He was late.";
const titlePairs=extractBoundaryProbes(title);
assert.equal(titlePairs.length,2,"Include title dot and actual sentence boundary");
assert.equal(titlePairs[0].boundaryKind,"title");
assert.equal(title.slice(titlePairs[0].punctuationStart,titlePairs[0].punctuationEnd),".");
const titleScored=await rankBoundaryChoices(title,async (_prefix,completion)=>{
 return completion.startsWith(" Smith") ? -0.7 :
  completion.startsWith(". ") ? -1.2 : -4;
});
assert.equal(titleScored[0].choice,"nothing","No inserted word must be a real option for Mr.");
assert.equal(titleScored[0].boundaryKind,"title");
for(const input of [
 title,sample,"He paid 12.8 percent. The bill rose.",
 "The alarm failed, then the building was evacuated.",
 "The claim is true. The numbers demonstrate it."
]){
 for(const p of extractBoundaryProbes(input)){
  assert.equal(input.slice(p.first.start,p.first.end),p.first.text);
  assert.equal(input.slice(p.second.start,p.second.end),p.second.text);
  assert.match(input.slice(p.punctuationStart,p.punctuationEnd),/[,.!?;]/);
 }
}
const comma="The alarm failed, then the building was evacuated.";
assert.equal(extractBoundaryProbes(comma)[0].boundaryKind,"comma");
assert.equal(extractBoundaryProbes("A single isolated statement.").length,0);
assert.equal(extractBoundaryProbes("She paid 12.8 percent.").length,0,
 "Decimal points do not create a substitute insertion site");
// Tiny logits example. With token ids [0,1,2], the continuation
// begins at index 1 and is predicted by previous-token logits.
const fake={
 dims:[1,3,3],
 data:Float32Array.from([0,5,0,0,0,5,0,0,0])
};
const good=continuationLogScore([0,1,2],[0],fake);
assert.ok(good>-0.1);
const bad=continuationLogScore([0,2,1],[0],fake);
assert.ok(bad<good);
assert.equal(continuationLogScore([0,1],[0],{dims:[2,2,3],data:[]}),null);
console.log("Reader boundary reconstruction: four alternatives, title/comma/decimal cases, exact offsets, conservative ties and logits passed.");

