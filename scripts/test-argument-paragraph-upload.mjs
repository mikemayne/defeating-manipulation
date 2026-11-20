import assert from 'node:assert/strict';
import {
 validateArgumentParagraphCases, inspectArgumentStructure
} from '../evaluation/argument-structure-evaluator.mjs';

// Fictional fixtures only; downloaded media/social text never enters Git.
const cases=[
 {id:'shared-subject', text:'The council raised rents and therefore expects higher revenue.',
  expected_argument:true, expected_model_conclusion:'The council expects higher revenue.'},
 {id:'no-argument',text:'The transport office published its opening hours.',
  expected_argument:false},
 {id:'labelled-support', text:'The council raised rents and therefore expects higher revenue.',
  expected_argument:true, expected:['supported_conclusion']},
 {id:'labelled-abstention', text:'The council raised rents and therefore expects higher revenue.',
  expected_argument:true, expected:[]}
];
assert.equal(validateArgumentParagraphCases(cases),cases);
const a=inspectArgumentStructure(cases[0]);
assert.deepEqual(a.expected,['argument_present','model_conclusion_match']);
assert.deepEqual(a.predicted,['argument_present','model_conclusion_match']);
assert.equal(a.hypotheses.length,1);
assert.equal(a.hypotheses[0].modelConclusion,'The council expects higher revenue.');
const b=inspectArgumentStructure(cases[1]);
assert.deepEqual(b.expected,[]);
assert.deepEqual(b.predicted,[]);
assert.ok(b.hypotheses.length===0);
assert.ok(!Object.hasOwn(cases[0],'expected'),'Structure-only rows do not request NLI');
assert.ok(Object.hasOwn(cases[2],'expected') && Object.hasOwn(cases[3],'expected'),
 'An empty expected array is an explicitly annotated reasoning abstention row');
assert.throws(()=>validateArgumentParagraphCases([{
 id:'legacy',text:'The team arrived. Therefore, the event began.',expected:['supported_conclusion']
}]),/Invalid single-paragraph row/,'Retired label-only format is not silently accepted');
assert.throws(()=>validateArgumentParagraphCases([{
 id:'invalid',text:'The office is open.',expected_argument:false,
 expected:['supported_conclusion']
}]),/Invalid single-paragraph row/,'Cannot label supported inference without extracted-argument expectation');
assert.throws(()=>validateArgumentParagraphCases([cases[0],cases[0]]),/Duplicate/);
assert.throws(()=>validateArgumentParagraphCases([{
 id:'bad-metadata',text:'The hall is open.',expected_argument:true,
 expected_model_conclusion:''
}]),/Invalid single-paragraph row/);
assert.throws(()=>validateArgumentParagraphCases([{...cases[0],expected:['made_up_label']}]),/Invalid single-paragraph row/);
console.log('One uploaded paragraph test mode: structure labels, optional NLI labels, strict metadata and offsets passed.');
