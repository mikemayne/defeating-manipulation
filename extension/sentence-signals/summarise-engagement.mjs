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
function solve(matrix, values) {
  const rows = matrix.map((row, i) => [...row, values[i]]);
  for (let i = 0; i < rows.length; i++) {
    const pivot = rows[i][i];
    rows[i] = rows[i].map(value => value / pivot);
    for (let j = 0; j < rows.length; j++) {
      if (j === i) continue;
      const factor = rows[j][i];
      rows[j] = rows[j].map((value, k) => value - factor * rows[i][k]);
    }
  }
  return rows.map(row => row.at(-1));
}

function compareHoldouts(target) {
  const available = threads.filter(row => Number.isFinite(target(row)));
  if (available.length < 4) return null;
  const errors = available.map((held, i) => {
    const train = available.filter((_, j) => i !== j);
    const y = train.map(target);
    const averageY = mean(y);
    const columns = keys(train.map(row => row.articleProfile)).flatMap(key => {
      const values = train.map(row => row.articleProfile[key]).filter(Number.isFinite);
      if (values.length < 2) return [];
      const centre = mean(values);
      const scale = Math.sqrt(mean(values.map(value => (value - centre) ** 2)));
      return scale > 1e-9 ? [{ key, centre, scale }] : [];
    });
    const vector = row => columns.map(({ key, centre, scale }) => {
      const value = row.articleProfile[key];
      return Number.isFinite(value) ? (value - centre) / scale : 0;
    });
    const x = train.map(vector);
    const heldX = vector(held);
    const dot = (a, b) => sum(a.map((value, j) => value * b[j]));
    const penalty = Math.max(columns.length, 1);
    const kernel = x.map((row, j) => x.map((other, k) => dot(row, other) + (j === k ? penalty : 0)));
    const weights = solve(kernel, y.map(value => value - averageY));
    const prediction = averageY + sum(x.map((vector, j) => weights[j] * dot(heldX, vector)));
    return [Math.abs(median(y) - target(held)), Math.abs(prediction - target(held))];
  });
  return { n: available.length, medianBaselineMAE: mean(errors.map(row => row[0])),
    articleSignalsRidgeMAE: mean(errors.map(row => row[1])) };
}
const holdout = {
  logVoteTotal: compareHoldouts(row => Math.log1p(row.votes)),
  downvoteShare: compareHoldouts(row => row.downvoteShare),
  neutral: compareHoldouts(row => row.commentProfile['emotion.neutral']),
  disapproval: compareHoldouts(row => row.commentProfile['emotion.disapproval']),
};
const summary = { selection: 'Top five by upvotes plus downvotes among comments present in the release',
  articleCount: threads.length, commentCount: sum(threads.map(r => r.comments.length)),
  voteDistribution: { min: Math.min(...threads.map(r => r.votes)), median: median(threads.map(r => r.votes)),
    max: Math.max(...threads.map(r => r.votes)), total: sum(threads.map(r => r.votes)),
    downvotes: sum(threads.map(r => r.downvotes)) },
  holdout,
  baselines: {
    bodyLengthRho: spearman(threads.map(r => [r.sentences, r.votes])),
    availableCommentCountRho: spearman(threads.map(r => [r.discussionCount, r.votes])) },
  magnitude, response, topic: scores.relationships.centroidCosine,
  articles: threads.map(({ sourceId, url, discussionCount, sentences, upvotes, downvotes, votes, downvoteShare, semanticMatch, semanticControl }) =>
    ({ sourceId, url, discussionCount, sentences, upvotes, downvotes, votes, downvoteShare, semanticMatch, semanticControl })) };
await writeFile(outputPath, JSON.stringify({ ...summary, articles: threads }, null, 2));
console.log('ENGAGEMENT_SUMMARY ' + JSON.stringify(summary));
