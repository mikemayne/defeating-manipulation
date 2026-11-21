import assert from 'node:assert/strict';
import {leadingExplicitConnector,explicitBoundaryConnector,normaliseConnectorCandidate}
 from '../extension/src/reader-connector-normalisation.mjs';
import {extractBoundaryProbes,buildBoundaryChoices,rankBoundaryChoices}
 from '../extension/src/reader-boundary-scorer.mjs';
import {compareReaderStrategies} from '../extension/src/reader-strategy-comparison.mjs';

// The original boundary and its offsets must never be changed.
for(const [right,choice] of [
 ['But the permit was rejected.', 'but'],
 ['However, the train was cancelled.', 'but'],
 ['Nevertheless, the response was negative.', 'but'],
 ['Nonetheless, the delivery arrived late.', 'but'],
 ['Yet passengers continued waiting.', 'but'],
 ['Still, the situation was unresolved.', 'but'],
 ['On the other hand, costs were reduced.', 'but'],
 ['And yet the contract was signed.', 'but'],
 ['And the committee approved it.', 'and'],
 ['Furthermore, the repairs were completed.', 'and'],
 ['Moreover, customers were satisfied.', 'and'],
 ['Additionally, the team recruited staff.', 'and'],
 ['In addition, costs fell.', 'and'],
 ['Also, the manager agreed.', 'and']
]){
 assert.equal(leadingExplicitConnector(right)?.choice,choice,right);
 const joined=normaliseConnectorCandidate(choice,right);
 assert.equal(joined.text.split(/\s+/u)[0].toLowerCase(),
  (right.slice(leadingExplicitConnector(right).end).trim().split(/\s+/u)[0]).toLowerCase());
 assert.ok(!new RegExp('^'+choice+'\\s+'+leadingExplicitConnector(right).marker+'\\b','i')
  .test(choice+' '+joined.text),'Duplicate connector in normalisation');
}
for(const right of [
 'However many choices remain available.',
 'Still working on the draft.',
 'Yet another example appears.',
 'Yet more examples appear.',
 'Yet to arrive at the platform.',
 'And yet', // incomplete
 'The venue nevertheless lost power.',
 'The manager was also present.'
]) assert.equal(leadingExplicitConnector(right),null,right);

const source='The orchestra was ready. But the venue lost electrical power.';
const frozen=source,probes=extractBoundaryProbes(source);
assert.equal(probes.length,1);
const offset=probes[0].punctuationStart;
const choices=buildBoundaryChoices(source,probes[0]);
assert.equal(choices.find(x=>x.id==='but').analysisText,
 'The orchestra was ready but the venue lost electrical power.');
assert.equal(choices.find(x=>x.id==='and').analysisText,
 'The orchestra was ready and the venue lost electrical power.');
const mark=explicitBoundaryConnector(source,probes[0]);
assert.equal(mark.relation,'contrast');
assert.equal(source.slice(mark.start,mark.end),'But ');
let modelCalls=0;
const never=async()=>{modelCalls++;throw Error('Must not score an explicit connector');};
const result=await rankBoundaryChoices(source,never);
assert.equal(modelCalls,0);
assert.equal(result.length,1);
assert.equal(result[0].choice,'but');
assert.equal(result[0].relationship,'contrast');
assert.equal(result[0].punctuationAction,'keep');
assert.equal(result[0].decisionSource,'explicit_connector');
assert.equal(result[0].analysisText,source);
assert.equal(result[0].punctuationStart,offset);
assert.equal(source,frozen);
const progression=await compareReaderStrategies(source,never);
assert.equal(modelCalls,0);
assert.equal(progression.length,1);
assert.equal(progression[0].context.choice,'but');
assert.equal(progression[0].progressive.choice,'but');
assert.equal(progression[0].punctuationAction,'keep');
assert.equal(progression[0].progressiveReconstructionThroughSecond,source);
assert.equal(source,frozen);

const mixed='The council approved the budget. Workers started repairs. However, rain stopped work.';
let calls=0;
const mixedOut=await compareReaderStrategies(mixed,async(_prefix,completion)=>{
 calls++;
 return completion.startsWith(' and ')?-1:-3;
},{maxPairs:8});
assert.equal(mixedOut.length,2);
assert.equal(mixedOut[0].decisionSource,'language_model');
assert.equal(mixedOut[1].decisionSource,'explicit_connector');
assert.equal(mixedOut[1].context.choice,'but');
assert.equal(mixedOut[1].punctuationAction,'keep');
assert.ok(!mixedOut[1].progressiveReconstructionThroughSecond.includes('but However'));
assert.ok(mixedOut[1].progressiveReconstructionThroughSecond.includes('However, rain stopped work.'));
assert.ok(calls>0);
assert.equal(mixed,'The council approved the budget. Workers started repairs. However, rain stopped work.');

console.log('Explicit connector normalisation, model bypass, untouched offsets and progressive reconstruction passed.');
