const positives = sample => sample.reduce((sum, row) => sum + row.positive, 0);
const impurity = sample => {
 const p = positives(sample) / sample.length;
 return sample.length * 2 * p * (1 - p);
};
export function fit(sample, depth) {
 const leaf = { count: sample.length, positive: positives(sample) };
 if (!depth || leaf.positive === 0 || leaf.positive === leaf.count) return leaf;
 const candidates = [...new Set(sample.flatMap(row => [...row.features]))].sort();
 let best, loss = impurity(sample);
 for (const feature of candidates) {
  const yes = [], no = [];
  for (const row of sample) (row.features.has(feature) ? yes : no).push(row);
  if (Math.min(yes.length, no.length) < 10) continue;
  const splitLoss = impurity(yes) + impurity(no);
  if (splitLoss < loss - 1e-9) {
   best = { feature, yes, no };
   loss = splitLoss;
  }
 }
 return best ? { feature: best.feature, yes: fit(best.yes, depth - 1), no: fit(best.no, depth - 1) } : leaf;
}
export function score(sample, decide) {
 let tp = 0, fp = 0, tn = 0, fn = 0;
 for (const row of sample) {
  if (decide(row)) row.positive ? tp++ : fp++;
  else row.positive ? fn++ : tn++;
 }
 const ratio = (a, b) => b ? a / b : null;
 return { tp, fp, tn, fn, precision: ratio(tp, tp + fp), recall: ratio(tp, tp + fn),
  f1: ratio(2 * tp, 2 * tp + fp + fn), fpr: ratio(fp, fp + tn) };
}
