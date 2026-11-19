import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';

execFileSync(process.execPath, ['scripts/build-site.mjs'], {stdio:'inherit'});
const read = name => fs.readFileSync('_site/'+name,'utf8');
const catalogue = JSON.parse(read('techniques.json'));
const schema = JSON.parse(fs.readFileSync('analysis-schema.json','utf8'));
assert.ok(catalogue.techniques.length >= 10, 'Catalogue has an initial set of techniques');
assert.ok(read('index.html').includes('A shared knowledge base') || read('index.html').includes('Recognise. Report. Disengage.'), 'Homepage project identity is present');
assert.ok(read('questionnaire.html').includes('Report. Disengage.'), 'Questionnaire gives the agreed next steps');
assert.ok(schema.finding.reader_effect, 'Analysis schema describes reader-facing effects');
assert.ok(schema.workflow.join(' ').includes('Recognise') && schema.workflow.join(' ').includes('Disengage'), 'Analysis schema contains the project workflow');
for (const item of catalogue.techniques) {
  assert.ok(fs.existsSync('_site/techniques/'+item.id+'.html'), 'Generated page exists for '+item.id);
}
assert.ok(read('sitemap.xml').includes('techniques/loaded_language.html'));
assert.ok(read('techniques/allegation_laundering.html').includes('<h2>Recognising the pattern</h2>'), 'Generated chapter includes observable features section');
assert.ok(read('techniques/allegation_laundering.html').includes('Repeating an allegation'), 'Generated chapter includes its definition');
assert.ok(read('techniques/allegation_laundering.html').includes('SemEval-2020'), 'Generated chapter includes linked research references');
assert.ok(read('robots.txt').includes('Sitemap:'));
console.log('Build smoke tests passed.');
