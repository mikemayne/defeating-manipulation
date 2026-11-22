import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createAnalyser } from './sentence-analyser.mjs';
import { parseSentence } from './grammar.mjs';
import nspell from 'nspell';
import britishEnglish from 'dictionary-en-gb';

const fakeModels = {
  embed: async texts => texts.map(() => [1, 0]),
  emotion: async () => ({}),
  clickbait: async () => ({}),
  toxicity: async () => ({}),
  inference: async () => ({}),
};
const analyse = createAnalyser(fakeModels);
test('consequence wording stays independent of hostility and time', async () => {
  for (const [sentence, expected] of [
    ['You have no idea what’s coming.', 'underspecified'],
    ['Tomorrow, you will find out what happens.', 'underspecified'],
    ['You have no idea who you’re fucking with.', 'underspecified'],
    ['You will pay for this.', 'underspecified'],
    ['Tomorrow you’ll have a lovely cake.', 'specified'],
    ['Tomorrow I will hit you.', 'specified'],
    ['The meeting ended at noon.', 'unclear'],
    ['Will you have a cake?', 'unclear'],
    ['You have no idea what is coming, but you will have a cake.', 'review'],
  ]) assert.equal((await analyse({ sentence })).consequence.status, expected, sentence);
});

test('pronoun candidates depend on the supplied context', () => {
  const sentence = 'They objected.';
  assert.equal(parseSentence(sentence, '').references[0]?.status, 'no_candidate_found');
  assert.deepEqual(parseSentence(sentence, 'The councillors met.').references[0]?.candidates, ['The councillors']);
  assert.equal(parseSentence(sentence, 'The councillors and teachers met.').references[0]?.status, 'multiple_candidates');
});

test('British dictionary correction preserves the original wording and span', async () => {
  const sentence = 'The Muslamic law was debated.';
  const spellchecker = nspell(britishEnglish);
  const calls = [];
  const analyser = createAnalyser({ ...fakeModels, emotion: async text => { calls.push(text); return {}; } },
    { spellchecker });
  const result = await analyser({ sentence });
  assert.equal(result.sentence, sentence);
  assert.deepEqual(calls, ['The Islamic law was debated.']);
  const [flag] = result.signals.spelling;
  assert.equal(sentence.slice(flag.start, flag.end), 'Muslamic');
  assert.equal(flag.attentionSignal, true);
  assert.equal(parseSentence('The Muslamic group met.', '', spellchecker).analysisText,
    'The Muslamic group met.');
  assert.equal(parseSentence('The committee recieved a letter.', '', spellchecker)
    .spelling.some(flag => flag.original === 'recieved'), true);
});

test('all model and linguistic signals run on one sentence and NLI can compare a contextual takeaway', async () => {
  const calls = [];
  const engine = {
    embed: async texts => {
      calls.push(['embed', texts.length]);
      return texts.map(() => [1, 0]);
    },
    emotion: async () => ({ fear: 0.2, amusement: 0.3 }),
    clickbait: async () => ({ clickbait: 0.02 }),
    toxicity: async () => ({ threat: 0.01 }),
    inference: async (premise, hypothesis) => {
      calls.push(['nli', premise, hypothesis]);
      return { contradiction: 0.1, entailment: 0.7, neutral: 0.2 };
    },
  };
  const analyse = createAnalyser(engine);
  const first = await analyse({ sentence: 'You will have cake.' });
  assert.deepEqual(Object.keys(first.signals), ['emotion', 'clickbait', 'toxicity', 'syntax', 'spelling', 'similarity', 'inference']);
  assert.equal(first.signals.clickbait.scope, 'out_of_domain');
  assert.equal(first.signals.inference.purpose, 'consequence_probe');
  assert.equal(first.signals.similarity[0].similarity, 1);
  assert.equal(first.consequence.status, 'specified');

  const second = await analyse({
    context: 'The bakery opened.', sentence: 'You will have cake.',
    takeaway: 'You are getting cake.', role: 'headline',
  });
  assert.equal(second.signals.clickbait.scope, 'headline');
  assert.equal(second.signals.inference.purpose, 'takeaway');
  assert.deepEqual(calls.filter(([kind]) => kind === 'embed').map(([, count]) => count), [12, 1, 1]);
  assert.deepEqual(calls.at(-1), ['nli', 'The bakery opened. You will have cake.', 'You are getting cake.']);
  await assert.rejects(analyse({ sentence: ' ' }), /sentence is required/);
});

test('a failed adapter cannot masquerade as a negative classification', async () => {
  const analyse = createAnalyser({
    embed: async texts => texts.map(() => [1, 0]),
    emotion: async () => ({}),
    clickbait: async () => ({}),
    toxicity: async () => { throw new Error('missing model'); },
    inference: async () => ({}),
  });
  await assert.rejects(analyse({ sentence: 'Hello.' }), /missing model/);
});

test('all five models and JavaScript linguistic checks score the fixture set with remote loading disabled',
  { skip: process.env.SENTENCE_LIVE !== '1', timeout: 180_000 }, () => {
    const beside = name => fileURLToPath(new URL(name, import.meta.url));
    const raw = execFileSync(process.execPath, [beside('analyse.mjs'), '--file', beside('cases.json')],
      { encoding: 'utf8', timeout: 175_000 });
    const results = JSON.parse(raw);
    assert.equal(results.length, 12);
    assert.deepEqual(results.slice(0, 4).map(item => item.consequence.status),
      ['underspecified', 'specified', 'specified', 'underspecified']);
    assert.equal(results[4].references[0].status, 'no_candidate_found');
    assert.equal(results[5].references[0].status, 'one_candidate');
    assert.equal(results[6].references[0].status, 'multiple_candidates');
    assert.equal(results[10].consequence.status, 'underspecified');
    assert.equal(results[11].consequence.status, 'unclear');

    for (const { signals } of results) {
      assert.equal(Object.keys(signals.emotion).length, 28);
      assert.equal(Object.keys(signals.clickbait.scores).length, 2);
      assert.equal(Object.keys(signals.toxicity).length, 6);
      assert.ok(signals.syntax.length > 2);
      assert.equal(signals.similarity.length, 4);
      assert.equal(Object.keys(signals.inference.scores).length, 3);
    }
    console.log(JSON.stringify(results.map(({ sentence, consequence, signals }) => ({
      sentence, consequence: consequence.status, threat: signals.toxicity.threat,
      clickbait: signals.clickbait.scores, nearest: signals.similarity[0].label,
      inference: signals.inference.scores,
    })), null, 2));
  });



