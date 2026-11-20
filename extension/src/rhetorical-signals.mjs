// Standalone rhetorical signal extraction and routing.
// This module does not load a model, run arbitrary expressions, or mutate the DOM.
// LLM output is untrusted data: validate exact source spans and allowlisted IDs.
// No model-proposed finding becomes an underline without independent confirmation.

const DEFINITIONS = [
  ['emotive_language', 'scrutiny', ['emotional_appeal', 'hidden_premise']],
  ['absolute_language', 'scrutiny', ['quantifier_scope']],
  ['certainty_claim', 'scrutiny', ['certainty_calibration']],
  ['causal_claim', 'scrutiny', ['causal_inference']],
  ['motive_attribution', 'scrutiny', ['attribution_evidence']],
  ['presupposition', 'scrutiny', ['hidden_premise']],
  ['vague_attribution', 'scrutiny', ['source_attribution']],
  ['loaded_question', 'scrutiny', ['hidden_premise', 'question_framing']],
  ['numerical_claim', 'scrutiny', ['typed_numerical_check']],
  ['binary_framing', 'scrutiny', ['false_dilemma_check']],
  ['scope_shift', 'context', ['quantifier_scope', 'cross_sentence_comparison']],
  ['definition_shift', 'context', ['cross_sentence_comparison']],
  ['repetition', 'context', ['repetition_in_context']],
  ['emotional_escalation', 'context', ['cross_sentence_comparison']],
  ['unusual_spelling', 'context', ['attention_hook_context']],
  ['dehumanization', 'direct', ['dehumanization_context']],
  ['reasoning_dismissal_by_insult', 'direct', ['ad_hominem_reasoning']]
];

export const RHETORICAL_SIGNAL_REGISTRY = Object.freeze(Object.fromEntries(
  DEFINITIONS.map(([id, route, checks]) =>
    [id, Object.freeze({ id, route, checks: Object.freeze(checks) })])
));

const own = (object, property) => Object.prototype.hasOwnProperty.call(object, property);
const MAX_TEXT_LENGTH = 100_000;
const MAX_MODEL_OUTPUT_LENGTH = 128_000;
const MAX_CANDIDATES = 128;
const MAX_FINDINGS = 64;
const MAX_SPAN_LENGTH = 320;

function modelFindings(raw) {
  if (typeof raw === 'string') {
    if (raw.length > MAX_MODEL_OUTPUT_LENGTH) return [];
    try { raw = JSON.parse(raw); } catch { return []; }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) ||
      !Array.isArray(raw.findings)) return [];
  return raw.findings.slice(0, MAX_CANDIDATES);
}

function validText(text) {
  return typeof text === 'string' && text.length <= MAX_TEXT_LENGTH;
}

function verifiedSpan(text, raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) ||
      typeof raw.signal_id !== 'string' ||
      !own(RHETORICAL_SIGNAL_REGISTRY, raw.signal_id) ||
      typeof raw.quote !== 'string' || !raw.quote.length ||
      !Number.isSafeInteger(raw.start) || !Number.isSafeInteger(raw.end) ||
      raw.start < 0 || raw.end <= raw.start || raw.end > text.length ||
      raw.end - raw.start > MAX_SPAN_LENGTH ||
      text.slice(raw.start, raw.end) !== raw.quote) return null;
  return {signal_id:raw.signal_id, start:raw.start, end:raw.end, quote:raw.quote};
}

/**
 * Accept data from an injected local model. confirmDirect is trusted application
 * logic (not something returned by the LLM); it must positively verify the
 * particular direct pattern before an underline is emitted.
 * Unknown IDs, fabricated quotes/offsets, and model-supplied actions are ignored.
 */
export function routeModelRhetoricalSignals(text, raw, {confirmDirect} = {}) {
  if (!validText(text)) return [];
  const findings = [], seen = new Set();
  for (const candidate of modelFindings(raw)) {
    if (findings.length >= MAX_FINDINGS) break;
    const hit = verifiedSpan(text, candidate);
    if (!hit) continue;
    const key = [hit.signal_id,hit.start,hit.end].join(':');
    if (seen.has(key)) continue;
    seen.add(key);
    const definition = RHETORICAL_SIGNAL_REGISTRY[hit.signal_id];
    let action = definition.route === 'context' ? 'context' : 'scrutiny';
    if (definition.route === 'direct' && typeof confirmDirect === 'function') {
      try {
        if (confirmDirect(Object.freeze({...hit}), text) === true) action = 'underline';
      } catch { /* A failed verifier must abstain, not underline. */ }
    }
    findings.push({...hit, action, checks:[...definition.checks], source:'model'});
  }
  return findings.sort((a,b) => a.start-b.start || a.end-b.end);
}

// High-specificity *explicit phrasing only*: a named human group described as
// vermin, parasites or cockroaches. This deliberately does NOT claim to detect
// all dehumanisation. In ambiguous cases the model can route for scrutiny.
// We do not infer intentions, and a quoted phrase remains a quote.
const HUMAN_TARGET = '(?:(?:these|those|the|some|all|many|most)\\s+)?(?:people|men|women|children|immigrants|refugees|voters|protesters|politicians|journalists|workers|citizens|activists)';
const DEHUMANISING_PREDICATE = '(vermin|parasites|cockroaches|subhumans?)';
const EXPLICIT_DEHUMANISATION = new RegExp(
  '\\b' + HUMAN_TARGET + '\\s+(?:are|were)\\s+(?:(?:all|just|nothing but)\\s+)?' + DEHUMANISING_PREDICATE + '\\b', 'gi');

export function findExplicitDehumanization(text) {
  if (!validText(text)) return [];
  const findings = [];
  for (const match of text.matchAll(EXPLICIT_DEHUMANISATION)) {
    const term = match[1];
    const start = match.index + match[0].length - term.length;
    const end = start + term.length;
    findings.push({ signal_id:'dehumanization', start, end,
      quote:text.slice(start,end), action:'underline', source:'explicit_rule',
      checks:[] });
    if (findings.length === MAX_FINDINGS) break;
  }
  return findings;
}

/** One result contains findings and deduplicated suggestions for further passes. */
export function inspectRhetoricalSignals(text, rawModelFindings = null, options = {}) {
  if (!validText(text)) return {findings:[], scrutinyChecks:[]};
  const found = [...findExplicitDehumanization(text),
    ...routeModelRhetoricalSignals(text, rawModelFindings, options)];
  const seen = new Set(), findings = [], checks = new Set();
  for (const item of found.sort((a,b) => a.start-b.start || a.end-b.end ||
    (a.source === 'explicit_rule' ? -1 : 1))) {
    const key = [item.signal_id,item.start,item.end].join(':');
    if (seen.has(key) || findings.length >= MAX_FINDINGS) continue;
    seen.add(key);
    findings.push(item);
    if (item.action !== 'underline') for (const check of item.checks) checks.add(check);
  }
  return {findings, scrutinyChecks:[...checks]};
}
