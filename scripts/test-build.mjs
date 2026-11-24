import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';

execFileSync(process.execPath, ['scripts/build-site.mjs'], {stdio:'inherit'});
const read = name => fs.readFileSync('_site/'+name,'utf8');
const catalogue = JSON.parse(read('techniques.json'));
const positive = JSON.parse(read('positive-patterns.json'));
const inconsistency = JSON.parse(fs.readFileSync('inconsistency-patterns.json', 'utf8'));

const schema = JSON.parse(fs.readFileSync('analysis-schema.json','utf8'));
const homepage = read('index.html');
assert.ok(catalogue.techniques.length >= 10, 'Catalogue has an initial set of techniques');
assert.ok(homepage.includes('<title>Manipulation Techniques</title>'), 'Homepage identifies the techniques library');
assert.ok(homepage.includes('<h1>Manipulation techniques</h1>'), 'Homepage has the library heading');
assert.ok(homepage.includes('positive-section') && homepage.includes('background:#e4f6e7'), 'Homepage has a separate green positive-pattern section');
assert.ok(homepage.includes('id="positive-search"') && homepage.includes('id="positive-catalogue"'), 'Positive library is independently searchable');
assert.ok(positive.patterns.length >= 10, 'Positive pattern library has an initial set of patterns');
assert.ok(homepage.includes('id="search"') && homepage.includes('id="catalogue"'), 'Homepage provides searchable catalogue');
assert.ok(!homepage.includes('inconsistency-'),
 'The paused red category has no homepage section, search or data request');
assert.ok(!fs.existsSync('_site/inconsistency-patterns.json') &&
 !fs.existsSync('_site/inconsistency-patterns'),
 'The paused red catalogue and detail pages are not published');
assert.ok(!read('sitemap.xml').includes('inconsistency-patterns') &&
 !read('llms.txt').includes('inconsistency-patterns'),
 'Discovery files do not advertise the paused red category');
assert.ok(inconsistency.patterns.length >= 1,
 'The source inconsistency catalogue remains available for research');
assert.ok(inconsistency.patterns.some(item =>
 item.id === 'unsupported_conclusion' &&
 /insufficient to support (?:this|the) conclusion/i.test(
  [item.definition,...item.observable_features].join(' '))),
 'Unsupported-conclusion pattern explains the limits of the evidence supplied');
assert.ok(inconsistency.patterns.some(item => item.id === 'supported_conclusion'),
 'A supported conclusion is represented without being called a contradiction');

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

assert.ok(!fs.existsSync('extension'), 'Retired browser extension is absent');
assert.ok(!homepage.includes('Install the Firefox extension') && !homepage.includes('extension/manifest.json'), 'Homepage does not advertise the retired extension');
console.log('Catalogue and generated website checks passed.');
