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

const extensionCatalogue = JSON.parse(fs.readFileSync('extension/techniques.json','utf8'));
const extensionPatterns = JSON.parse(fs.readFileSync('extension/patterns.json','utf8'));
const ruleMap = new Map(extensionPatterns.patterns.map(rule => [rule.id, rule.expressions.map(source => new RegExp(source, 'i'))]));
const fallacyCases = [
  // Original five examples: keep these exact sentences covered by regression tests.
  ['ad_hominem', "Your argument is wrong because you're stupid."],
  ['straw_man', "You want less homework, so you clearly don't care about education."],
  ['bandwagon', 'Everyone believes it, so it must be true.'],
  ['slippery_slope', 'If we allow one late submission, soon nobody will meet deadlines.'],
  ['false_dilemma', "You're either with us or against us."],
  ['ad_hominem', "Your argument is wrong because you're an idiot."],
  ['straw_man', 'You want stricter school rules, so you obviously want students to have no freedom.'],
  ['bandwagon', 'Everyone believes this, so it must be true.'],
  ['slippery_slope', 'If we allow phones in class, soon nobody will pay attention, and schools will completely fail.'],
  ['false_dilemma', "You're either with us or against us."],
  ['hasty_generalisation', 'I met two rude tourists from France, so all French tourists must be rude.'],
  ['circular_reasoning', "I'm trustworthy because I always tell the truth."],
  ['appeal_to_authority', 'This product must work because a famous actor recommends it.'],
  ['post_hoc', 'I wore my lucky socks and we won, so my socks caused the victory.'],
  ['red_herring', "Why worry about pollution when there are people who don't have jobs?"],
  ['appeal_to_emotion', "You should give me a good grade because I've had a really difficult week."],
  ['tu_quoque', 'You cannot tell me to stop smoking when you smoke yourself.'],
  ['appeal_to_ignorance', "Nobody has proved that ghosts don't exist, so they must be real."],
  ['false_equivalence', 'Being late for school is just as bad as committing a crime.'],
  ['cherry_picking', 'This diet works because I found three people online who lost weight using it.']
];
for (const [id, example] of fallacyCases) {
  assert.ok(extensionCatalogue.techniques.some(item => item.id === id), 'Extension catalogue contains ' + id);
  assert.ok(ruleMap.has(id), 'Pattern rules exist for ' + id);
  assert.ok(ruleMap.get(id).some(regex => regex.test(example)), 'Pattern detects supplied example for ' + id);
  assert.ok(fs.existsSync('_site/techniques/' + id + '.html'), 'Generated site page exists for ' + id);
}
for (const rule of extensionPatterns.patterns) {
  assert.ok(extensionCatalogue.techniques.some(item => item.id === rule.id), 'Pattern rule has a catalogue entry: ' + rule.id);
  for (const expression of rule.expressions) assert.doesNotThrow(() => new RegExp(expression, 'i'), 'Pattern compiles for ' + rule.id);
}

// The extension sees selected DOM text with line and paragraph separators.
// A complete argument must still be considered one candidate for matching.
const { windows } = await import('../extension/src/text-windows.mjs');
const multilineCases = [
 ['bandwagon', 'Everyone believes this,\nso it must be true.'],
 ['bandwagon', 'Everyone believes this.\nSo it must be true.'],
 ['ad_hominem', "Your argument is wrong because\nyou're an idiot."],
 ['false_dilemma', "You're either with us\nor against us."],
 ['straw_man', "You want less homework,\nso you clearly don't care about education."],
 ['slippery_slope', 'If we allow phones in class,\nsoon nobody will pay attention,\nand schools will completely fail.']
];
for (const [id, example] of multilineCases) {
 const candidates = windows(example);
 assert.ok(candidates.some(part => ruleMap.get(id).some(regex => regex.test(part.text))),
  'Multiline selection preserves ' + id + ' match: ' + JSON.stringify(example));
 for (const part of candidates) {
  assert.ok(part.start >= 0 && part.end <= example.length && part.end > part.start,
   'Highlight coordinates remain within the original selected text');
  assert.equal(example.slice(part.start, part.end).replace(/\s+/g, ' '), part.contextual
   ? example.slice(part.start, part.end).replace(/\s+/g, ' ')
   : part.text, 'Source offsets must survive normalisation');
 }
}
assert.ok(windows('Heading\nA short note\nThis is another line.').some(part =>
 part.text === 'Heading A short note This is another line.'),
 'Multi-line context is available in addition to individual lines');

// Verify the async selection workflow exposes the busy cursor and always restores it.
const selectionScript = fs.readFileSync('extension/content.js', 'utf8');
assert.ok(selectionScript.includes('cursor: wait !important;'),
 'Selected-text analysis displays Firefox\'s busy cursor');
assert.match(selectionScript, /setBusy\(true\);\s*try\s*\{/,
 'Busy cursor is enabled before matching begins');
assert.match(selectionScript, /finally\s*\{\s*setBusy\(false\);\s*\}/,
 'Busy cursor is always restored on success or failure');
assert.ok(selectionScript.includes('activeAnalyses'),
 'Concurrent matching requests retain the busy cursor until finished');

// Regression cases for semantic false positives and missing prototypes.
const policy = await import('../extension/src/semantic-policy.mjs');
const named = id => extensionCatalogue.techniques.find(item => item.id === id);
for (const id of ['ad_hominem', 'bandwagon']) {
 assert.ok(named(id).examples?.length >= 2,
  'Semantic matching has actual examples for ' + id);
}
const classificationCases = [
 ['ad_hominem', "Your opinion about climate change doesn't matter because you didn't finish school."],
 ['ad_hominem', "Don't listen to her argument: she is too uneducated to understand this."],
 ['bandwagon', 'Everyone believes this, so it must be true.'],
 ['bandwagon', 'Most people agree with the proposal, therefore it must be the right choice.'],
 ['bandwagon', 'Everyone else supports it, so you should too.'],
 ['straw_man', "You want less homework, so you clearly don't care about education."]
];
for (const [expected, statement] of classificationCases) {
 const found = [...ruleMap.entries()].filter(([, rules]) => rules.some(regex => regex.test(statement)))
  .map(([id]) => id);
 assert.ok(found.includes(expected), 'Expected structural match for ' + statement);
 assert.deepEqual(found, [expected], 'No competing deterministic classification for ' + statement);
}
const descriptiveNonExamples = [
 'Appeal to authority',
 'Drawing a broad conclusion from too little evidence',
 'Attacking someone personally rather than their argument',
 'Hasty generalisation'
];
for (const fragment of descriptiveNonExamples) {
 assert.equal(policy.isSemanticCandidate(fragment, extensionCatalogue.techniques), false,
  'A technique name or neutral definition must not become a semantic match: ' + fragment);
}
const fauxPrototypes = [
 { techniqueIndex: 0, vector: [0.80] },
 { techniqueIndex: 1, vector: [0.78] }
];
const fauxDot = (_query, vector) => vector[0];
assert.equal(policy.selectSemanticTechnique([1], fauxPrototypes, fauxDot), null,
 'Close competing semantic categories must not be guessed');
assert.equal(policy.selectSemanticTechnique([1],
 [{ techniqueIndex: 0, vector: [0.51] }], fauxDot), null,
 'Weak semantic similarity must not be assigned a technique');
assert.equal(policy.selectSemanticTechnique([1],
 [{ techniqueIndex: 0, vector: [0.82] }, { techniqueIndex: 1, vector: [0.62] }], fauxDot).techniqueIndex, 0,
 'Strong and distinctive semantic similarity may still classify');

// Match-strength labels are qualitative and never convert similarity to a percentage.
assert.equal(policy.semanticMatchStrength(0.82, 0.20), 'High');
assert.equal(policy.semanticMatchStrength(0.70, 0.10), 'Mid');
assert.equal(policy.semanticMatchStrength(0.60, 0.07), 'Low');
assert.equal(policy.semanticMatchStrength(0.80, 0.07), 'Low',
 'A strong top score with close competitors is still ambiguous');
assert.ok(selectionScript.includes('Match strength: '),
 'Semantic classifications display a qualitative label in the popup');
assert.ok(selectionScript.includes('"Match: Rule"'),
 'Deterministic rule matches are labelled without treating them as 100% confidence');
assert.ok(!selectionScript.includes('Match confidence: 100%'),
 'Do not present rule matches as calibrated confidence');

// Both the browser worker and evaluator use exactly this matching core.
const matchingCore = await import('../extension/src/matching-core.mjs');
const compiled = matchingCore.compilePatternRules(extensionCatalogue, extensionPatterns);
const multiExample = "You're either with us or against us.\nEveryone believes this, so it must be true.";
const multiMatches = await matchingCore.matchText(multiExample,
 { techniques: extensionCatalogue.techniques, rules: compiled });
assert.deepEqual([...new Set(multiMatches.map(item => item.technique.id))].sort(),
 ['bandwagon', 'false_dilemma'], 'Combined selection finds both distinct techniques');
for (const item of multiMatches) {
 assert.ok(item.start >= 0 && item.end <= multiExample.length,
  'Match offsets refer to the selected source text');
}
const embedding = await import('../extension/src/embedding-rows.mjs');
assert.deepEqual(embedding.embeddingRows(
 { dims: [2, 3], data: new Float32Array([1,2,3,4,5,6]) }, 2),
 [[1,2,3],[4,5,6]], 'Multi-input model tensors are separated into rows');
assert.deepEqual(embedding.embeddingRows(
 { dims: [1, 3], data: new Float32Array([1,2,3]) }, 1),
 [[1,2,3]], 'Single-input model tensors are supported');

// A model failure must not cause already recognised rule matches to disappear.
const rulesBeforeFailure = await matchingCore.matchText(
 multiExample + "\nThe minutes describe a completely ordinary discussion of administrative arrangements.",
 { techniques: extensionCatalogue.techniques, rules: compiled,
  prototypes: [{ techniqueIndex: 0, vector: [1] }],
  embed: async () => { throw Error('Simulated model failure'); } });
assert.deepEqual([...new Set(rulesBeforeFailure.map(item => item.technique.id))].sort(),
 ['bandwagon', 'false_dilemma'], 'A failed semantic model preserves deterministic matches');

console.log('Build and matching-core regression checks passed.');
