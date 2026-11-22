import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadEngine } from './analyse.mjs';

const [inputPath, unitPath, contextPath] = process.argv.slice(2);
const { articles, retrievedAt } = JSON.parse(await readFile(inputPath, 'utf8'));
assert.equal(articles.length, 10);
assert.equal(new Set(articles.map(a => a.url)).size, 10);
const segmenter = new Intl.Segmenter('en-GB', { granularity: 'sentence' });
const texts = [], pairs = [];

function document(paragraphs) {
  const ids = [], pairIds = [];
  for (const paragraph of paragraphs) {
    let previous;
    for (const { segment } of segmenter.segment(paragraph)) {
      if (!segment.trim()) continue;
      const id = texts.push(segment.trim()) - 1;
      ids.push(id);
      if (previous !== undefined) pairIds.push(pairs.push([previous, id]) - 1);
      previous = id;
    }
  }
  assert.ok(ids.length);
  return { ids, pairIds };
}

const stories = articles.map(article => {
  assert.equal(article.comments.length, 5);
  return {
    article: document(article.paragraphs),
    headline: article.headline,
    comments: article.comments.map(comment => document(comment.body.split('\n'))),
  };
});

await writeFile(unitPath, JSON.stringify({ texts, pairs }));
execFileSync('python', [fileURLToPath(new URL('article-comment-context.py', import.meta.url)), unitPath, contextPath],
  { stdio: 'inherit' });
const contextual = JSON.parse(await readFile(contextPath, 'utf8'));
assert.equal(contextual.sentences.length, texts.length);
assert.equal(contextual.pairs.length, pairs.length);

const engine = await loadEngine({ download: false });
async function batch(items, scorer, size = 12) {
  const results = [];
  for (let i = 0; i < items.length; i += size) results.push(...await scorer(items.slice(i, i + size)));
  assert.equal(results.length, items.length);
  return results;
}
const inference = rows => engine.inference(rows.map(([a]) => texts[a]), rows.map(([, b]) => texts[b]));
const embeddings = await batch(texts, engine.embed);
const emotions = await batch(texts, engine.emotion);
const toxicity = await batch(texts, engine.toxicity);
const clickbait = await batch(texts, engine.clickbait);
const headlines = await batch(stories.map(story => story.headline), engine.clickbait);
const withinNli = await batch(pairs, inference);
const prefix = (name, scores) => Object.fromEntries(Object.entries(scores).map(([key, value]) => [`${name}.${key}`, value]));
const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
const cosine = (a, b) => dot(a, b) / Math.sqrt(dot(a, a) * dot(b, b));
const mean = values => values.reduce((sum, n) => sum + n, 0) / values.length;
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2;
}
function average(rows) {
  return Object.fromEntries([...new Set(rows.flatMap(Object.keys))].map(key =>
    [key, mean(rows.map(row => row[key]).filter(Number.isFinite))]));
}
const sentenceScores = texts.map((_, i) => ({ ...prefix('emotion', emotions[i]), ...prefix('toxicity', toxicity[i]),
  ...prefix('clickbaitBodyOutOfDomain', clickbait[i]), ...contextual.sentences[i] }));
const pairScores = pairs.map(([a, b], i) => ({ ...prefix('adjacentNli', withinNli[i]),
  'adjacentSimilarity.cosine': dot(embeddings[a], embeddings[b]), ...contextual.pairs[i] }));

function profile(doc) {
  return { ...average(doc.ids.map(id => sentenceScores[id])), ...average(doc.pairIds.map(id => pairScores[id])) };
}
const centre = doc => embeddings[doc.ids[0]].map((_, axis) => mean(doc.ids.map(id => embeddings[id][axis])));

const matches = stories.flatMap((story, articleIndex) => {
  const articleCentre = centre(story.article);
  return stories.flatMap(({ comments }, threadIndex) => comments.map((comment, commentIndex) => {
    let nearest = { similarity: -Infinity, a: null, b: null };
    for (const b of comment.ids) for (const a of story.article.ids) {
      const similarity = dot(embeddings[a], embeddings[b]);
      if (similarity > nearest.similarity) nearest = { similarity, a, b };
    }
    return { articleIndex, threadIndex, commentIndex, centroidCosine: cosine(articleCentre, centre(comment)), ...nearest };
  }));
});
const crossNli = await batch(matches.map(({ a, b }) => [a, b]), inference);
const reverseNli = await batch(matches.map(({ a, b }) => [b, a]), inference);
for (const [i, match] of matches.entries()) match.scores = {
  centroidCosine: match.centroidCosine, bestSentenceCosine: match.similarity,
  ...prefix('articleToComment', crossNli[i]), ...prefix('commentToArticle', reverseNli[i]),
};

const rows = stories.map((story, i) => {
  const group = matches.filter(match => match.articleIndex === i);
  const own = group.filter(match => match.threadIndex === i);
  const other = stories.flatMap((_, j) => j === i ? [] :
    [average(group.filter(match => match.threadIndex === j).map(match => match.scores))]);
  const ownMean = average(own.map(match => match.scores));
  const control = average(other);
  const profiles = story.comments.map(profile);
  return {
    url: articles[i].url, discussionCount: articles[i].count, articleSentences: story.article.ids.length,
    headlineClickbait: headlines[i].CLICKBAIT,
    articleProfile: profile(story.article), commentProfile: average(profiles),
    own: ownMean, other: control,
    centroidRankOfOwnThread: 1 + other.filter(row => row.centroidCosine > ownMean.centroidCosine).length,
    comments: articles[i].comments.map(({ id, recommendations }, j) => ({ id, recommendations,
      sentences: story.comments[j].ids.length, profile: profiles[j], match: own[j].scores })),
  };
});

function ranks(values) {
  return values.map(value => 1 + values.filter(item => item < value).length +
    (values.filter(item => item === value).length - 1) / 2);
}
function spearman(points) {
  if (points.length < 3) return null;
  const centred = scores => { const ranksForScores = ranks(scores); const m = mean(ranksForScores);
    return ranksForScores.map(rank => rank - m); };
  const score = cosine(centred(points.map(([a]) => a)), centred(points.map(([, b]) => b)));
  return Number.isFinite(score) ? score : null;
}
const relationships = Object.fromEntries(Object.keys(rows[0].own).map(key => [key, {
  sameArticleMedian: median(rows.map(row => row.own[key])),
  otherArticleMedian: median(rows.map(row => row.other[key])),
  medianPairedDifference: median(rows.map(row => row.own[key] - row.other[key])),
  articlesHigherThanControl: rows.filter(row => row.own[key] > row.other[key]).length,
}]));
const profileCorrelations = Object.fromEntries([...new Set(rows.flatMap(row => Object.keys(row.articleProfile)))].map(key => {
  const points = rows.map(row => [row.articleProfile[key], row.commentProfile[key]])
    .filter(point => point.every(Number.isFinite));
  return [key, { n: points.length, rho: spearman(points),
    medianShift: points.length ? median(points.map(([a, b]) => b - a)) : null }];
}));
const report = { retrievedAt, articleCount: rows.length, commentCount: 50, relationships, profileCorrelations,
  ownThreadRankFirst: rows.filter(row => row.centroidRankOfOwnThread === 1).length, articles: rows };
console.log('AUDIT_SUMMARY ' + JSON.stringify({ ...report, articles: rows.map(({ url, discussionCount, articleSentences,
  centroidRankOfOwnThread, comments, own, other }) => ({ url, discussionCount, articleSentences, centroidRankOfOwnThread,
  recommendations: comments.map(row => row.recommendations), ownCosine: own.centroidCosine, otherCosine: other.centroidCosine })) }));
await writeFile(process.env.ARTICLE_COMMENT_REPORT, JSON.stringify(report, null, 2));
