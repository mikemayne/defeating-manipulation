import { AutoTokenizer, env as tokenizerEnv } from './vendor/transformers.min.js';
import { env, InferenceSession, Tensor } from './vendor/ort.wasm.min.mjs';

tokenizerEnv.allowRemoteModels = false;
tokenizerEnv.allowLocalModels = true;
tokenizerEnv.localModelPath = new URL('./', import.meta.url).href;
env.wasm.wasmPaths = new URL('./vendor/', import.meta.url).href;
env.wasm.numThreads = 1;

export async function loadManifest() {
  const response = await fetch(new URL('./manifest.json', import.meta.url));
  if (!response.ok) throw new Error('Classifier assets are missing. Run the training workflow.');
  return response.json();
}

function encode(tokenizer, text, topic, { maxLength, topicLimit }) {
  const subject = tokenizer.encode(topic, { add_special_tokens: false }).slice(0, topicLimit);
  const statement = tokenizer.encode(text, { add_special_tokens: false })
    .slice(0, maxLength - subject.length - 3);
  const [cls, sep] = tokenizer.encode('', { add_special_tokens: true });
  const first = [cls, ...statement, sep];
  const second = [...subject, sep];
  const padding = maxLength - first.length - second.length;
  const tensor = values => new Tensor('int64', BigInt64Array.from(values, BigInt), [1, maxLength]);
  return {
    input_ids: tensor([...first, ...second, ...Array(padding).fill(tokenizer.pad_token_id)]),
    attention_mask: tensor([...Array(first.length + second.length).fill(1), ...Array(padding).fill(0)]),
    token_type_ids: tensor([...Array(first.length).fill(0), ...Array(second.length).fill(1),
      ...Array(padding).fill(0)]),
  };
}

export async function loadClassifier(manifest, name = manifest.defaultModel) {
  const model = manifest.models.find(candidate => candidate.name === name);
  if (!model) throw new Error('Unknown encoder');
  const [tokenizer, session] = await Promise.all([
    AutoTokenizer.from_pretrained(model.name, { local_files_only: true }),
    InferenceSession.create(new URL('./' + model.name + '/model-int8.onnx', import.meta.url).href,
      { executionProviders: ['wasm'] })
  ]);

  return {
    async analyse(text, topic = '') {
      if (!text.trim()) return { status: 'insufficient_context', scores: [], contextScore: 1 };
      const feeds = encode(tokenizer, text.trim(), topic.trim(), manifest);
      const output = await session.run(feeds);
      const logits = Array.from(output.logits.data);
      const scores = manifest.labels.map((label, index) => {
        const { slope, intercept, threshold } = model.calibration[index];
        const score = 1 / (1 + Math.exp(-(slope * logits[index] + intercept)));
        return { ...label, score, detected: score >= threshold };
      });
      const context = scores.pop();
      const status = scores.some(score => score.detected) ? 'match'
        : context.detected ? 'insufficient_context' : 'no_match';
      return { status, scores, contextScore: context.score, logits,
        tokenIds: Array.from(feeds.input_ids.data, Number) };
    },
    async release() { await session.release(); },
  };
}
