import assert from "node:assert/strict";
import {preprocessText,originalRangeForAnalysis,analysisRangeForOriginal,
 remapFindings,punctuationHookFindings,PREPROCESS_VERSION}
 from "../extension/src/text-preprocessing.mjs";
import {findSpellingBait,findSpellingCandidates}
 from "../extension/src/spelling-bait.mjs";
import {findScrutinyWarnings} from "../extension/src/scrutiny-signals.mjs";
const dictionary={
 correct:w=>!["idoit","absoloute","terrrible","formm"].includes(w),
 suggest:w=>({
  idoit:["idiot"],absoloute:["absolute"],
  terrrible:["terrible"],formm:["form","forms"]
 }[w]||[])
};
const first="There 's something. People do n't agree. The pan - democracy movement was mentioned.";
const a=preprocessText(first);
assert.equal(a.version,PREPROCESS_VERSION);
assert.equal(a.original,first);
assert.equal(a.analysisText,"There's something. People don't agree. The pan-democracy movement was mentioned.");
assert.ok(a.signals.formattingArtifacts>=3);
assert.equal(a.signals.spellingCandidates,0);
for(const flag of a.flags){
 if(flag.kind!=="formatting_artifact")continue;
 const range=originalRangeForAnalysis(a,flag.analysisStart,flag.analysisEnd);
 assert.equal(first.slice(range.start,range.end),flag.original);
}
const altered="Only an idoit would say that!!!";
const b=preprocessText(altered,{spellchecker:dictionary});
assert.equal(b.analysisText,"Only an idiot would say that!!!");
assert.equal(b.signals.spellingCandidates,1);
assert.equal(b.signals.punctuationAnomalies,1);
assert.equal(b.signals.possibleAttentionHooks,2);
const typo=b.flags.find(x=>x.kind==="spelling_candidate");
assert.equal(typo.original,"idoit");
assert.equal(typo.correction,"idiot");
const idx=b.analysisText.indexOf("idiot");
assert.deepEqual(originalRangeForAnalysis(b,idx,idx+5),
 {start:altered.indexOf("idoit"),end:altered.indexOf("idoit")+5});
assert.deepEqual(analysisRangeForOriginal(b,typo.start,typo.end),
 {start:idx,end:idx+5});
const hooks=punctuationHookFindings(b);
assert.equal(hooks.length,1);
const mapped=remapFindings(b,[{...hooks[0],otherText:"untouched"}]);
assert.equal(altered.slice(mapped[0].start,mapped[0].end),"!!!");
assert.equal(mapped[0].otherText,"untouched");
assert.deepEqual(remapFindings(b,[{kind:"without-offset"}]),[{kind:"without-offset"}]);
const noDictionary=preprocessText(altered);
assert.equal(noDictionary.analysisText,altered);
assert.equal(noDictionary.signals.spellingCandidates,0);
assert.equal(noDictionary.signals.punctuationAnomalies,1);
const ambiguous=preprocessText("This formm was filled in.",{spellchecker:dictionary});
assert.equal(ambiguous.analysisText,"This formm was filled in.");
assert.equal(ambiguous.flags.find(x=>x.kind==="spelling_candidate").correction,null);
const repeated=preprocessText("The terrrible terrrible result.",{spellchecker:dictionary});
assert.equal(repeated.signals.repeatedMisspellings,2);
assert.equal(repeated.signals.repeatedWords,1);
assert.equal(repeated.analysisText,"The terrible terrible result.");
const backtick=String.fromCharCode(96);
const protectedText="https://example.org/idoit and "+backtick+"the  idoit"+backtick+" and #idoit";
const p=preprocessText(protectedText,{spellchecker:dictionary});
assert.equal(p.analysisText,protectedText);
assert.equal(p.signals.spellingCandidates,0);
assert.equal(p.signals.correctionsApplied,0);
const orthographic=preprocessText("An  over  spaced  sentence .");
assert.equal(orthographic.analysisText,"An over spaced sentence.");
assert.ok(orthographic.signals.formattingArtifacts>0);
assert.equal(orthographic.signals.possibleAttentionHooks,0);
const context="Obviously, you must support this decision immediately for the benefit of the whole organisation.";
const c=preprocessText(context.slice(0,-1)+"??");
assert.equal(findScrutinyWarnings(c.analysisText).length,0);
assert.equal(findScrutinyWarnings(c.analysisText,{preprocessingFlags:c.flags}).length,1,
 "Three independent lexical signals plus attention cue allow orange review");
assert.deepEqual(findScrutinyWarnings("Someone typed a typo!!",{
 preprocessingFlags:preprocessText("Someone typed a typo!!").flags
}),[],"Attention cue alone never alleges a manipulation pattern");
const bait={id:"deliberate_errors",category:"Attention and memory",title:"Deliberate errors"};
assert.deepEqual(findSpellingBait("Only an idoit.",dictionary,bait).map(x=>x.kind),
 ["spelling"]);
assert.equal(findSpellingCandidates("Only an idoit.",dictionary)[0].correction,"idiot");
assert.throws(()=>preprocessText(null),/Invalid preprocessing/);
assert.throws(()=>originalRangeForAnalysis(b,-1,2),/Invalid analysis/);
assert.throws(()=>analysisRangeForOriginal(b,0,10000),/Invalid original/);
console.log("Text preprocessing: conservative corrections, offset round trips, "+
 "protected text, attention flags, scrutiny gating, and spelling compatibility passed.");
