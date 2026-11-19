import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';

execFileSync(process.execPath, ['scripts/build-site.mjs'], {stdio:'inherit'});
const read = name => fs.readFileSync('_site/'+name,'utf8');
const catalogue = JSON.parse(read('techniques.json'));
const positive = JSON.parse(read('positive-patterns.json'));
const schema = JSON.parse(fs.readFileSync('analysis-schema.json','utf8'));
const homepage = read('index.html');
assert.ok(catalogue.techniques.length >= 10, 'Catalogue has an initial set of techniques');
assert.ok(homepage.includes('<title>Manipulation Techniques</title>'), 'Homepage identifies the techniques library');
assert.ok(homepage.includes('<h1>Manipulation techniques</h1>'), 'Homepage has the library heading');
assert.ok(homepage.includes('positive-section') && homepage.includes('background:#e4f6e7'), 'Homepage has a separate green positive-pattern section');
assert.ok(homepage.includes('id="positive-search"') && homepage.includes('id="positive-catalogue"'), 'Positive library is independently searchable');
assert.ok(positive.patterns.length >= 10, 'Positive pattern library has an initial set of patterns');
assert.ok(homepage.includes('id="search"') && homepage.includes('id="catalogue"'), 'Homepage provides searchable catalogue');
assert.ok(!homepage.includes('Recognise. Report. Disengage.') && !homepage.includes('A shared knowledge base'), 'Homepage contains no former project pitch or principles');
assert.ok(read('questionnaire.html').includes('Report. Disengage.'), 'Questionnaire gives the agreed next steps');
assert.ok(schema.finding.reader_effect, 'Analysis schema describes reader-facing effects');
assert.ok(schema.workflow.join(' ').includes('Recognise') && schema.workflow.join(' ').includes('Disengage'), 'Analysis schema contains the project workflow');
for (const item of catalogue.techniques) {
  assert.ok(fs.existsSync('_site/techniques/'+item.id+'.html'), 'Generated page exists for '+item.id);
}
assert.ok(read('sitemap.xml').includes('techniques/loaded_language.html'));
assert.ok(read('sitemap.xml').includes('positive-patterns/restoring_agency.html'));
for (const item of positive.patterns) {
  assert.ok(fs.existsSync('_site/positive-patterns/'+item.id+'.html'), 'Generated positive page exists for '+item.id);
}
assert.ok(read('positive-patterns/restoring_agency.html').includes('constructive communication behaviour'), 'Positive pages explain the limits of phrase-only classification');
assert.ok(read('techniques/allegation_laundering.html').includes('<h2>Recognising the pattern</h2>'), 'Generated chapter includes observable features section');
assert.ok(read('techniques/allegation_laundering.html').includes('Repeating an allegation'), 'Generated chapter includes its definition');
assert.ok(read('techniques/allegation_laundering.html').includes('SemEval-2020'), 'Generated chapter includes linked research references');
assert.ok(read('robots.txt').includes('Sitemap:'));
console.log('Build smoke tests passed.');
