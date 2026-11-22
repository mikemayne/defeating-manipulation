import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createAnalyser, describeText } from './analyse.mjs';

const token = (text, index, props = {}) => ({
  index, text, lower: text.toLowerCase(), offset: 0, span: text, ...props,
});
const future = [
  token('You', 0, { dep: 'nsubj' }),
  token('will', 1, { pos: 'AUX', head: 2 }),
  token('have', 2, { pos: 'VERB', lemma: 'have' }),
];

test('consequence wording stays independent of hostility and time', () => {
  for (const text of [
    'You have no idea what’s coming.',
    'Tomorrow, you will find out what happens.',
    'You have no idea who you’re fucking with.',
    'You will pay for this.',
  ]) assert.equal(describeText(text, [], []).consequence.status, 'underspecified');
  for (const text of ['Tomorrow you will have a lovely cake.', 'Tomorrow I will hit you.']) {
    assert.equal(describeText(text, future, []).consequence.status, 'specified');
  }
  assert.equal(describeText('The meeting ended at noon.', [], []).consequence.status, 'unclear');
  assert.equal(describeText('Will you have a cake?', future, []).consequence.status, 'unclear');
  assert.equal(describeText('You have no idea what is coming, but you will have a cake.', future, [])
    .consequence.status, 'review');
});

test('pronoun candidates depend on the supplied context', () => {
  const they = token('They', 0, { dep: 'nsubj' });
  const council = token('councillors', 0, { dep: 'nsubj', subject: true, pos: 'NOUN', number: 'Plur', span: 'The councillors' });
  const teachers = token('teachers', 0, { dep: 'nsubj', subject: true, pos: 'NOUN', number: 'Plur', span: 'The teachers' });
  assert.equal(describeText('They objected.', [they], []).references[0].status, 'no_candidate_found');
  assert.deepEqual(describeText('They objected.', [they], [council]).references[0].candidates, ['The councillors']);
  assert.equal(describeText('They objected.', [they], [council, teachers]).references[0].status, 'multiple_candidates');
});

test('all six signals run on one sentence and NLI can compare a contextual takeaway', async () => {
  const calls = [];
  const engine = {
    parse: async () => [future, []],
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
  assert.deepEqual(Object.keys(first.signals), ['emotion', 'clickbait', 'toxicity', 'syntax', 'similarity', 'inference']);
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
    parse: async () => [[], []],
    embed: async texts => texts.map(() => [1, 0]),
    emotion: async () => ({}),
    clickbait: async () => ({}),
    toxicity: async () => { throw new Error('missing model'); },
    inference: async () => ({}),
  });
  await assert.rejects(analyse({ sentence: 'Hello.' }), /missing model/);
});

test('all six models score the fixture set with remote loading disabled',
  { skip: process.env.SENTENCE_LIVE !== '1', timeout: 180_000 }, () => {
    const beside = name => fileURLToPath(new URL(name, import.meta.url));
    const raw = execFileSync(process.execPath, [beside('analyse.mjs'), '--file', beside('cases.json')],
      { encoding: 'utf8', timeout: 175_000 });
    const results = JSON.parse(raw);
    assert.equal(results.length, 10);
    assert.deepEqual(results.slice(0, 4).map(item => item.consequence.status),
      ['underspecified', 'specified', 'specified', 'underspecified']);
    assert.equal(results[4].references[0].status, 'no_candidate_found');
    assert.equal(results[5].references[0].status, 'one_candidate');
    assert.equal(results[6].references[0].status, 'multiple_candidates');

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

