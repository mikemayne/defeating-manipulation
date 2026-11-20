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

// Web benchmark uses the same shared matching core as Firefox and generates
// large datasets without keeping all cases in memory.
const { generatedCase, validateSeeds } = await import('../evaluation/benchmark-generator.mjs');
const testSeeds = JSON.parse(fs.readFileSync('evaluation/matcher-examples.json', 'utf8')).cases;
validateSeeds(testSeeds, extensionCatalogue.techniques.map(item => item.id));
assert.equal(JSON.stringify(generatedCase(testSeeds, 250, 2026)),
 JSON.stringify(generatedCase(testSeeds, 250, 2026)), 'Generated tests are reproducible');
for (let i = 0; i < 800; i++) {
 const testCase = generatedCase(testSeeds, i, 2026);
 assert.ok(testCase.text.trim() && testCase.id, 'Generated cases include text and an ID');
 assert.ok(testCase.expected.every(id => extensionCatalogue.techniques.some(t => t.id === id)),
  'Generated cases keep valid expected technique labels');
}
// Reported first-run failures: all seven involved two techniques in one
// selected passage. Validate the same generated dataset and deterministic seed.
const overlapFailures = [];
for (let i = 0; i < 1000; i++) {
 const testCase = generatedCase(testSeeds, i, 2026);
 const matches = await matchingCore.matchText(testCase.text,
  { techniques: extensionCatalogue.techniques, rules: compiled });
 const predicted = [...new Set(matches.map(item => item.technique.id))].sort();
 const expected = [...new Set(testCase.expected)].sort();
 if (JSON.stringify(predicted) !== JSON.stringify(expected)) {
  overlapFailures.push({ index: i, expected, predicted });
 }
}
assert.deepEqual(overlapFailures, [],
 'The reproducible 1,000-case mixed-technique regression must pass');

for (const script of [
 'extension/src/benchmark-worker.js',
 'extension/src/benchmark-ui.mjs',
 'evaluation/benchmark-generator.mjs',
 'scripts/serve-benchmark.mjs'
]) {
 execFileSync(process.execPath, ['--check', script], { stdio: 'pipe' });
}
const lab = fs.readFileSync('extension/benchmark.html', 'utf8');
assert.ok(lab.includes('id="progress-count"'), 'Web lab has a progress counter');
assert.ok(lab.includes('id="copy"'), 'Web lab has a copy failure details button');
assert.ok(lab.includes('id="stats"'), 'Web lab shows aggregate statistics');

// Real-world matcher mistakes: the AI was treating neutral survey figures as
// a bandwagon appeal and ordinary article descriptions as narrative reframing.
const { hasSemanticEvidence } = await import('../extension/src/semantic-evidence.mjs');
const semanticContrasts = JSON.parse(fs.readFileSync('evaluation/semantic-hard-negatives.json', 'utf8')).cases;
const contrastsById = new Map(semanticContrasts.map(item => [item.id, item]));
for (const item of semanticContrasts.filter(item => item.expected.length === 0)) {
 assert.equal(hasSemanticEvidence('bandwagon', item.text), false,
  'Neutral statements do not establish bandwagon persuasion: ' + item.id);
 assert.equal(hasSemanticEvidence('narrative_reframing', item.text), false,
  'Neutral statements do not establish narrative reframing: ' + item.id);
}
for (const item of semanticContrasts.filter(item => item.expected.includes('bandwagon'))) {
 assert.equal(hasSemanticEvidence('bandwagon', item.text), true,
  'A popularity-based conclusion remains eligible: ' + item.id);
}
assert.equal(hasSemanticEvidence('narrative_reframing',
 contrastsById.get('positive-narrative-reframing').text), true,
 'Narrative reframing with an omitted earlier decision remains eligible');

// Force the semantic model to return a high-similarity category to exercise
// the actual shared match pipeline, including gating and overlap suppression.
const techniqueIndex = id => extensionCatalogue.techniques.findIndex(item => item.id === id);
async function forcedSemanticMatches(text, category) {
 const prototypes = [
  { techniqueIndex: techniqueIndex(category), vector: [1, 0] },
  { techniqueIndex: techniqueIndex('false_equivalence'), vector: [0, 1] }
 ];
 return matchingCore.matchText(text, {
  techniques: extensionCatalogue.techniques,
  rules: compiled, prototypes,
  embed: async texts => texts.map(() => [1, 0])
 });
}
for (const item of semanticContrasts) {
 for (const category of ['bandwagon', 'narrative_reframing']) {
  const found = await forcedSemanticMatches(item.text, category);
  const detected = new Set(found.map(match => match.technique.id));
  assert.equal(detected.has(category), item.expected.includes(category),
   'Semantic ' + category + ' evidence gate: ' + item.id);
 }
}

// Cover all published techniques with at least one instance to embed, rather
// than silently leaving categories impossible to identify with local AI.
// This tests the catalogue, not model generalisation.
for (const technique of extensionCatalogue.techniques) {
 const samples = [technique.example, ...(technique.examples || [])]
  .filter(value => typeof value === 'string' && value.trim());
 assert.ok(samples.length >= 1, 'Matcher has no semantic examples for: ' + technique.id);
}

// Independent wording and neutral near misses verify the new structural rules
// without importing the separate user-held news evaluation dataset.
const recognitionCases = JSON.parse(
 fs.readFileSync('evaluation/recognition-contrasts.json', 'utf8')).cases;
const recognitionErrors = [];
for (const item of recognitionCases) {
 const found = await matchingCore.matchText(item.text,
  { techniques: extensionCatalogue.techniques, rules: compiled });
 const predicted = [...new Set(found.map(match => match.technique.id))].sort();
 const expected = [...new Set(item.expected)].sort();
 if (JSON.stringify(predicted) !== JSON.stringify(expected))
  recognitionErrors.push({ id: item.id, expected, predicted });
}
assert.deepEqual(recognitionErrors, [],
 'Recognise fresh rhetorical structures without flagging neutral near misses');

// Independent fictional contrast cases for the four remaining recall gaps.
// The private news-based holdout set is deliberately never committed.
const gapCases = JSON.parse(fs.readFileSync('evaluation/four-gap-contrasts.json', 'utf8')).cases;
const gapErrors = [];
for (const item of gapCases) {
 const found = await matchingCore.matchText(item.text, {
  techniques: extensionCatalogue.techniques, rules: compiled
 });
 const predicted = [...new Set(found.map(x => x.technique.id))].sort();
 const expected = [...new Set(item.expected)].sort();
 if (JSON.stringify(predicted) !== JSON.stringify(expected))
  gapErrors.push({ id: item.id, expected, predicted });
}
assert.deepEqual(gapErrors, [], 'Four-gap cases avoid new false positives and missed labels');

console.log('Build, matching-core, benchmark, semantic precision and broad-coverage checks passed.');


// Two-pass selected-text analyser: contradiction pairs, offsets and abstention.
const consistency = await import('../extension/src/consistency.mjs');
const contradictory = 'The company never collects email addresses. The company collects email addresses from every customer.';
const claims = consistency.extractClaims(contradictory);
assert.equal(claims.length, 2, 'Both claims are extracted');
assert.ok(consistency.candidatePairs(claims).length, 'Related claims are paired');
const contradictionScore = async () => ({ contradiction: 0.96, neutral: 0.02, entailment: 0.02 });
const inconsistencies = await consistency.findInconsistencies(contradictory, contradictionScore);
assert.equal(inconsistencies.length, 2, 'Both conflicting claims are marked');
assert.ok(inconsistencies.every(m => contradictory.slice(m.start, m.end) ===
 claims.find(c => c.start === m.start).text), 'Red highlights retain source offsets');
assert.deepEqual(await consistency.findInconsistencies(contradictory,
 async () => ({ contradiction: 0.1, neutral: 0.8, entailment: 0.1 })), [],
 'Neutral claims do not receive red underlines');
assert.deepEqual(await consistency.findInconsistencies('The service is available on Monday.', contradictionScore), [],
 'A single claim cannot contradict another claim');
const blue = { start: 0, end: 30, technique: { category: 'Negative' }, score: 1 };
const combined = consistency.visibleHighlights([blue, ...inconsistencies], contradictory.length);
assert.ok(combined.some(m => m.kind === 'inconsistency'), 'Red contradiction survives overlapping blue matches');
assert.ok(combined.every(m => m.start >= 0 && m.end <= contradictory.length),
 'Merged two-pass highlights remain in bounds');
const extensionWorker = fs.readFileSync('extension/src/matcher-worker.js', 'utf8');
assert.ok(extensionWorker.includes('findInconsistencies(data.text, scorePair)'),
 'Firefox worker runs the second local pass');
assert.ok(selectionScript.includes('const BLUE =') && selectionScript.includes('RED = "#dc2626"'),
 'Firefox highlighter retains the existing colours and adds red');
