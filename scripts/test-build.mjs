import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';

execFileSync(process.execPath, ['scripts/build-site.mjs'], {stdio:'inherit'});
const read = name => fs.readFileSync('_site/'+name,'utf8');
const catalogue = JSON.parse(read('techniques.json'));
const positive = JSON.parse(read('positive-patterns.json'));
const inconsistency = JSON.parse(read('inconsistency-patterns.json'));

const schema = JSON.parse(fs.readFileSync('analysis-schema.json','utf8'));
const homepage = read('index.html');
assert.ok(catalogue.techniques.length >= 10, 'Catalogue has an initial set of techniques');
assert.ok(homepage.includes('<title>Manipulation Techniques</title>'), 'Homepage identifies the techniques library');
assert.ok(homepage.includes('<h1>Manipulation techniques</h1>'), 'Homepage has the library heading');
assert.ok(homepage.includes('positive-section') && homepage.includes('background:#e4f6e7'), 'Homepage has a separate green positive-pattern section');
assert.ok(homepage.includes('id="positive-search"') && homepage.includes('id="positive-catalogue"'), 'Positive library is independently searchable');
assert.ok(positive.patterns.length >= 10, 'Positive pattern library has an initial set of patterns');
assert.ok(homepage.includes('id="search"') && homepage.includes('id="catalogue"'), 'Homepage provides searchable catalogue');
assert.ok(homepage.includes('class="inconsistency-section"') &&
 homepage.includes('background:#991b1b'), 'Inconsistency section has a red background');
assert.ok(homepage.includes('id="inconsistency-search"') &&
 homepage.includes('id="inconsistency-catalogue"'), 'Inconsistency library is independently searchable');
assert.ok(homepage.includes("mountLibrary({url:'inconsistency-patterns.json'"),
 'The red library uses the shared data-driven catalogue renderer');
assert.ok(inconsistency.patterns.length >= 1, 'Inconsistency library has patterns');
for (const item of inconsistency.patterns) {
 const page = 'inconsistency-patterns/'+item.id+'.html';
 assert.ok(fs.existsSync('_site/'+page), 'Generated red page exists for '+item.id);
 assert.ok(read(page).includes('background:#991b1b'), 'Individual red pattern page uses a red background: '+item.id);
 assert.ok(read(page).includes('<h2>Recognising the pattern</h2>'), 'Red pattern has observable features: '+item.id);
 assert.ok(read('sitemap.xml').includes(page), 'Sitemap includes red pattern: '+item.id);
}
assert.ok(read('sitemap.xml').includes('inconsistency-patterns.json'),
 'Sitemap includes the red catalogue JSON');
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

// The slower whole-argument pass must not seize the mouse pointer.
const selectionScript = fs.readFileSync('extension/content.js', 'utf8');
assert.ok(selectionScript.includes('dm-pattern-status') &&
 !selectionScript.includes('cursor: wait !important;'),
 'Selected-text analysis uses a nonblocking status badge rather than a busy cursor');
assert.match(selectionScript, /setBusy\(true\);\s*try\s*\{/,
 'Progress indicator is enabled before matching begins');
assert.match(selectionScript, /finally\s*\{\s*setBusy\(false\);\s*\}/,
 'Progress indicator is always removed on success or failure');
assert.ok(selectionScript.includes('activeAnalyses'),
 'Concurrent matching requests retain the status badge until finished');

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
assert.ok(extensionWorker.includes('findInconsistencies(data.text, memoScore)'),
 'Firefox worker runs the second local pass');
assert.ok(selectionScript.includes('const BLUE =') && selectionScript.includes('RED = "#dc2626"'),
 'Firefox highlighter retains the existing colours and adds red');

 
// The local inconsistency classifier has its own labelled fixture set.
// Test validation, deterministic expansion and candidate-pair extraction without
// downloading the real NLI weights inside CI.
const { validateConsistencyCases, generatedConsistencyCase } =
 await import('../evaluation/inconsistency-generator.mjs');
const inconsistencySeeds = JSON.parse(
 fs.readFileSync('evaluation/inconsistency-examples.json', 'utf8')).cases;
validateConsistencyCases(inconsistencySeeds);
assert.equal(inconsistencySeeds.length, 200, 'Inconsistency lab has 200 initial cases');
const inconsistencyGroups = new Map();
for (const item of inconsistencySeeds)
 inconsistencyGroups.set(item.group, (inconsistencyGroups.get(item.group) || 0) + 1);
assert.deepEqual(Object.fromEntries(inconsistencyGroups), {
 direct_contradiction: 50, paraphrased_contradiction: 50,
 consistent_statements: 40, different_period_or_speaker: 40, hypothetical: 20
}, 'Inconsistency dataset covers direct and paraphrased contradictions and noncontradictions');
for (let i = 0; i < 400; i++) {
 const item = generatedConsistencyCase(inconsistencySeeds, i, 2026);
 assert.equal(item.expected.join(','), inconsistencySeeds[i % inconsistencySeeds.length].expected.join(','),
  'Generated NLI variants preserve the correct label');
 const claims = consistency.extractClaims(item.text);
 assert.ok(claims.length >= 1, 'NLI case includes an analysable claim');
 if (item.expected.length) {
  assert.ok(consistency.candidatePairs(claims).length > 0,
   'Expected contradiction retains an eligible pair: ' + item.id);
 }
}
assert.throws(() => validateConsistencyCases([{id:'bad',text:'A. B.',expected:['bandwagon']}]),
 /Invalid inconsistency/, 'NLI fixture labels must be inconsistency-only');
const { softmaxScores } = await import('../extension/src/nli-scores.mjs');
const labels = {0:'CONTRADICTION',1:'NEUTRAL',2:'ENTAILMENT'};
const calculated = softmaxScores([5, 1, 0], labels);
assert.ok(calculated.contradiction > 0.97 && calculated.neutral < 0.03,
 'Softmax maps paired NLI logits into contradiction evidence');
assert.ok(Math.abs(Object.values(calculated).reduce((sum, value) => sum + value, 0) - 1) < 1e-10,
 'NLI class scores sum to one');
assert.throws(() => softmaxScores([1, 2]), /Unexpected NLI logits/,
 'An invalid or unpaired model response does not silently pass');

const benchmarkPage = fs.readFileSync('extension/benchmark.html', 'utf8');
const benchmarkUI = fs.readFileSync('extension/src/benchmark-ui.mjs', 'utf8');
const benchmarkWorker = fs.readFileSync('extension/src/benchmark-worker.js', 'utf8');
const localServer = fs.readFileSync('scripts/serve-benchmark.mjs', 'utf8');
const nliSource = fs.readFileSync('extension/src/nli-inference.mjs', 'utf8');
assert.ok(benchmarkPage.includes('value="consistency"'),
 'The lab exposes a third independent inconsistency mode');
assert.ok(benchmarkUI.includes('inconsistency-examples.json') &&
 benchmarkWorker.includes('findInconsistencies(item.text, nliScorer)'),
 'The browser lab uses the same inference path as the extension');
assert.ok(localServer.includes('/evaluation/inconsistency-examples.json'),
 'The local server allows only the explicit inconsistency fixture');
assert.ok(nliSource.includes('text_pair: hypothesis') &&
 extensionWorker.includes('createNliScorer()'),
 'Firefox and lab use correctly tokenised NLI text pairs from one scoring module');
assert.ok(benchmarkWorker.includes('await initialiseConsistencyModel()'),
 'NLI benchmark model failures abort rather than report false negative passes');
console.log('Inconsistency lab wiring, seed data, scoring and offsets validated.');


// Contradictory statements attributed to different people are ordinary
// reporting of a disagreement, not necessarily an inconsistency in the article.
const attributionCases = JSON.parse(
 fs.readFileSync('evaluation/inconsistency-attribution-contrasts.json', 'utf8')).cases;
const highNliContradiction = async () => ({ contradiction: 0.995, neutral: 0.003, entailment: 0.002 });
for (const item of attributionCases) {
 const found = await consistency.findInconsistencies(item.text, highNliContradiction);
 const got = found.length ? ['argument_inconsistency'] : [];
 assert.deepEqual(got, item.expected, 'Attribution handling: ' + item.id);
}
for (const item of inconsistencySeeds.filter(item => item.group === 'different_period_or_speaker')) {
 const found = await consistency.findInconsistencies(item.text, highNliContradiction);
 assert.equal(found.length, 0, 'Different speaker or date: ' + item.id);
}
for (const item of inconsistencySeeds.filter(item =>
 item.group === 'direct_contradiction' || item.group === 'paraphrased_contradiction')) {
 const found = await consistency.findInconsistencies(item.text, highNliContradiction);
 assert.equal(found.length, 2, 'Genuine contradiction stays eligible: ' + item.id);
}
assert.equal(consistency.attributedSource('The manager later said the station closed.'),
 'manager', 'A reporting adverb is not part of the speaker identity');
assert.equal(consistency.attributedSource('The manager said the station is open.'),
 'manager', 'Stable attribution of reporting source');
assert.ok(!catalogue.techniques.some(item => item.id === 'argument_inconsistency'),
 'Inconsistency patterns belong to the dedicated red library, not the blue one');
console.log('Attribution-aware contradiction and insufficient-evidence catalogue checks passed.');



// Green positive-pattern recognition is deliberately independent of blue
// manipulation classification and red contradiction detection.
const { positiveTechniques, positiveRules, matchPositiveText } =
 await import('../extension/src/positive-matching.mjs');
const positiveCases = JSON.parse(fs.readFileSync(
 'evaluation/positive-matcher-examples.json', 'utf8')).cases;
assert.equal(positiveTechniques.length, positive.patterns.length,
 'Every published positive pattern has a local matching technique');
assert.equal(positiveCases.length, 72, 'Positive benchmark includes 72 labelled cases');
assert.equal(positiveCases.filter(item => item.expected.length).length, 36,
 'Positive benchmark includes 36 positive cases');
assert.equal(positiveCases.filter(item => !item.expected.length).length, 36,
 'Positive benchmark includes 36 negative near misses');
assert.ok(positiveRules.length >= positiveTechniques.length,
 'Each constructive pattern has matching rules');
assert.deepEqual(positiveTechniques.map(t => t.id).sort(),
 positive.patterns.map(t => t.id).sort(), 'Green matcher follows the website JSON catalogue');
const positiveErrors = [];
for (const item of positiveCases) {
 const found = await matchPositiveText(item.text);
 const predicted = [...new Set(found.map(match => match.technique.id))].sort();
 const expected = [...new Set(item.expected)].sort();
 if (JSON.stringify(predicted) !== JSON.stringify(expected))
  positiveErrors.push({ id: item.id, predicted, expected });
 for (const match of found) {
  assert.equal(match.technique.category, 'Positive',
   'Positive findings are coloured green by the Firefox highlighter');
  assert.ok(match.start >= 0 && match.end > match.start && match.end <= item.text.length,
   'Positive matches underline actual source characters');
 }
}
assert.deepEqual(positiveErrors, [], 'Constructive phrases match without false positives on 36 near misses');

const mixedPositiveNegative =
 'Everyone believes it, so it must be true. No need to answer now.';
const mixedNegativeMatches = await matchingCore.matchText(mixedPositiveNegative, {
 techniques: extensionCatalogue.techniques, rules: compiled
});
const mixedPositiveMatches = await matchPositiveText(mixedPositiveNegative);
assert.ok(mixedNegativeMatches.some(match => match.technique.id === 'bandwagon'),
 'Negative pattern remains detectable alongside positive wording');
assert.ok(mixedPositiveMatches.some(match => match.technique.id === 'respecting_attention'),
 'Green pattern is independently detected alongside negative wording');
assert.ok(selectionScript.includes('match.technique.category === "Positive" ? 1 : 2'),
 'Blue highlights take priority over overlapping green spans');
assert.ok(selectionScript.includes('technique.category === "Positive" ? "positive-patterns"'),
 'Green tooltip links to green pattern page rather than blue manipulation page');
assert.ok(extensionWorker.includes('matchPositiveText(data.text'),
 'Firefox worker runs positive matching without replacing blue or red passes');
assert.ok(benchmarkPage.includes('value="positive_rules"') &&
 benchmarkPage.includes('value="positive_ai"') &&
 benchmarkUI.includes('positive-matcher-examples.json') &&
 benchmarkWorker.includes('mode === "positive_ai"'),
 'The local test lab supports positive-only rules and AI benchmarks');
assert.ok(localServer.includes('/evaluation/positive-matcher-examples.json'),
 'The local test server exposes the positive fixture');
console.log('Green pattern matcher: 72 labelled cases, mixed colours, source offsets and lab wiring passed.');


// Concealed manipulation is a RELATION between a constructive opening and
// subsequent pressure. Neither mere co-occurrence nor author intent is inferred.
const { concealedPatterns, findConcealedPatterns } =
 await import('../extension/src/concealed-matching.mjs');
const { generatedConcealedCase } =
 await import('../evaluation/concealed-generator.mjs');
const concealedCases = JSON.parse(fs.readFileSync(
 'evaluation/concealed-pattern-examples.json', 'utf8')).cases;
assert.equal(concealedPatterns.length, 4, 'Initial relationship catalogue has four patterns');
assert.equal(concealedCases.length, 96, 'Concealed benchmark contains 96 cases');
assert.equal(concealedCases.filter(item => item.expected.length).length, 48,
 'Concealed benchmark includes 48 positive relationships');
assert.equal(concealedCases.filter(item => item.expected.length === 0).length, 48,
 'Concealed benchmark includes 48 counterexamples');
assert.equal(new Set(concealedPatterns.map(p => p.id)).size, concealedPatterns.length,
 'Relationship identifiers are unique');
for (const pattern of concealedPatterns) {
 assert.ok(pattern.positiveRegexes.length && pattern.negativeRegexes.length &&
  pattern.positiveIds.length && pattern.negativeIds.length,
  'Each relationship must declare positive and negative mechanisms: ' + pattern.id);
}
const concealedErrors = [];
for (let i = 0; i < concealedCases.length * 5; i++) {
 const item = generatedConcealedCase(concealedCases, i, 2026);
 const negatives = await matchingCore.matchText(item.text, {
  techniques: extensionCatalogue.techniques, rules: compiled
 });
 const positives = await matchPositiveText(item.text);
 const found = findConcealedPatterns(item.text, {
  positiveMatches: positives, negativeMatches: negatives
 });
 const predicted = [...new Set(found.map(match => match.technique.id))].sort();
 const expected = [...new Set(item.expected)].sort();
 if (JSON.stringify(predicted) !== JSON.stringify(expected))
  concealedErrors.push({ id: item.id, predicted, expected });
 for (const match of found) {
  assert.equal(match.technique.category, 'Concealed manipulation',
   'Concealed relationships carry turquoise category');
  assert.equal(match.kind, 'concealed', 'Relationship output is explicitly typed');
  assert.ok(match.start >= 0 && match.end > match.start && match.end <= item.text.length,
   'Turquoise matches retain the correct selected-text offsets');
  assert.ok(match.positiveText && match.negativeText,
   'Turquoise tooltip explains both sides of the rhetorical reversal');
 }
}
assert.deepEqual(concealedErrors, [],
 'Concealed relation classifier identifies pressure while rejecting co-occurrence and quoted speech');
const mereCoexistence = 'The decision is yours. The report was published. You must agree with me.';
assert.deepEqual(findConcealedPatterns(mereCoexistence), [],
 'A constructive sentence and a distant coercive sentence are not automatically a relationship');
const quotedDifference = 'The director said no pressure. The manager said you must agree with me.';
assert.deepEqual(findConcealedPatterns(quotedDifference), [],
 'Statements by different quoted speakers are not labelled concealed manipulation');
const explicitReversal = 'No pressure, but you must agree with me or lose your place.';
const turquoise = findConcealedPatterns(explicitReversal);
assert.equal(turquoise.length, 1, 'A direct reassurance-to-pressure reversal is detected');
assert.equal(explicitReversal.slice(turquoise[0].start, turquoise[0].end),
 'you must agree with me or lose your place.',
 'Turquoise underline targets the undermining pressure, not the whole passage');
assert.ok(selectionScript.includes('match.kind === "concealed"') &&
 selectionScript.includes('Relationship: positive wording followed by pressure'),
 'Firefox tooltip exposes the linked positive opening and pressure');
assert.ok(selectionScript.includes('TURQUOISE = "#12B6CF"') &&
 selectionScript.includes('border-left:3px solid ${TURQUOISE}'),
 'Turquoise underlines and tooltip accents both use Reform UK colour #12B6CF');
assert.ok(extensionWorker.includes('findConcealedPatterns(data.text') &&
 extensionWorker.includes('...concealedMatches'),
 'Firefox worker performs the relationship pass with the other three colours');
assert.ok(benchmarkPage.includes('value="concealed_rules"') &&
 benchmarkPage.includes('value="concealed_ai"') &&
 benchmarkUI.includes('concealed-pattern-examples.json') &&
 benchmarkWorker.includes('mode === "concealed_ai"'),
 'Benchmark supports both rules and actual local semantic turquoise tests');
assert.ok(localServer.includes('/evaluation/concealed-pattern-examples.json'),
 'The local test server makes the labelled relationship benchmark available');
console.log('Concealed relationship classifier: 480 generated cases and all four-color integration checks passed.');


// Whole-argument NLI assessment: extract conclusion and preceding premises
// from paragraphs, distinguish contradiction / missing support / support,
// and abstain when there is no explicit or sufficiently clear inference.
const argumentEngine = await import('../extension/src/argument-analysis.mjs');
const { validateArgumentCases, generatedArgumentCase } =
 await import('../evaluation/argument-generator.mjs');
const argumentSeeds = JSON.parse(fs.readFileSync(
 'evaluation/argument-support-examples.json', 'utf8')).cases;
validateArgumentCases(argumentSeeds);
assert.equal(argumentSeeds.length, 96, 'Argument lab has 96 independently labelled cases');
assert.deepEqual(Object.fromEntries(
 ['supported_conclusion','unsupported_conclusion','contradictory_claims','no_argument']
 .map(label => [label, argumentSeeds.filter(x => x.group === label).length])),
 { supported_conclusion:24, unsupported_conclusion:24, contradictory_claims:24, no_argument:24 },
 'Argument examples cover supported, unsupported, contradicted and absent inferences');
assert.deepEqual(argumentEngine.ARGUMENT_LABELS, [
 'contradictory_claims','unsupported_conclusion','supported_conclusion'
], 'Three argument labels share the public red pattern library');
for (const label of argumentEngine.ARGUMENT_LABELS)
 assert.ok(inconsistency.patterns.some(p => p.id === label),
  'The public red library describes each argument outcome: '+label);
const mockArgumentScores = {
 supported_conclusion: { contradiction: 0.01, neutral: 0.01, entailment: 0.98 },
 unsupported_conclusion: { contradiction: 0.01, neutral: 0.98, entailment: 0.01 },
 contradictory_claims: { contradiction: 0.98, neutral: 0.01, entailment: 0.01 }
};
const argumentErrors = [];
for (let i = 0; i < argumentSeeds.length * 5; i++) {
 const item = generatedArgumentCase(argumentSeeds, i, 2026);
 const label = item.expected[0] || 'unsupported_conclusion';
 const scorer = async () => mockArgumentScores[label];
 const statements = argumentEngine.extractArguments(item.text);
 const assessments = await argumentEngine.analyseArguments(item.text, scorer);
 const predicted = [...new Set(assessments.map(x => x.label))].sort();
 if (JSON.stringify(predicted) !== JSON.stringify(item.expected.slice().sort()))
  argumentErrors.push({ id: item.id, expected: item.expected, predicted,
   statements: statements.map(s => s.conclusion.text) });
 const findings = argumentEngine.argumentFindings(assessments);
 for (const assessment of assessments) {
  assert.equal(item.text.slice(assessment.conclusion.start, assessment.conclusion.end),
   assessment.conclusion.text, 'Conclusion offsets preserve source text: '+item.id);
  assert.ok(assessment.premise.trim(), 'Every assessment retains actual evidence: '+item.id);
 }
 for (const finding of findings) {
  assert.ok(item.text.slice(finding.start, finding.end).trim(), 'Red conclusion underline in bounds');
  assert.equal(finding.technique.category, 'Inconsistency', 'Flagged argument uses red');
  assert.ok(finding.otherText, 'Hover explanation identifies the supplied premises');
 }
 if (item.expected[0] === 'supported_conclusion')
  assert.equal(findings.length, 0, 'Supported inferences are NOT underlined red');
 if (!item.expected.length)
  assert.equal(findings.length, 0, 'No qualifying conclusion means no red underline');
}
assert.deepEqual(argumentErrors, [], 'All 480 bounded argument-parser variants retain correct structure');
assert.deepEqual(argumentEngine.classifyArgumentScore(
 { contradiction: 0.28, neutral: 0.42, entailment: 0.30 }), null,
 'Uncertain NLI scores abstain instead of manufacturing an unsupported conclusion');
const genuineLeap = 'Sales increased. Customer satisfaction improved. Therefore, the app is completely secure.';
const leapAssessments = await argumentEngine.analyseArguments(genuineLeap,
 async () => mockArgumentScores.unsupported_conclusion);
assert.equal(leapAssessments[0].label, 'unsupported_conclusion');
assert.match(leapAssessments[0].explanation, /Insufficient evidence provided to support/i);
const twoParagraphs = 'The library is open on weekends.\n\nIt has free admission.\nTherefore, the library is safe from all fires.';
assert.equal(argumentEngine.extractArguments(twoParagraphs).length, 1,
 'An argument may draw premises from adjacent paragraphs');
const unrelatedSections = 'The report was published.\n\n\n\nTherefore, the service is secure.';
assert.equal(argumentEngine.extractArguments(unrelatedSections).length, 0,
 'Premises may not be drawn from unrelated sections divided by multiple blank lines');
const headingsAndNoInference = [
 'The manager said the gates were open. The spokesperson denied it.',
 'Therefore, the product is completely safe.',
 'The results are uncertain. Therefore, we should collect more data.'
];
for (const text of headingsAndNoInference)
 assert.deepEqual(argumentEngine.extractArguments(text), [],
  'Reports, missing premises, and advice do not become factual conclusions');
assert.ok(benchmarkPage.includes('value="argument_support"') &&
 benchmarkWorker.includes('analyseArguments(item.text, nliScorer)') &&
 benchmarkUI.includes('argument-support-examples.json') &&
 localServer.includes('/evaluation/argument-support-examples.json'),
 'Argument NLI lab uses actual local NLI model and dedicated dataset');
assert.ok(extensionWorker.includes('analyseArguments(data.text, memoScore') &&
 extensionWorker.includes('argumentFindings(assessed)') &&
 extensionWorker.includes('...argumentIssues'),
 'Firefox worker performs argument analysis with the existing NLI scorer');
const backgroundSource = fs.readFileSync('extension/background.js', 'utf8');
assert.ok(backgroundSource.includes('DM_PROGRESS') &&
 selectionScript.includes('dm-pattern-status') &&
 !selectionScript.includes('cursor: wait !important'),
 'Slower red pass uses a nonblocking progress badge instead of forcing a wait cursor');
assert.ok(selectionScript.includes('match.kind === "argument_support"') &&
 selectionScript.includes('Premises provided:') &&
 selectionScript.includes('"inconsistency-patterns"'),
 'New red findings explain their premises and link to the red catalogue');
console.log('Argument support: 480 parser/verdict variants, NLI lab and nonblocking Firefox UI validated.');


// Real local NLI previously missed obvious conclusions when an irrelevant
// second premise diluted the relation. These controlled-score regressions
// test how the analyser fuses premise-level and combined NLI evidence.
// The browser test lab still measures real neural predictions separately.
const evidenceNli = {
 entailed: { contradiction: 0.01, neutral: 0.01, entailment: 0.98 },
 contradicted: { contradiction: 0.98, neutral: 0.01, entailment: 0.01 },
 unsupported: { contradiction: 0.01, neutral: 0.98, entailment: 0.01 },
 ambiguous: { contradiction: 0.31, neutral: 0.43, entailment: 0.26 }
};
const evidenceExamples = [
 {
  id: 'repeated premise beats combined neutral',
  text: 'The library opens to visitors every Sunday. Admission is free for children. Therefore, the library opens to visitors every Sunday.',
  score: () => evidenceNli.unsupported, expected: 'supported_conclusion'
 },
 {
  id: 'single relevant premise beats combined neutral',
  text: 'The station has step-free access to platform two. The office opens on weekdays. Therefore, the station has step-free access to platform two.',
  score: (premise) => premise.startsWith('The station has') ?
   evidenceNli.entailed : evidenceNli.unsupported,
  expected: 'supported_conclusion'
 },
 {
  id: 'individual contradictory premise beats combined uncertainty',
  text: 'The school serves vegetarian lunches on Fridays. Its kitchen employs six cooks. Therefore, the school serves no vegetarian lunches on Fridays.',
  score: (premise) => premise.startsWith('The school serves') ||
    premise.startsWith('the school serves') ?
    evidenceNli.contradicted : evidenceNli.ambiguous,
  expected: 'contradictory_claims'
 },
 {
  id: 'single neutral premise rescues unsupported inference',
  text: 'The council published its annual spending report. The report describes the previous year. Therefore, the council has eliminated all financial waste.',
  score: (premise) => premise.startsWith('The council published') ?
    evidenceNli.unsupported : evidenceNli.ambiguous,
  expected: 'unsupported_conclusion'
 },
 {
  id: 'combined premises may be needed for valid inference',
  text: 'All registered visitors receive a badge. Maria is a registered visitor. Therefore, Maria receives a badge.',
  score: (premise) => premise.includes('All registered visitors') && premise.includes('Maria is') ?
    evidenceNli.entailed : evidenceNli.unsupported,
  expected: 'supported_conclusion'
 },
 {
  id: 'contradiction wins over repeated supporting claim',
  text: 'The clinic provides eye tests on Tuesdays. The clinic does not provide eye tests on Tuesdays. Therefore, the clinic provides eye tests on Tuesdays.',
  score: (premise) => premise.includes('does not provide') ?
    evidenceNli.contradicted : evidenceNli.unsupported,
  expected: 'contradictory_claims'
 },
 {
  id: 'uncertain results abstain',
  text: 'The museum has opened a new exhibition. The centre has a cafe. Therefore, the museum is the safest in the world.',
  score: () => evidenceNli.ambiguous, expected: null
 }
];
for (const item of evidenceExamples) {
 const diagnostics = [];
 const assessments = await argumentEngine.analyseArguments(item.text,
  async (premise, hypothesis) => item.score(premise, hypothesis),
  { onDiagnostic: result => diagnostics.push(result) });
 assert.equal(assessments[0]?.label || null, item.expected, item.id);
 assert.equal(diagnostics.length, 1, 'One explicit inference: ' + item.id);
 assert.equal(diagnostics[0].comparisons.length, 3,
  'Both individual premises and their combination are assessed: ' + item.id);
 assert.equal(diagnostics[0].verdict, item.expected,
  'Score diagnostics include the actual outcome: ' + item.id);
 if (item.expected === 'supported_conclusion')
  assert.equal(argumentEngine.argumentFindings(assessments).length, 0,
   'Supported evidence never generates a red error: ' + item.id);
}
assert.equal(argumentEngine.combineArgumentEvidence([
 {kind:'combined',text:'x and y',forward:evidenceNli.unsupported},
 {kind:'premise_1',text:'x',forward:evidenceNli.entailed}
]).label,'supported_conclusion','A neutral combined score cannot override relevant support');
assert.equal(argumentEngine.combineArgumentEvidence([
 {kind:'combined',text:'x and y',forward:evidenceNli.entailed},
 {kind:'premise_1',text:'x',forward:evidenceNli.contradicted,
  reverse:evidenceNli.contradicted}
]).label,'contradictory_claims','Verified contradictory evidence takes precedence over partial support');
assert.equal(argumentEngine.combineArgumentEvidence([
 {kind:'combined',text:'x and y',forward:evidenceNli.ambiguous},
 {kind:'premise_1',text:'x',forward:evidenceNli.ambiguous}
]),null,'Low-confidence evidence does not fabricate an unsupported conclusion');
assert.ok(benchmarkWorker.includes('onDiagnostic: diagnostic => argumentDiagnostics.push(diagnostic)') &&
 benchmarkUI.includes('NLI evidence diagnostics') &&
 benchmarkUI.includes('Reverse C'),
 'Every failed real-model argument exposes all combined and individual NLI scores');
console.log('Argument evidence fusion: combined vs individual, contradiction priority, exact repetition and diagnostics passed.');
