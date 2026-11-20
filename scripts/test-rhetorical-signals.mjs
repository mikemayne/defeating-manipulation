import assert from 'node:assert/strict';
import {
  RHETORICAL_SIGNAL_REGISTRY, findExplicitDehumanization,
  routeModelRhetoricalSignals, inspectRhetoricalSignals
} from '../extension/src/rhetorical-signals.mjs';

const highlight = text => findExplicitDehumanization(text).map(f => text.slice(f.start,f.end));
assert.deepEqual(highlight('Those people are vermin.'), ['vermin']);
assert.deepEqual(highlight('The protesters were nothing but cockroaches.'), ['cockroaches']);
assert.deepEqual(highlight('Some workers are parasites.'), ['parasites']);
assert.deepEqual(highlight('He is a twat.'), [], 'Ordinary insult is not dehumanisation');
assert.deepEqual(highlight('He is a twat, therefore his argument is wrong.'), [],
  'The reasoning issue belongs to a separate checker, not a swear-word rule');
assert.deepEqual(highlight('The lab studies parasites in rats.'), [],
  'Literal animal/pest terminology is not dehumanisation');
assert.deepEqual(highlight('People are not vermin.'), [],
  'Negated dehumanisation must not be underlined');
assert.deepEqual(highlight('We should never call those people vermin.'), [],
  'Criticising a dehumanising phrase is not itself a rule match');
assert.deepEqual(highlight('These people are smart.'), [],
  'Ordinary group description should not be marked');

const text = 'These heartless politicians are destroying everything.';
const quote = 'heartless';
const start = text.indexOf(quote);
const raw = {findings:[{signal_id:'emotive_language',start,end:start+quote.length,quote,
  action:'underline', code:'alert(1)', explanation:'<img src=x onerror=alert(1)>'}]};
const routed = routeModelRhetoricalSignals(text, raw);
assert.equal(routed.length, 1);
assert.equal(routed[0].action, 'scrutiny', 'Model-supplied actions are never trusted');
assert.deepEqual(routed[0].checks, ['emotional_appeal','hidden_premise']);
assert.equal(Object.hasOwn(routed[0], 'code'), false,
 'Extraneous attacker-controlled fields must be discarded');
assert.equal(Object.hasOwn(routed[0], 'explanation'), false,
 'Untrusted HTML and model claims must not pass to the UI');
assert.deepEqual(routeModelRhetoricalSignals(text, {findings:[
  {...raw.findings[0], quote:'fabricated'},
  {...raw.findings[0], start:-1},
  {...raw.findings[0], end:text.length+1},
  {...raw.findings[0], signal_id:'__proto__'},
  {...raw.findings[0], signal_id:'made_up_signal'},
  {...raw.findings[0], start:0.5}
 ]}), [], 'Invalid coordinates, fabricated spans and IDs rejected');
assert.deepEqual(routeModelRhetoricalSignals(text,'not json'), []);
assert.deepEqual(routeModelRhetoricalSignals(text, '{}'), []);
assert.deepEqual(routeModelRhetoricalSignals(text, 'x'.repeat(128001)), []);
assert.deepEqual(routeModelRhetoricalSignals(text, {findings:[raw.findings[0],raw.findings[0]]}), routed,
 'Duplicate signals must not multiply findings');

const word = 'vermin';
const directText = 'Those people are vermin.';
const directModel = {findings:[{signal_id:'dehumanization',start:directText.indexOf(word),
  end:directText.indexOf(word)+word.length,quote:word}]};
assert.equal(routeModelRhetoricalSignals(directText,directModel)[0].action, 'scrutiny',
 'A direct-category label alone does not justify an underline');
assert.equal(routeModelRhetoricalSignals(directText,directModel,
 {confirmDirect:()=>true})[0].action,'underline',
 'Trusted independently verified direct patterns may be underlined');
assert.equal(routeModelRhetoricalSignals(directText,directModel,
 {confirmDirect:()=>{throw Error('failure')}})[0].action,'scrutiny',
 'Verifier failures must fail closed');

const all = inspectRhetoricalSignals(directText, directModel);
assert.equal(all.findings.length,1, 'Exact rule matching supersedes duplicate model hypotheses');
assert.equal(all.findings[0].action,'underline');
assert.equal(all.findings[0].source,'explicit_rule');
const mixed = inspectRhetoricalSignals(text,{findings:[
 raw.findings[0],
 {signal_id:'causal_claim',start:text.indexOf('destroying'),
  end:text.indexOf('destroying')+10,quote:'destroying'}
]});
assert.deepEqual(mixed.scrutinyChecks,
 ['emotional_appeal','hidden_premise','causal_inference']);
assert.equal(mixed.findings.every(f=>f.action!=='underline'),true);
assert.ok(Object.isFrozen(RHETORICAL_SIGNAL_REGISTRY.dehumanization));
assert.equal(inspectRhetoricalSignals(null).findings.length, 0);
console.log('Rhetorical signals: routing, underlining guards, offsets and untrusted-output tests passed.');
