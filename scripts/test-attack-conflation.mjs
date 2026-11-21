import assert from 'node:assert/strict';
import fs from 'node:fs';
import {compilePatternRules, matchText} from '../extension/src/matching-core.mjs';
import {hasSemanticEvidence} from '../extension/src/semantic-evidence.mjs';

const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const root = read('techniques.json');
const catalogue = read('extension/techniques.json');
const patterns = read('extension/patterns.json');
const id = 'attack_conflation';
for (const items of [root.techniques, catalogue.techniques]) {
 const technique = items.find(item => item.id === id);
 assert.ok(technique, 'Catalogue contains attack conflation');
 assert.equal(technique.category, 'Argumentation');
 assert.ok(technique.observable_features.length >= 4);
 assert.ok(technique.examples.length >= 4);
}
assert.ok(patterns.patterns.some(p => p.id === id), 'Local rule coverage exists');
const compiled = compilePatternRules(catalogue, patterns);
const positives = [
  "You made one spelling mistake, so your argument is nonsense and you're clearly an idiot.",
  "You corrected my grammar, so you must think my idea is stupid and I'm stupid too.",
  "That typo proves your argument is worthless.",
  "You criticised my wording, so you're attacking everyone who supports the proposal.",
  "The critic questioned my opinion, so apparently they're insulting all of us."
];
const negatives = [
  "You made a spelling mistake in the heading.",
  "You corrected my typo. Thanks, I'll fix it.",
  "You corrected the grammar, so the argument is easier to understand.",
  "Correcting a typo does not mean the idea is stupid.",
  "I disagree with the proposal because its figures are incomplete.",
  "Someone criticised the argument, and we discussed their objection calmly."
];
for (const value of positives) {
 assert.equal(hasSemanticEvidence(id, value), true, 'Semantic evidence: '+value);
 const matches = await matchText(value, {techniques:catalogue.techniques, rules:compiled});
 assert.ok(matches.some(x => x.technique.id === id), 'Recognise attack transfer: '+value);
}
for (const value of negatives) {
 assert.equal(hasSemanticEvidence(id, value), false, 'Reject semantic false positive: '+value);
 const matches = await matchText(value, {techniques:catalogue.techniques, rules:compiled});
 assert.ok(!matches.some(x => x.technique.id === id), 'Do not flag ordinary correction: '+value);
}
console.log('Attack conflation: '+positives.length+' positives and '+negatives.length+' hard negatives passed.');
