import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

// This is a metadata/integrity check. Do NOT run any model, argument parser,
// scorer or reasoning inference on the frozen holdout during CI.
const path = new URL('../evaluation/argument-paragraph-holdout-200-v1.json',import.meta.url);
const raw=readFileSync(path);
assert.equal(createHash('sha256').update(raw).digest('hex'),
 '886fc6e3b6201544c374caf091d1c3b50532e089c9aa355132ff2d1fdc29b8d8',
 'The frozen v1 corpus must not be silently modified after gold labels are assigned');
const data=JSON.parse(raw.toString('utf8'));
assert.equal(data.version,1);
assert.equal(data.benchmark_type,'argument_paragraph');
assert.equal(data.status,'frozen-pre-evaluation');
assert.equal(data.cases.length,200);
const expected={supported:50,unsupported:50,contradictory:50,abstain:25,nonargument:25};
const labels={supported:'supported_conclusion',unsupported:'unsupported_conclusion',contradictory:'contradictory_claims'};
const ids=new Set(),texts=new Set();
const counts={supported:0,unsupported:0,contradictory:0,abstain:0,nonargument:0};
for(const item of data.cases){
 assert.equal(typeof item.id,'string');
 assert.ok(item.id.startsWith('syn-v1-'+item.case_kind+'-'));
 assert.ok(!ids.has(item.id),'Duplicate ID: '+item.id);ids.add(item.id);
 assert.equal(typeof item.text,'string');
 assert.ok(item.text.length>60 && item.text.length<550);
 const normalized=item.text.trim().toLowerCase().replace(/\s+/g,' ');
 assert.ok(!texts.has(normalized),'Duplicate paragraph: '+item.id);texts.add(normalized);
 assert.equal(typeof item.label_rationale,'string');
 assert.ok(item.label_rationale.length>25);
 assert.ok(Object.hasOwn(counts,item.case_kind));counts[item.case_kind]++;
 assert.equal(item.expected_argument,item.case_kind!=='nonargument');
 assert.deepEqual(item.expected,
  Object.hasOwn(labels,item.case_kind)?[labels[item.case_kind]]:[]);
 assert.ok(!Object.hasOwn(item,'expected_model_conclusion'),
  'No model-generated conclusion can be embedded as a hidden gold signal');
}
assert.deepEqual(counts,expected);
console.log('Frozen synthetic argument holdout: 200 unique prelabelled examples and SHA-256 intact. No analyser invoked.');
