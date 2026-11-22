import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';

const [sourcePath, scoresPath, outputPath] = process.argv.slice(2);
const { articles } = JSON.parse(await readFile(sourcePath, 'utf8'));
const scores = JSON.parse(await readFile(scoresPath, 'utf8'));
const sum = xs => xs.reduce((a, b) => a + b, 0);
const mean = xs => sum(xs) / xs.length;
const median = xs => {
  const values = [...xs].sort((a, b) => a - b);
  return (values[Math.floor((values.length - 1) / 2)] + values[Math.floor(values.length / 2)]) / 2;
};
const ranks = xs => xs.map(x => 1 + xs.filter(y => y < x).length + (xs.filter(y => y === x).length - 1) / 2);
function spearman(points) {
  const valid = points.filter(point => point.every(Number.isFinite));
  if (valid.length < 3) return null;
  const centre = column => { const row = ranks(valid.map(p => p[column])); return row.map(x => x - mean(row)); };
  const a = centre(0), b = centre(1);
  const scale = Math.sqrt(sum(a.map(x => x * x)) * sum(b.map(x => x * x)));
  return scale ? sum(a.map((x, i) => x * b[i])) / scale : null;
}
const keys = rows => [...new Set(rows.flatMap(Object.keys))];
function weighted(rows, key) {
  const valid = rows.filter(row => Number.isFinite(row.profile[key]));
  const total = sum(valid.map(row => row.votes));
  return total ? sum(valid.map(row => row.votes * row.profile[key])) / total : null;
}

assert.equal(articles.length, scores.articles.length);
const threads = articles.map((article, i) => {
  const scored = scores.articles[i];
  assert.equal(scored.url, article.url);
  const comments = article.comments.map(({ id, upvotes, downvotes }, j) => {
    const result = scored.comments[j];
    assert.equal(id, result.id);
    assert.ok([upvotes, downvotes].every(n => Number.isSafeInteger(n) && n >= 0));
    assert.equal(upvotes + downvotes, result.recommendations);
    return { id, upvotes, downvotes, votes: upvotes + downvotes, profile: result.profile, match: result.match };
  });
  assert.equal(comments.length, 5);
  const upvotes = sum(comments.map(r => r.upvotes));
  const downvotes = sum(comments.map(r => r.downvotes));
  const votes = upvotes + downvotes;
  const commentProfile = Object.fromEntries(keys(comments.map(r => r.profile)).map(key => [key, weighted(comments, key)]));
  return { sourceId: article.sourceId, url: article.url, discussionCount: article.count, sentences: scored.articleSentences,
    upvotes, downvotes, votes, downvoteShare: votes ? downvotes / votes : null,
    articleProfile: { ...scored.articleProfile, headlineClickbait: scored.headlineClickbait }, commentProfile,
    semanticMatch: scored.own.centroidCosine, semanticControl: scored.other.centroidCosine, comments };
});
const targets = keys(threads.map(r => r.articleProfile));
const magnitude = Object.fromEntries(targets.map(key => [key,
  spearman(threads.map(row => [row.articleProfile[key], row.votes]))]));
const response = Object.fromEntries(targets.map(key => {
  const points = threads.map(row => [row.articleProfile[key], row.commentProfile[key]])
    .filter(pair => pair.every(Number.isFinite));
  return [key, { n: points.length, rho: spearman(points),
    medianShift: points.length ? median(points.map(([a, b]) => b - a)) : null }];
}));
const holdoutErrors = predictor => threads.map((row, i) => {
  const train = threads.filter((_, j) => i !== j);
  return Math.abs(predictor(train, row) - Math.log1p(row.votes));
});
const baseline = mean(holdoutErrors(train => median(train.map(r => Math.log1p(r.votes)))));
const summary = { selection: 'Top five by upvotes plus downvotes among comments present in the release',
  articleCount: threads.length, commentCount: sum(threads.map(r => r.comments.length)),
  voteDistribution: { min: Math.min(...threads.map(r => r.votes)), median: median(threads.map(r => r.votes)),
    max: Math.max(...threads.map(r => r.votes)), total: sum(threads.map(r => r.votes)),
    downvotes: sum(threads.map(r => r.downvotes)) },
  baselines: { logVoteMedianLeaveOneOutMAE: baseline,
    bodyLengthRho: spearman(threads.map(r => [r.sentences, r.votes])),
    availableCommentCountRho: spearman(threads.map(r => [r.discussionCount, r.votes])) },
  magnitude, response, topic: scores.relationships.centroidCosine,
  articles: threads.map(({ sourceId, url, discussionCount, sentences, upvotes, downvotes, votes, downvoteShare, semanticMatch, semanticControl }) =>
    ({ sourceId, url, discussionCount, sentences, upvotes, downvotes, votes, downvoteShare, semanticMatch, semanticControl })) };
await writeFile(outputPath, JSON.stringify({ ...summary, articles: threads }, null, 2));
console.log('ENGAGEMENT_SUMMARY ' + JSON.stringify(summary));
