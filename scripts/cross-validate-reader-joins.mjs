#!/usr/bin/env node
/**
 * Five-fold case-level cross-validation for punctuation joins.
 * Reuses scored AND/BUT candidates from fit-reader-join-thresholds.mjs.
 * Optionally obtains a third model score for the original punctuation (KEEP).
 * No production thresholds or source text are changed.
 *
 * From repository root:
 *   node scripts/cross-validate-reader-joins.mjs
 *   node scripts/cross-validate-reader-joins.mjs --score-keep
 *   node scripts/cross-validate-reader-joins.mjs --scores evaluation/reader-join-cross-validation.json
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { selectJoin, DEFAULT_JOIN_THRESHOLDS } from '../extension/src/reader-join-thresholds.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LABELS = ['keep', 'and', 'but'];
const defaults = {
  scores: path.join(root, 'evaluation/reader-join-fit.json'),
  dataset: path.join(root, 'evaluation/reader-strategy-synthetic-reference.json'),
  output: path.join(root, 'evaluation/reader-join-cross-validation.json'),
  folds: 5,
  seed: 20261121,
  maxErrors: 20,
  scoreKeep: false,
};

function usage() {
  console.log(`Usage: node scripts/cross-validate-reader-joins.mjs [options]

  --scores PATH       Existing saved scores (default evaluation/reader-join-fit.json)
  --dataset PATH      Source labels and text (default synthetic reference dataset)
  --output PATH       JSON results and cached KEEP scores
  --folds N           Number of case-level folds (default 5; 2..20)
  --seed N            Reproducible fold shuffle seed (default 20261121)
  --max-errors N      Number of incorrect decisions to print (default 20)
  --score-keep        Also score original punctuation with the local language model
  --help              Show this help

The first run with --score-keep calculates KEEP scores for labelled boundaries.
They are saved in --output and can be reused with --scores <previous output>.
Model scores are NOT reader agreement or calibrated probabilities.
`);
}
function parseArgs(args) {
  const o = { ...defaults };
  const ints = new Map([['--folds', 'folds'], ['--seed', 'seed'], ['--max-errors', 'maxErrors']]);
  const paths = new Map([['--scores', 'scores'], ['--dataset', 'dataset'], ['--output', 'output']]);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--help' || a === '-h') { usage(); process.exit(0); }
    if (a === '--score-keep') { o.scoreKeep = true; continue; }
    if (!ints.has(a) && !paths.has(a)) throw Error(`Unknown option: ${a}`);
    if (++i >= args.length) throw Error(`Missing argument for ${a}`);
    if (ints.has(a)) {
      const value = Number(args[i]);
      if (!Number.isSafeInteger(value)) throw Error(`${a} requires an integer`);
      o[ints.get(a)] = value;
    } else o[paths.get(a)] = path.resolve(process.cwd(), args[i]);
  }
  if (o.folds < 2 || o.folds > 20) throw Error('--folds must be 2..20');
  if (o.maxErrors < 0 || o.maxErrors > 10000) throw Error('--max-errors must be 0..10000');
  return o;
}
function shuffle(values, seed) {
  let s = seed >>> 0;
  const random = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
  const a = [...values];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function isScore(x) { return typeof x === 'number' && Number.isFinite(x); }
function pct(v) { return v == null ? 'n/a' : `${(100 * v).toFixed(1)}%`; }
function extractRows(predictions, texts) {
  const rows = [];
  const unmatched = [];
  const seen = new Set();
  for (const item of predictions) {
    if (!item || typeof item.id !== 'string' || seen.has(item.id))
      throw Error('Scored examples must have unique IDs');
    seen.add(item.id);
    const source = texts.get(item.id);
    if (!source) throw Error(`Missing dataset text for ${item.id}`);
    const gold = new Map((item.expected_boundaries || []).map(x => [x.offset, x.choice]));
    const matched = new Set();
    for (const b of item.boundaries || []) {
      const label = gold.get(b.punctuationStart);
      if (!LABELS.includes(label)) continue;
      if (matched.has(b.punctuationStart)) throw Error(`Duplicate boundary in ${item.id}`);
      const a = b.candidates?.find(x => x.id === 'and')?.score;
      const but = b.candidates?.find(x => x.id === 'but')?.score;
      if (!isScore(a) || !isScore(but)) {
        unmatched.push({ id: item.id, offset: b.punctuationStart, reason: 'missing model scores' });
        continue;
      }
      if (source[b.punctuationStart] !== b.punctuation)
        throw Error(`Source text or offset mismatch: ${item.id} at ${b.punctuationStart}`);
      matched.add(b.punctuationStart);
      rows.push({ id: item.id, offset: b.punctuationStart,
        gold: label, and: a, but, keep: isScore(b.keepScore) ? b.keepScore : null,
        punctuation: b.punctuation, text: source });
    }
    for (const [offset, label] of gold)
      if (!matched.has(offset)) unmatched.push({ id: item.id, offset, label, reason: 'unmatched label' });
  }
  return { rows, unmatched };
}
function predictTwo(row, params) {
  return selectJoin([{ id: 'and', score: row.and }, { id: 'but', score: row.but }], params).choice;
}
function predictThree(row, params) {
  if (!isScore(row.keep)) throw Error(`Missing KEEP score for ${row.id}:${row.offset}`);
  // KEEP competes directly, with a tunable bias; ambiguous ties stay KEEP.
  const options = [
    { id: 'keep', score: row.keep + params.keepBias },
    { id: 'and', score: row.and },
    { id: 'but', score: row.but },
  ].sort((a, b) => b.score - a.score || LABELS.indexOf(a.id) - LABELS.indexOf(b.id));
  if (options[0].id === 'keep' || options[0].score - options[1].score < params.minMargin)
    return 'keep';
  return options[0].id;
}
function measure(rows, choose) {
  const matrix = Object.fromEntries(LABELS.map(g => [g, Object.fromEntries(LABELS.map(p => [p, 0]))]));
  let correct = 0;
  for (const r of rows) {
    const p = choose(r);
    if (!LABELS.includes(p)) throw Error('Unrecognised predicted choice: ' + p);
    matrix[r.gold][p]++;
    if (r.gold === p) correct++;
  }
  const byGold = Object.fromEntries(LABELS.map(g => [g, LABELS.reduce((n, p) => n + matrix[g][p], 0)]));
  const byPrediction = Object.fromEntries(LABELS.map(p => [p, LABELS.reduce((n, g) => n + matrix[g][p], 0)]));
  const recall = Object.fromEntries(LABELS.map(g => [g, byGold[g] ? matrix[g][g] / byGold[g] : null]));
  const precision = Object.fromEntries(LABELS.map(p => [p, byPrediction[p] ? matrix[p][p] / byPrediction[p] : null]));
  const valid = LABELS.filter(g => byGold[g]);
  return { cases: rows.length, correct, accuracy: rows.length ? correct / rows.length : null,
    balancedAccuracy: valid.length ? valid.reduce((sum, g) => sum + recall[g], 0) / valid.length : null,
    byGold, byPrediction, recall, precision, matrix };
}
function fitGrid(train, mode) {
  let best;
  const consider = (params, metric) => {
    // Tune on macro recall, then accuracy, then conservative tie-breaker.
    const objective = metric.balancedAccuracy ?? -1;
    if (!best || objective > best.objective + 1e-10 ||
      (Math.abs(objective - best.objective) < 1e-10 &&
        (metric.accuracy > best.metric.accuracy + 1e-10 ||
          (Math.abs(metric.accuracy - best.metric.accuracy) < 1e-10 &&
            params.minMargin > best.params.minMargin))))
      best = { params, metric, objective };
  };
  if (mode === 'two') {
    for (let s = -6; s <= -1 + 1e-9; s += .25)
      for (let m = 0; m <= 20; m++) {
        const params = { minScore: Number(s.toFixed(2)), minMargin: Number((m * .05).toFixed(2)) };
        consider(params, measure(train, r => predictTwo(r, params)));
      }
  } else {
    for (let b = -20; b <= 20; b++)
      for (let m = 0; m <= 20; m++) {
        const params = { keepBias: Number((b * .1).toFixed(2)), minMargin: Number((m * .05).toFixed(2)) };
        consider(params, measure(train, r => predictThree(r, params)));
      }
  }
  return best;
}
function contextSnippet(row) {
  const a = Math.max(0, row.offset - 90), b = Math.min(row.text.length, row.offset + 91);
  return (a ? '…' : '') + row.text.slice(a, row.offset) + '⟦' + row.punctuation + '⟧' +
    row.text.slice(row.offset + row.punctuation.length, b) + (b < row.text.length ? '…' : '');
}
function errorDetails(rows, choose) {
  return rows.flatMap(row => {
    const predicted = choose(row);
    return predicted === row.gold ? [] : [{
      id: row.id, offset: row.offset, gold: row.gold, predicted,
      scores: { and: row.and, but: row.but, keep: row.keep },
      snippet: contextSnippet(row),
    }];
  });
}
function crossValidate(rows, folds, seed, mode) {
  const uniqueIDs = shuffle([...new Set(rows.map(x => x.id))], seed);
  if (uniqueIDs.length < folds) throw Error('Not enough distinct cases for number of folds');
  const idsByFold = Array.from({ length: folds }, () => new Set());
  uniqueIDs.forEach((id, i) => idsByFold[i % folds].add(id));
  const all = [], perFold = [];
  for (let i = 0; i < folds; i++) {
    const test = rows.filter(row => idsByFold[i].has(row.id));
    const train = rows.filter(row => !idsByFold[i].has(row.id));
    const fit = fitGrid(train, mode);
    const choose = r => mode === 'two' ? predictTwo(r, fit.params) : predictThree(r, fit.params);
    const metric = measure(test, choose);
    perFold.push({ fold: i + 1, trainCases: new Set(train.map(r => r.id)).size,
      testCases: idsByFold[i].size, trainBoundaries: train.length,
      testBoundaries: test.length, thresholds: fit.params,
      train: { accuracy: fit.metric.accuracy, balancedAccuracy: fit.metric.balancedAccuracy },
      holdout: { accuracy: metric.accuracy, balancedAccuracy: metric.balancedAccuracy } });
    all.push(...test.map(r => ({ ...r, fold: i + 1, predicted: choose(r) })));
  }
  if (all.length !== rows.length) throw Error('Cross-validation omitted rows');
  const combined = measure(all, r => r.predicted);
  const errors = errorDetails(all, r => r.predicted);
  return { mode, folds: perFold, combined, errors,
    predictions: all.map(r => ({ id: r.id, offset: r.offset, fold: r.fold, gold: r.gold, predicted: r.predicted })) };
}
async function scoreKeepCandidates(predictions, dataset) {
  const pending = predictions.some(item => (item.boundaries || []).some(b =>
    (item.expected_boundaries || []).some(g => g.offset === b.punctuationStart) &&
    !isScore(b.keepScore)));
  if (!pending) { console.log('All labelled KEEP scores already cached; no model loaded.'); return; }
  const { extractBoundaryProbes, buildBoundaryChoices } =
    await import('../extension/src/reader-boundary-scorer.mjs');
  const { createBoundaryLanguageScorer } = await import('../extension/src/reader-language-model.mjs');
  const scorer = await createBoundaryLanguageScorer({ onStatus: msg => console.log(msg) });
  let scored = 0, reused = 0, unscorable = 0;
  for (const item of predictions) {
    const source = dataset.get(item.id);
    if (!source) throw Error(`Cannot find text for ${item.id}`);
    const needed = new Map((item.boundaries || []).filter(b =>
      (item.expected_boundaries || []).some(g => g.offset === b.punctuationStart))
      .map(b => [b.punctuationStart, b]));
    const probes = extractBoundaryProbes(source, { maxPairs: 8 });
    for (const p of probes) {
      const b = needed.get(p.punctuationStart);
      if (!b) continue;
      if (isScore(b.keepScore)) { reused++; continue; }
      const choices = buildBoundaryChoices(source, p);
      if (choices.length !== 2 || !choices[0].prefix) { unscorable++; continue; }
      const originalRight = source.slice(p.punctuationEnd, Math.min(source.length, p.punctuationEnd + 95)).trim();
      const originalPunctuation = source.slice(p.punctuationStart, p.punctuationEnd);
      const score = await scorer(choices[0].prefix, originalPunctuation + ' ' + originalRight);
      if (isScore(score)) { b.keepScore = score; scored++; }
      else unscorable++;
    }
    if ((scored + reused) && (scored + reused) % 20 < needed.size)
      console.log(`KEEP scores processed: ${scored} new, ${reused} cached`);
  }
  console.log(`KEEP scores: ${scored} new, ${reused} reused, ${unscorable} unavailable`);
}
function printMatrix(m) {
  console.log('  gold \\ predicted        keep   and   but');
  for (const g of LABELS) {
    const row = m.matrix[g];
    console.log(`  ${g.padEnd(22)}${String(row.keep).padStart(4)}${String(row.and).padStart(6)}${String(row.but).padStart(6)}  recall=${pct(m.recall[g])}`);
  }
  console.log(`  Accuracy ${pct(m.accuracy)}; macro recall ${pct(m.balancedAccuracy)} (class-balanced)`);
}
function printCV(cv, maxErrors) {
  console.log(`\n${cv.mode === 'two' ? 'TWO scores: AND/BUT + KEEP fallback' : 'THREE scores: KEEP/AND/BUT'} — ${cv.folds.length}-fold CV`);
  for (const f of cv.folds)
    console.log(`  Fold ${f.fold}: ${f.testCases} unseen cases, ${f.testBoundaries} boundaries, ` +
      `accuracy ${pct(f.holdout.accuracy)}, balanced ${pct(f.holdout.balancedAccuracy)}, ` +
      `parameters ${JSON.stringify(f.thresholds)}`);
  console.log('  Combined held-out predictions (each boundary appears once):');
  printMatrix(cv.combined);
  console.log(`  Errors: ${cv.errors.length}`);
  for (const x of cv.errors.slice(0, maxErrors))
    console.log(`    ${x.id} @${x.offset}: gold=${x.gold}, predicted=${x.predicted} ` +
      `scores=${JSON.stringify(x.scores)}\n      ${x.snippet}`);
  if (cv.errors.length > maxErrors) console.log(`    … ${cv.errors.length - maxErrors} more in JSON output`);
}
async function main() {
  const o = parseArgs(process.argv.slice(2));
  const input = JSON.parse(await readFile(o.scores, 'utf8'));
  const predictions = Array.isArray(input) ? input : input.predictions;
  if (!Array.isArray(predictions) || !predictions.length)
    throw Error('Saved --scores file needs a nonempty predictions array. Run fit-reader-join-thresholds.mjs first.');
  const data = JSON.parse(await readFile(o.dataset, 'utf8'));
  const cases = Array.isArray(data) ? data : data.cases;
  if (!Array.isArray(cases)) throw Error('Invalid --dataset JSON');
  const texts = new Map(cases.map(x => [x.id, x.text]));
  if (o.scoreKeep) {
    console.log('Scoring original punctuation as a third model candidate (only uncached boundaries)…');
    await scoreKeepCandidates(predictions, texts);
  }
  const { rows, unmatched } = extractRows(predictions, texts);
  if (rows.length < o.folds * 2 || new Set(rows.map(r => r.id)).size < o.folds)
    throw Error('Not enough scored and labelled examples for cross-validation');
  console.log(`Read ${predictions.length} cases, ${rows.length} scored labelled boundaries; ` +
    `${unmatched.length} missing labels/scores; seed=${o.seed}`);
  if (unmatched.length) console.warn('WARNING: Unmatched labels in output JSON');
  const two = crossValidate(rows, o.folds, o.seed, 'two');
  printCV(two, o.maxErrors);
  const defaults = measure(rows, r => predictTwo(r, DEFAULT_JOIN_THRESHOLDS));
  const keepBaseline = measure(rows, () => 'keep');
  console.log('\nBaselines across the same examples:');
  console.log(`  Default thresholds: accuracy ${pct(defaults.accuracy)}, balanced ${pct(defaults.balancedAccuracy)}`);
  console.log(`  Always KEEP:        accuracy ${pct(keepBaseline.accuracy)}, balanced ${pct(keepBaseline.balancedAccuracy)}`);
  const hasKeep = rows.every(r => isScore(r.keep));
  const three = hasKeep ? crossValidate(rows, o.folds, o.seed, 'three') : null;
  if (three) printCV(three, o.maxErrors);
  else console.log('\nThree-score CV skipped: rerun with --score-keep to score original punctuation.');
  const summary = {
    description: 'Five-fold case-separated CV. Every reported CV prediction is held out of its fold\'s threshold fitting.',
    caveat: 'Gold choices are developer-authored; NOT human-reader accuracy. Tiny folds have high variance.',
    sourceScores: o.scores, sourceDataset: o.dataset, seed: o.seed,
    caseCount: new Set(rows.map(r => r.id)).size, boundaryCount: rows.length,
    unmatched, twoScore: two, threeScore: three,
    baselines: { defaults, alwaysKeep: keepBaseline },
    predictions, // Keep model score cache so reruns require no inference.
  };
  await mkdir(path.dirname(o.output), { recursive: true });
  await writeFile(o.output, JSON.stringify(summary, null, 2) + '\n');
  console.log(`\nSaved full confusion matrices, errors and scores: ${o.output}`);
  console.log('Production thresholds have NOT changed.');
}
main().catch(error => { console.error(error?.stack || error); process.exitCode = 1; });