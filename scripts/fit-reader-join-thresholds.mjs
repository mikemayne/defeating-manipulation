#!/usr/bin/env node
/**
 * Fit the existing reader-join minScore / minMargin thresholds with a small
 * labelled corpus and the real local causal LM. No labels are inferred from
 * model guesses: gold choices come from expected_boundaries in the dataset.
 *
 * Copy this file to scripts/fit-reader-join-thresholds.mjs in the
 * defeating-manipulation repository. Run from the repo root:
 *
 *   node scripts/fit-reader-join-thresholds.mjs --preview
 *   node scripts/fit-reader-join-thresholds.mjs --cases 40
 *   node scripts/fit-reader-join-thresholds.mjs --cases 54
 *   node scripts/fit-reader-join-thresholds.mjs --scores evaluation/reader-join-fit.json
 *
 * Dependencies for real scoring are in extension/package.json:
 *   cd extension && npm install && cd ..
 *
 * Training uses the repository's existing fitJoinThresholds: it searches a
 * finite grid on TRAIN scores, then reports performance on a case-level
 * HOLDOUT. The dataset supplied by the repository has developer-authored
 * labels; reported accuracy is NOT independent human-reader accuracy.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaults = {
  dataset: path.join(root, 'evaluation/reader-strategy-synthetic-reference.json'),
  output: path.join(root, 'evaluation/reader-join-fit.json'),
  cases: 40,
  seed: 20261121,
  maxPairs: 8,
  preview: false,
  scores: null,
};

function usage() {
  console.log(`Usage: node scripts/fit-reader-join-thresholds.mjs [options]

  --cases N         Number of labelled examples (default: 40; max: dataset size)
  --seed N          Reproducible sample seed (default: 20261121)
  --max-pairs N     Max punctuation boundaries per example (1..8, default: 8)
  --dataset PATH    JSON with { cases: [{id,text,expected_boundaries:[{offset,choice}]}] }
  --output PATH     Save scores and fitted result (default: evaluation/reader-join-fit.json)
  --scores PATH     Refit saved scores without running the language model
  --preview         Check sample size, label counts, and boundary extraction; no model
  --help            Show this help

Requires: cd extension && npm install (once, before a real scoring run).
Fitting uses existing minScore/minMargin search and a held-out case split.
`);
}

function parseArgs(argv) {
  const opts = { ...defaults };
  const names = new Map([
    ['--cases', ['cases', 'int']],
    ['--seed', ['seed', 'int']],
    ['--max-pairs', ['maxPairs', 'int']],
    ['--dataset', ['dataset', 'path']],
    ['--output', ['output', 'path']],
    ['--scores', ['scores', 'path']],
  ]);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') { usage(); process.exit(0); }
    if (arg === '--preview') { opts.preview = true; continue; }
    const option = names.get(arg);
    if (!option || ++i >= argv.length) throw Error(`Unknown or incomplete option: ${arg}`);
    const [key, kind] = option;
    const v = argv[i];
    if (kind === 'int') {
      const n = Number(v);
      if (!Number.isSafeInteger(n)) throw Error(`${arg} must be an integer`);
      opts[key] = n;
    } else {
      opts[key] = path.resolve(process.cwd(), v);
    }
  }
  if (opts.cases < 1 || opts.cases > 10000) throw Error('--cases must be 1..10000');
  if (opts.maxPairs < 1 || opts.maxPairs > 8) throw Error('--max-pairs must be 1..8');
  if (opts.preview && opts.scores) throw Error('Use --preview with a dataset, not --scores');
  return opts;
}

function seededShuffle(values, seed) {
  // Fixed unsigned 32-bit PRNG; deterministic sampling, no global randomness.
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let n = state;
    n = Math.imul(n ^ (n >>> 15), n | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
  const arr = values.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function labelCounts(rows) {
  const counts = { keep: 0, and: 0, but: 0 };
  for (const row of rows)
    for (const x of row.expected_boundaries ?? [])
      if (Object.hasOwn(counts, x.choice)) counts[x.choice]++;
  return counts;
}

function percentage(x) {
  return typeof x === 'number' ? `${(100 * x).toFixed(1)}%` : 'n/a';
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const { fitJoinThresholds, labelledJoinScores, DEFAULT_JOIN_THRESHOLDS } =
    await import('../extension/src/reader-join-thresholds.mjs');
  let predictions;
  let sourceInfo;
  let unmatchedLabels = [];

  if (o.scores) {
    const file = JSON.parse(await readFile(o.scores, 'utf8'));
    predictions = Array.isArray(file) ? file : file.predictions;
    if (!Array.isArray(predictions))
      throw Error('--scores JSON requires a predictions array');
    sourceInfo = { kind: 'cached-scores', file: o.scores };
  } else {
    const parsed = JSON.parse(await readFile(o.dataset, 'utf8'));
    const original = Array.isArray(parsed) ? parsed : parsed.cases;
    if (!Array.isArray(original) || !original.length)
      throw Error('Dataset must be an array or contain a nonempty cases array');
    const { validateStrategyCases } =
      await import('../extension/src/reader-strategy-comparison.mjs');
    validateStrategyCases(original);
    const subset = seededShuffle(original, o.seed).slice(0, Math.min(o.cases, original.length));
    const { extractBoundaryProbes, rankBoundaryChoices } =
      await import('../extension/src/reader-boundary-scorer.mjs');
    const boundaryCounts = { expected: 0, matched: 0, missing: 0 };
    const planned = [];
    for (const item of subset) {
      const probes = extractBoundaryProbes(item.text, { maxPairs: o.maxPairs });
      const offsets = new Set(probes.map(p => p.punctuationStart));
      for (const g of item.expected_boundaries ?? []) {
        boundaryCounts.expected++;
        if (offsets.has(g.offset)) boundaryCounts.matched++;
        else { boundaryCounts.missing++; unmatchedLabels.push({ id: item.id, offset: g.offset, choice: g.choice }); }
      }
      planned.push({ id: item.id, boundaries: probes.length, matchedLabels: (item.expected_boundaries ?? []).filter(g => offsets.has(g.offset)).length });
    }
    console.log(`Dataset: ${o.dataset}`);
    console.log(`Sample: ${subset.length}/${original.length} cases (seed=${o.seed})`);
    console.log(`Reference labels: ${JSON.stringify(labelCounts(subset))}`);
    console.log(`Detected: ${boundaryCounts.matched}/${boundaryCounts.expected} labelled boundaries; ${boundaryCounts.missing} unmatched.`);
    if (boundaryCounts.missing) console.warn('WARNING: Some reference offsets cannot be extracted; see saved unmatchedLabels.');
    if (o.preview) {
      console.log('\nPreview only: no language-model calls, no threshold fit.');
      console.log(JSON.stringify(planned, null, 2));
      return;
    }
    const { createBoundaryLanguageScorer, BOUNDARY_LM } =
      await import('../extension/src/reader-language-model.mjs');
    console.log(`Loading ${BOUNDARY_LM}. Scores are generated once per candidate; fitting makes no extra model calls.`);
    const scorer = await createBoundaryLanguageScorer({ onStatus: message => console.log(message) });
    predictions = [];
    for (const [i, item] of subset.entries()) {
      const boundaries = await rankBoundaryChoices(item.text, scorer, { maxPairs: o.maxPairs });
      predictions.push({
        id: item.id,
        expected_boundaries: item.expected_boundaries ?? [],
        boundaries: boundaries.map(b => ({
          punctuationStart: b.punctuationStart,
          punctuation: b.punctuation,
          choice: b.choice,
          candidates: b.candidates.map(c => ({ id: c.id, score: c.score })),
        })),
      });
      if ((i + 1) % 5 === 0 || i + 1 === subset.length)
        console.log(`Scored ${i + 1}/${subset.length} cases`);
    }
    sourceInfo = {
      kind: 'scored-dataset',
      dataset: o.dataset,
      referenceDescription: parsed.meta?.description ?? null,
      sampledCases: subset.length,
      totalCases: original.length,
      seed: o.seed,
      model: BOUNDARY_LM,
      matchedReferenceBoundaries: boundaryCounts.matched,
      unmatchedReferenceBoundaries: boundaryCounts.missing,
    };
  }

  const labelled = labelledJoinScores(predictions);
  const fit = fitJoinThresholds(predictions);
  const outcome = {
    description: 'Automatic fitting of the existing punctuation join thresholds',
    warning: 'Dataset has developer-authored choices; not independently measured reader agreement.',
    source: sourceInfo,
    existingThresholds: DEFAULT_JOIN_THRESHOLDS,
    scoreRows: labelled.length,
    unmatchedLabels,
    fit,
    predictions, // Persist raw model scores: future re-fits need zero model calls.
  };
  await mkdir(path.dirname(o.output), { recursive: true });
  await writeFile(o.output, JSON.stringify(outcome, null, 2) + '\n', 'utf8');
  console.log(`\nSaved scores and results: ${o.output}`);
  if (!fit.available) {
    console.error(`Cannot fit: ${fit.reason} (${fit.labels} labels)`);
    process.exitCode = 2;
    return;
  }
  console.log(`Fitted thresholds: minScore=${fit.fitted.minScore}, minMargin=${fit.fitted.minMargin}`);
  console.log(`Training: ${fit.trainCases} cases, ${fit.train.cases} labelled boundaries; ` +
    `accuracy ${percentage(fit.train.accuracy)}, balanced ${percentage(fit.train.balancedAccuracy)}`);
  console.log(`Holdout:  ${fit.holdoutCases} cases, ${fit.holdout.cases} labelled boundaries; ` +
    `accuracy ${percentage(fit.holdout.accuracy)}, balanced ${percentage(fit.holdout.balancedAccuracy)}`);
  console.log(`Defaults on same holdout: accuracy ${percentage(fit.defaultHoldout.accuracy)}, ` +
    `balanced ${percentage(fit.defaultHoldout.balancedAccuracy)}`);
  const holdoutKeep = fit.holdout.byGold.keep ?? 0;
  console.log(`Always-KEEP on holdout: ${percentage(holdoutKeep / fit.holdout.cases)} accuracy`);
  console.log('No source file or production thresholds have been modified.');
}

main().catch(error => {
  console.error('Threshold fit failed:', error?.stack ?? error);
  process.exitCode = 1;
});