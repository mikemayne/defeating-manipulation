import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadEngine } from './analyse.mjs';

const articles = JSON.parse(await readFile(process.argv[2], 'utf8'));
assert.equal(articles.length, 100);
assert.equal(new Set(articles.map(article => article.url)).size, 100);
const segmenter = new Intl.Segmenter('en-GB', { granularity: 'sentence' });
const scoped = articles.map(article => {
  const sentences = article.paragraphs.flatMap(paragraph => [...segmenter.segment(paragraph)]
    .map(item => item.segment.trim()).filter(Boolean)).slice(0, 10);
  assert.ok(sentences.length >= 4, 'Insufficient extracted opening text: ' + article.url);
  return { ...article, sentences };
});
const engine = await loadEngine({ download: false });

async function batches(rows, scorer, size = 8) {
  const result = [];
  for (let offset = 0; offset < rows.length; offset += size) {
    result.push(...await scorer(rows.slice(offset, offset + size)));
  }
  assert.equal(result.length, rows.length);
  return result;
}

const text = scoped.flatMap(article => [article.headline, ...article.sentences]);
const embedding = await batches(text, engine.embed, 16);
const emotion = await batches(text, engine.emotion);
const toxicity = await batches(text, engine.toxicity);
const headlines = await batches(scoped.map(article => article.headline), engine.clickbait);
let offset = 0;
for (const [id, article] of scoped.entries()) {
  article.ids = article.sentences.map((_, i) => offset + i + 1);
  article.headlineId = offset;
  article.clickbait = headlines[id].CLICKBAIT;
  assert.ok(Number.isFinite(article.clickbait));
  offset += 1 + article.sentences.length;
}

function pair(article, first, second, position) {
  return { publisher: article.publisher, url: article.url, first, second, position };
}

const adjacent = scoped.flatMap(article => article.ids.slice(1)
  .map((second, index) => pair(article, article.ids[index], second, index)));
const sameArticleGap = scoped.flatMap(article => article.ids.slice(3)
  .map((second, index) => pair(article, article.ids[index], second, index)));
const acrossArticles = scoped.flatMap((article, id) => {
  const other = scoped[(id + 37) % scoped.length];
  return article.ids.slice(0, -1).flatMap((first, index) => other.ids[index + 1] === undefined ?
    [] : [pair(article, first, other.ids[index + 1], index)]);
});
const leadPairs = scoped.map(article => pair(article, article.headlineId, article.ids[0], -1));

const comparisons = [...adjacent, ...sameArticleGap, ...leadPairs];
const nli = await batches(comparisons, rows => engine.inference(rows.map(row => text[row.first]),
  rows.map(row => text[row.second])));
const emotions = Object.keys(emotion[0]).filter(label => label !== 'neutral');
for (const [index, row] of comparisons.entries()) row.nli = nli[index];

function cosine(first, second) {
  return embedding[first].reduce((sum, value, i) => sum + value * embedding[second][i], 0);
}

function strongest(index) {
  return emotions.reduce((a, b) => emotion[index][a] >= emotion[index][b] ? a : b);
}

function features(row) {
  const first = strongest(row.first), second = strongest(row.second);
  const firstScore = emotion[row.first][first], secondScore = emotion[row.second][second];
  return {
    ...row,
    cosine: cosine(row.first, row.second),
    emotionDelta: Math.max(...emotions.map(label =>
      Math.abs(emotion[row.first][label] - emotion[row.second][label]))),
    strongRise: firstScore < 0.5 && secondScore >= 0.5,
    strongFall: firstScore >= 0.5 && secondScore < 0.5,
    strongChange: firstScore >= 0.5 && secondScore >= 0.5 && first !== second,
    threatIncrease: toxicity[row.second].threat - toxicity[row.first].threat >= 0.2,
    insultIncrease: toxicity[row.second].insult - toxicity[row.first].insult >= 0.2,
    contrastMarker: /^(?:but|however|yet|although|nevertheless|instead)\b/i.test(text[row.second]),
    attributionMarker: /\b(?:said|told|according to|says|wrote|added)\b/i.test(text[row.second]),
  };
}

function median(values) {
  const a = [...values].sort((x, y) => x - y);
  if (!a.length) return null;
  const i = Math.floor(a.length / 2);
  return (a[i] + a[a.length % 2 ? i : i - 1]) / 2;
}

function stats(rows) {
  const count = rule => rows.filter(rule).length;
  const articlesWith = rule => new Set(rows.filter(rule).map(x => x.url)).size;
  const nliRows = rows.filter(x => x.nli);
  return {
    pairs: rows.length,
    articles: new Set(rows.map(x => x.url)).size,
    cosineMedian: median(rows.map(x => x.cosine)),
    emotionDeltaMedian: median(rows.map(x => x.emotionDelta)),
    emotionDeltaAtLeast035: count(x => x.emotionDelta >= 0.35),
    articlesWithEmotionDeltaAtLeast035: articlesWith(x => x.emotionDelta >= 0.35),
    strongEmotionRise: count(x => x.strongRise),
    strongEmotionFall: count(x => x.strongFall),
    strongEmotionLabelChange: count(x => x.strongChange),
    threatIncrease: count(x => x.threatIncrease),
    insultIncrease: count(x => x.insultIncrease),
    nliAtLeast070: nliRows.length ? Object.fromEntries(['entailment', 'neutral', 'contradiction'].map(label =>
      [label, { pairs: count(x => x.nli[label] >= 0.7), articles: articlesWith(x => x.nli[label] >= 0.7) }])) : null,
  };
}

const adjacentRows = adjacent.map(features);
const gapRows = sameArticleGap.map(features);
const firstTransitions = adjacentRows.filter(row => row.position === 0);
const marker = adjacentRows.filter(row => row.contrastMarker);
const attribution = adjacentRows.filter(row => row.attributionMarker);
const lead = leadPairs.map(features);
const highClickbait = lead.filter((_, i) => scoped[i].clickbait >= 0.5);
const lowClickbait = lead.filter((_, i) => scoped[i].clickbait < 0.5);
const report = {
  sampleSize: scoped.length,
  bodySentences: scoped.reduce((sum, article) => sum + article.ids.length, 0),
  adjacent: stats(adjacentRows),
  sameArticleThreeSentenceGap: stats(gapRows),
  differentArticlesMatchedPosition: stats(acrossArticles.map(features)),
  firstBodyTransition: stats(firstTransitions),
  laterBodyTransitions: stats(adjacentRows.filter(row => row.position > 0)),
  secondSentenceOpensWithContrastMarker: stats(marker),
  secondSentenceWithoutContrastMarker: stats(adjacentRows.filter(row => !row.contrastMarker)),
  secondSentenceHasAttributionMarker: stats(attribution),
  secondSentenceWithoutAttributionMarker: stats(adjacentRows.filter(row => !row.attributionMarker)),
  headlineAndOpening: stats(lead),
  clickbait: {
    scoreMedian: median(scoped.map(article => article.clickbait)),
    atLeast050: stats(highClickbait),
    below050: stats(lowClickbait),
  },
  publishers: Object.fromEntries([...new Set(scoped.map(article => article.publisher))].map(publisher => [
    publisher, {
      adjacent: stats(adjacentRows.filter(row => row.publisher === publisher)),
      gap: stats(gapRows.filter(row => row.publisher === publisher)),
      headlinesAtLeast050: scoped.filter(article => article.publisher === publisher && article.clickbait >= 0.5).length,
    },
  ])),
  sourceArticles: scoped.map(({ url, publisher, section, published, ids }) =>
    ({ url, publisher, section, published, bodySentences: ids.length })),
};
console.log('PAIR_AUDIT ' + JSON.stringify(report));
