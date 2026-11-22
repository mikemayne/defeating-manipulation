import { spawn } from 'node:child_process';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { once } from 'node:events';

const beside = name => fileURLToPath(new URL(name, import.meta.url));
const models = {
  emotion: 'SamLowe/roberta-base-go_emotions-onnx',
  clickbait: 'valurank/distilroberta-clickbait',
  toxicity: 'nicky48/toxic-bert-ONNX',
  syntax: 'en_core_web_sm',
  embedding: 'Xenova/all-MiniLM-L6-v2',
  inference: 'onnx-community/nli-deberta-v3-xsmall-ONNX',
};
const examples = [
  ['specified', 'Tomorrow you will receive a cake.'],
  ['specified', 'If you return, I will break your phone.'],
  ['specified', 'Your account will be closed on Monday.'],
  ['specified', 'I will call you this evening.'],
  ['underspecified', 'You have no idea what is coming.'],
  ['underspecified', 'You will find out what happens next.'],
  ['underspecified', 'I have a surprise in store for you.'],
  ['underspecified', 'You will pay for this.'],
  ['no_consequence', 'The meeting ended at noon.'],
  ['no_consequence', 'I know what you mean.'],
  ['no_consequence', 'The report is on the table.'],
  ['no_consequence', 'She likes the new design.'],
];
const sigmoid = x => 1 / (1 + Math.exp(-x));
function softmax(values) {
  const max = Math.max(...values);
  const weights = values.map(value => Math.exp(value - max));
  const sum = weights.reduce((a, b) => a + b, 0);
  return weights.map(value => value / sum);
}
function scores(labels, logits, activate) {
  if (logits.length !== labels.length || logits.some(value => !Number.isFinite(value))) {
    throw new Error('Unexpected model logits for ' + labels.join(', '));
  }
  return Object.fromEntries(activate(logits).map((value, index) => [labels[index], value]));
}

export function compareExamples(vector, referenceVectors) {
  return examples.map(([label, text], index) => ({
    label,
    text,
    similarity: vector.reduce((sum, value, dim) => sum + value * referenceVectors[index][dim], 0),
  })).sort((a, b) => b.similarity - a.similarity);
}

const subjects = new Set(['nsubj', 'nsubjpass']);
const thirdPerson = new Set(['he', 'she', 'they', 'it']);
const nominal = new Set(['NOUN', 'PROPN']);

function subjectReferences(tokens, preceding) {
  return tokens.filter(token => subjects.has(token.dep) && thirdPerson.has(token.lower))
    .map(token => {
      const candidates = [...preceding, ...tokens.slice(0, token.index)]
        .filter(candidate => nominal.has(candidate.pos) && candidate.subject)
        .filter(candidate => {
          if (token.lower === 'they') {
            return candidate.number === 'Plur' || candidate.entity === 'PERSON';
          }
          if (token.lower === 'it') {
            return candidate.number !== 'Plur' && candidate.entity !== 'PERSON';
          }
          return candidate.number !== 'Plur' &&
            (candidate.entity === 'PERSON' || candidate.pos === 'NOUN');
        });
      const names = [...new Set(candidates.map(candidate => candidate.span))];
      const statuses = ['no_candidate_found', 'one_candidate', 'multiple_candidates'];
      return { pronoun: token.text, offset: token.offset, candidates: names,
        status: statuses[Math.min(2, names.length)] };
    });
}

export function describeText(text, tokens, preceding) {
  const words = text.replace(/[’‘]/g, "'").toLowerCase();
  const openEnding = [
    /\b(?:no idea|don't know|do not know|find out|wait and see|see)\s+(?:what(?:'s| is| will)|what happens|what comes)\b/,
    /\b(?:what(?:'s| is) coming|got something coming|something (?:is going to|will) happen|(?:a )?surprise in store)\b/,
    /\b(?:pay for (?:it|this|that)|regret (?:it|this|that)|won't know what hit you)\b/,
    /\b(?:no idea|don't know|do not know)\s+(?:who|whom)\s+you(?:'re| are)\s+(?:\w+\s+)?(?:dealing|messing|fucking)\s+with\b/,
  ].some(pattern => pattern.test(words));
  const explicitClause = tokens.some(token => token.pos === 'AUX' &&
    ["will", "'ll", 'shall'].includes(token.lower.replace(/[’‘]/g, "'")) &&
    ['VERB', 'ADJ', 'NOUN'].includes(tokens[token.head]?.pos) &&
    !['be', 'happen', 'know', 'see', 'find', 'come', 'regret'].includes(tokens[token.head].lemma));
  const timeAnchor = /\b(?:tomorrow|tonight|next week|later today|this evening)\b/.test(words);
  const reason = openEnding ? 'open_ended_wording' : explicitClause ? 'future_clause' : 'no_rule_matched';
  const status = openEnding ? (explicitClause && /\b(?:but|and then)\b/.test(words) ? 'review' : 'underspecified') :
    explicitClause && !text.trimEnd().endsWith('?') ? 'specified' : 'unclear';
  return { consequence: { status, reason, timeAnchor }, references: subjectReferences(tokens, preceding) };
}

function optionalText(value, name) {
  if (value == null) return '';
  if (typeof value !== 'string') throw new TypeError(name + ' must be text');
  return value.trim();
}

function validate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Expected a JSON object');
  const sentence = optionalText(input.sentence, 'sentence');
  if (!sentence) throw new TypeError('sentence is required');
  return {
    sentence,
    context: optionalText(input.context, 'context'),
    takeaway: optionalText(input.takeaway, 'takeaway'),
    role: optionalText(input.role, 'role') || 'sentence',
  };
}

export function createAnalyser(engine) {
  let referenceVectors;
  return async function analyse(input) {
    const { sentence, context, takeaway, role } = validate(input);
    referenceVectors ??= await engine.embed(examples.map(([, text]) => text));
    const premise = [context, sentence].filter(Boolean).join(' ');
    const hypothesis = takeaway || 'The text states what specific action or event is expected to happen.';
    const [parsed, [vector], emotion, clickbait, toxicity, inference] = await Promise.all([
      engine.parse([sentence, context]),
      engine.embed([sentence]),
      engine.emotion(sentence),
      engine.clickbait(sentence),
      engine.toxicity(sentence),
      engine.inference(takeaway ? premise : sentence, hypothesis),
    ]);
    const syntax = describeText(sentence, parsed[0], parsed[1]);
    return {
      sentence,
      models,
      consequence: syntax.consequence,
      references: syntax.references,
      signals: {
        emotion,
        clickbait: { scope: role === 'headline' ? 'headline' : 'out_of_domain', scores: clickbait },
        toxicity,
        syntax: parsed[0],
        similarity: compareExamples(vector, referenceVectors).slice(0, 4),
        inference: { purpose: takeaway ? 'takeaway' : 'consequence_probe', hypothesis, scores: inference },
      },
    };
  };
}

async function spacyBridge() {
  const child = spawn(process.env.SENTENCE_PYTHON || 'python', ['-X', 'utf8', beside('spacy_bridge.py')],
    { stdio: ['pipe', 'pipe', 'inherit'], windowsHide: true });
  const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
  const closed = once(child, 'close');
  closed.catch(() => {});
  await once(child, 'spawn');
  child.stdin.on('error', () => {});
  return {
    async parse(texts) {
      await new Promise((resolve, reject) => {
        child.stdin.write(JSON.stringify(texts) + '\n', error => error ? reject(error) : resolve());
      });
      const reply = await lines.next();
      if (reply.done) throw new Error('spaCy returned no result');
      return JSON.parse(reply.value);
    },
    async close() {
      child.stdin.end();
      await closed;
    },
  };
}

async function loadEngine({ download }) {
  const hf = await import('@huggingface/transformers');
  const modelDir = resolve(process.env.SENTENCE_MODEL_DIR || beside('.models'));
  await mkdir(modelDir, { recursive: true });
  hf.env.localModelPath = modelDir + '/';
  hf.env.cacheDir = resolve(modelDir, 'cache');
  hf.env.allowRemoteModels = download;
  const local = { local_files_only: true, device: 'cpu' };
  const remote = { local_files_only: !download, device: 'cpu', dtype: 'q8' };
  const embedding = await hf.pipeline('feature-extraction', models.embedding, remote);

  async function classifier(id, settings, activate, fixedLabels) {
    const tokenizer = await hf.AutoTokenizer.from_pretrained(id, settings);
    const model = await hf.AutoModelForSequenceClassification.from_pretrained(id, settings);
    const labels = fixedLabels ?? Object.values(model.config.id2label);
    return async (text, pair = null) => {
      const inputs = tokenizer(text, { text_pair: pair, truncation: true, max_length: 256 });
      const { logits } = await model(inputs);
      return scores(labels, Array.from(logits.data), activate);
    };
  }

  const emotion = await classifier(models.emotion, remote, logits => logits.map(sigmoid));
  const clickbait = await classifier(models.clickbait, { ...local, dtype: 'q8' }, softmax);
  const toxicity = await classifier(models.toxicity, { ...remote, dtype: 'fp32' },
    logits => logits.map(sigmoid), ['toxic', 'severe_toxic', 'obscene', 'threat', 'insult', 'identity_hate']);
  const inference = await classifier(models.inference, remote, softmax,
    ['contradiction', 'entailment', 'neutral']);

  const syntax = await spacyBridge();
  return {
    emotion, clickbait, toxicity, inference,
    embed: async texts => (await embedding(texts, { pooling: 'mean', normalize: true })).tolist(),
    parse: syntax.parse,
    close: syntax.close,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const warm = args[0] === '--warm';
  const file = args[0] === '--file';
  if ((warm && args.length !== 1) || (file && args.length !== 2) ||
      (!warm && !file && args.length !== 1)) {
    throw new Error('Usage: node analyse.mjs --warm | --file cases.json | JSON_OBJECT');
  }
  const input = warm ? { sentence: 'City council closes the park.', takeaway: 'The park is closed.' } :
    JSON.parse(file ? await readFile(args[1], 'utf8') : args[0]);
  const batch = Array.isArray(input) ? input : [input];
  batch.forEach(validate);
  const engine = await loadEngine({ download: warm });
  try {
    const analyse = createAnalyser(engine);
    const results = [];
    for (const row of batch) results.push(await analyse(row));
    console.log(JSON.stringify(Array.isArray(input) ? results : results[0], null, 2));
  } finally {
    await engine.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error.message);
    if (error.stderr) console.error(error.stderr.trim());
    process.exitCode = 1;
  });
}

