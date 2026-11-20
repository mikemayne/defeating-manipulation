import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

// Integrity and annotation FORMAT only: no parser, model, proof or scorer.
const path=new URL('../evaluation/argument-paragraph-challenge-1000-v2.json',import.meta.url);
const raw=readFileSync(path);
const gitBlob=createHash('sha1')
 .update(Buffer.from('blob '+raw.length+'\0')).update(raw).digest('hex');
assert.equal(gitBlob,'d76b2f1438e5122bc9d0bebb0e7d3c34856d0deb',
 'Frozen v2 contents changed. Create a new version; do not rewrite evaluated gold labels.');
const corpus=JSON.parse(raw.toString('utf8'));
assert.equal(corpus.version,2);
assert.equal(corpus.benchmark_type,'argument_paragraph');
assert.equal(corpus.status,'frozen-pre-evaluation');
assert.equal(corpus.cases.length,1000);
assert.equal(corpus.scenario_family_count,40);
const expected={supported:250,unsupported:250,contradictory:250,abstain:125,nonargument:125};
assert.deepEqual(corpus.category_counts,expected);
const mapping={supported:'supported_conclusion',unsupported:'unsupported_conclusion',contradictory:'contradictory_claims'};
const ids=new Set(),texts=new Set(),families=new Map();
const counts=Object.fromEntries(Object.keys(expected).map(k=>[k,0]));
for(const row of corpus.cases){
 assert.ok(Object.hasOwn(counts,row.case_kind),'Invalid kind: '+row.id);
 assert.equal(row.id,'syn-v2-'+row.case_kind+'-'+String(counts[row.case_kind]+1).padStart(3,'0'),
  'Unexpected case ID or order');
 assert.ok(!ids.has(row.id),'Duplicate ID '+row.id);ids.add(row.id);
 assert.ok(typeof row.text==='string'&&row.text.length>60&&row.text.length<550,'Invalid paragraph '+row.id);
 const normalized=row.text.toLowerCase().replace(/\s+/g,' ').trim();
 assert.ok(!texts.has(normalized),'Duplicate paragraph '+row.id);texts.add(normalized);
 assert.equal(row.expected_argument,row.case_kind!=='nonargument',row.id);
 assert.deepEqual(row.expected,Object.hasOwn(mapping,row.case_kind)?[mapping[row.case_kind]]:[],row.id);
 assert.ok(typeof row.label_rationale==='string'&&row.label_rationale.length>=25,row.id);
 assert.ok(typeof row.scenario_family==='string'&&/^[a-z_]+$/.test(row.scenario_family),row.id);
 assert.ok(!Object.hasOwn(row,'expected_model_conclusion'),'No model-specific gold hypothesis: '+row.id);
 counts[row.case_kind]++;
 const family=families.get(row.scenario_family)||{kind:row.case_kind,count:0};
 assert.equal(family.kind,row.case_kind,'A family may not mix gold labels');
 family.count++;families.set(row.scenario_family,family);
}
assert.deepEqual(counts,expected);
assert.equal(families.size,40);
for(const [name,stats] of families)
 assert.equal(stats.count,25,'Each family must have 25 variants: '+name);
const old=JSON.parse(readFileSync(new URL('../evaluation/argument-paragraph-holdout-200-v1.json',import.meta.url),'utf8'));
for(const row of old.cases)
 assert.ok(!texts.has(row.text.toLowerCase().replace(/\s+/g,' ').trim()),
  'v2 must not copy a v1 paragraph: '+row.id);
console.log('Frozen 1000-case v2 corpus: integrity, balanced labels, 40 families and zero exact v1 duplicates verified. No analyser invoked.');
