import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { AutoTokenizer, AutoModelForSequenceClassification, env, pipeline } from '@huggingface/transformers';

const [input, output] = process.argv.slice(2);
const { articles, collectedAt } = JSON.parse(await readFile(input, 'utf8'));
const settings = { device: 'cpu', dtype: 'q8' };
env.cacheDir = process.env.RUNNER_TEMP ? `${process.env.RUNNER_TEMP}/headline-models` : env.cacheDir;
const emotionId = 'SamLowe/roberta-base-go_emotions-onnx';
const embeddingId = 'Xenova/all-MiniLM-L6-v2';
const tokenizer = await AutoTokenizer.from_pretrained(emotionId, settings);
const emotion = await AutoModelForSequenceClassification.from_pretrained(emotionId, settings);
const embedding = await pipeline('feature-extraction', embeddingId, settings);
const labels = Object.values(emotion.config.id2label);
assert.equal(labels.length, 28);

const chunks = text => {
  const words = text.trim().split(/\s+/u);
  const rows = [];
  for (let i = 0; i < words.length; i += 110) rows.push(words.slice(i, i + 110).join(' '));
  return rows;
};
const plans = articles.map(article => {
  assert.equal(article.comments.length, 5);
  return [article.headline, ...article.comments.flatMap(comment => chunks(comment.body))];
});
const texts = plans.flat();
const scores = [];
for (let i = 0; i < texts.length; i += 16) {
  const batch = texts.slice(i, i + 16);
  const encoded = tokenizer(batch, { padding: true, truncation: true, max_length: 256 });
  const { logits } = await emotion(encoded);
  scores.push(...logits.tolist().map(row => row.map(value => 1 / (1 + Math.exp(-value)))));
}
console.log(`Emotion model scored ${texts.length} headline/comment chunks`);

const vectors = [];
for (let i = 0; i < articles.length; i += 16) {
  const headlines = articles.slice(i, i + 16).map(article => article.headline);
  vectors.push(...(await embedding(headlines, { pooling: 'mean', normalize: true })).tolist());
}

let offset = 0;
const mean = rows => labels.map((_, index) => rows.reduce((sum, row) => sum + row[index], 0) / rows.length);
const features = articles.map(({ url, date, headline, topics, count, comments }, index) => {
  const headlineEmotion = scores[offset++];
  const responses = comments.map(comment => {
    const n = chunks(comment.body).length;
    const result = mean(scores.slice(offset, offset + n));
    offset += n;
    return result;
  });
  return { url, date, headline, topics, count, vectors: vectors[index], headlineEmotion,
    commentEmotion: mean(responses), recommendations: comments.map(comment => comment.recommendations) };
});
assert.equal(offset, texts.length);
await writeFile(output, JSON.stringify({ collectedAt, labels, emotionId, embeddingId, features }));
