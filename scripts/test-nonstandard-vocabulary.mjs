import assert from "node:assert/strict";
import {findVocabularyCandidates,validateVocabularyRegistry}
 from "../extension/src/nonstandard-vocabulary.mjs";
import {preprocessText,originalRangeForAnalysis}
 from "../extension/src/text-preprocessing.mjs";

const candidates=findVocabularyCandidates("Muslamic law, muslamic people, muslamic rhetoric.");
assert.deepEqual(candidates.map(x=>x.correction),["Islamic","Muslim",null],
 "Only disambiguated wording is rewritten");
const input="The muslamic law differs; a muzzlim spoke about edumacation.";
const result=preprocessText(input);
assert.equal(result.analysisText,
 "The Islamic law differs; a Muslim spoke about education.");
assert.equal(result.signals.nonstandardVocabularyCandidates,3);
assert.equal(result.signals.vocabularyNormalisations,3);
assert.equal(result.signals.possibleAttentionHooks,3);
for (const flag of result.flags.filter(x=>x.kind==="nonstandard_vocabulary")) {
 assert.equal(input.slice(flag.start,flag.end),flag.original);
 const analysisWord=result.analysisText.slice(flag.analysisStart,flag.analysisEnd);
 assert.equal(analysisWord,flag.correction);
 assert.deepEqual(originalRangeForAnalysis(result,flag.analysisStart,flag.analysisEnd),
  {start:flag.start,end:flag.end});
 assert.ok(flag.attentionSignal);
}
const equiv=preprocessText("ISLAMIK law and Muslamic people.");
assert.equal(equiv.analysisText,"ISLAMIC law and Muslim people.");
const ambiguous=preprocessText("Muslamic claims were repeated.");
assert.equal(ambiguous.analysisText,"Muslamic claims were repeated.");
assert.equal(ambiguous.signals.nonstandardVocabularyCandidates,1,
 "Ambiguous word remains flagged without inventing a replacement");
const withoutSpellchecker=preprocessText("A muzzlim person.",{spellchecker:null});
assert.equal(withoutSpellchecker.analysisText,"A Muslim person.",
 "Curated vocabulary does not depend on loading the spellchecker");
const spellchecker={correct:w=>w!=="muzzlim",suggest:()=>["Muslim"]};
const overlap=preprocessText("A muzzlim person.",{spellchecker});
assert.equal(overlap.signals.nonstandardVocabularyCandidates,1);
assert.equal(overlap.signals.spellingCandidates,0,
 "Dictionary and spelling must not double-flag the same token");
const backtick=String.fromCharCode(96);
const protectedInput="https://example.org/muslamic and #muslamic @muzzlim "+
 backtick+"islamik"+backtick+" and muslamic.net";
assert.equal(preprocessText(protectedInput).signals.nonstandardVocabularyCandidates,0);
const disabled=preprocessText("edumacation",{correctSpelling:false});
assert.equal(disabled.analysisText,"edumacation");
assert.equal(disabled.signals.nonstandardVocabularyCandidates,1);
assert.deepEqual(findVocabularyCandidates("edumacation",{maxFindings:0}),[]);
assert.throws(()=>validateVocabularyRegistry({version:1,entries:[
 {term:"same",suggestions:["one"],signals:[]},
 {term:"same",suggestions:["two"],signals:[]}
]}),/Invalid vocabulary/);
assert.throws(()=>validateVocabularyRegistry({version:1,entries:[
 {term:"test",suggestions:["known"],replacement:"unknown",signals:[]}
]}),/Invalid vocabulary/);
console.log("Curated nonstandard vocabulary, contextual normalisation, flags and source offsets passed.");
