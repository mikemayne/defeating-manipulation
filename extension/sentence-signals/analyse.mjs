import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import nspell from 'nspell';
import britishEnglish from 'dictionary-en-gb';
import { createAnalyser, models, validate } from './sentence-analyser.mjs';

const beside = name => fileURLToPath(new URL(name, import.meta.url));
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

export async function loadEngine({ download }) {
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
      const inputs = tokenizer(text, { text_pair: pair, padding: Array.isArray(text), truncation: true, max_length: 256 });
      const { logits } = await model(inputs);
      const values = Array.from(logits.data);
      if (!Array.isArray(text)) return scores(labels, values, activate);
      return text.map((_, index) => scores(labels,
        values.slice(index * labels.length, (index + 1) * labels.length), activate));
    };
  }

  const emotion = await classifier(models.emotion, remote, logits => logits.map(sigmoid));
  const clickbait = await classifier(models.clickbait, { ...local, dtype: 'q8' }, softmax);
  const toxicity = await classifier(models.toxicity, { ...remote, dtype: 'fp32' },
    logits => logits.map(sigmoid), ['toxic', 'severe_toxic', 'obscene', 'threat', 'insult', 'identity_hate']);
  const inference = await classifier(models.inference, remote, softmax,
    ['contradiction', 'entailment', 'neutral']);

  return {
    emotion, clickbait, toxicity, inference,
    embed: async texts => (await embedding(texts, { pooling: 'mean', normalize: true })).tolist(),
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
  const analyse = createAnalyser(engine, { spellchecker: nspell(britishEnglish) });
  const results = [];
  for (const row of batch) results.push(await analyse(row));
  console.log(JSON.stringify(Array.isArray(input) ? results : results[0], null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error.message);
    if (error.stderr) console.error(error.stderr.trim());
    process.exitCode = 1;
  });
}

