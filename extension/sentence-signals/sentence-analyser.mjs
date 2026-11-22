import { parseSentence } from './grammar.mjs';

export const models = {
  emotion: 'SamLowe/roberta-base-go_emotions-onnx',
  clickbait: 'valurank/distilroberta-clickbait',
  toxicity: 'nicky48/toxic-bert-ONNX',
  syntax: 'compromise',
  spelling: 'nspell/en-GB',
  embedding: 'Xenova/all-MiniLM-L6-v2',
  inference: 'onnx-community/nli-deberta-v3-xsmall-ONNX',
};
const examples = [
  ['specified', 'Tomorrow you will receive a cake.'],
  ['specified', 'If you return, I will break your phone.'],
  ['specified', 'Your account will be closed on Monday.'],
  ['specified', 'I will call you this evening.'],
  ['underspecified', 'You have no idea what is coming.'],
  ['underspecified', 'You will find out what happens next.'],
  ['underspecified', 'I have a surprise in store for you.'],
  ['underspecified', 'You will pay for this.'],
  ['no_consequence', 'The meeting ended at noon.'],
  ['no_consequence', 'I know what you mean.'],
  ['no_consequence', 'The report is on the table.'],
  ['no_consequence', 'She likes the new design.'],
];
export function compareExamples(vector, referenceVectors) {
  return examples.map(([label, text], index) => ({
    label,
    text,
    similarity: vector.reduce((sum, value, dim) => sum + value * referenceVectors[index][dim], 0),
  })).sort((a, b) => b.similarity - a.similarity);
}

function describeText(text, explicitClause) {
  const words = text.replace(/[’‘]/g, "'").toLowerCase();
  const openEnding = [
    /\b(?:no idea|don't know|do not know|find out|wait and see|see)\s+(?:what(?:'s| is| will)|what happens|what comes)\b/,
    /\b(?:what(?:'s| is) coming|got something coming|something (?:is going to|will) happen|(?:a )?surprise in store)\b/,
    /\b(?:pay for (?:it|this|that)|regret (?:it|this|that)|won't know what hit you)\b/,
    /\b(?:no idea|don't know|do not know)\s+(?:who|whom)\s+you(?:'re| are)\s+(?:\w+\s+)?(?:dealing|messing|fucking)\s+with\b/,
  ].some(pattern => pattern.test(words));
  const timeAnchor = /\b(?:tomorrow|tonight|next week|later today|this evening)\b/.test(words);
  const reason = openEnding ? 'open_ended_wording' : explicitClause ? 'future_clause' : 'no_rule_matched';
  const status = openEnding ? (explicitClause && /\b(?:but|and then)\b/.test(words) ? 'review' : 'underspecified') :
    explicitClause && !text.trimEnd().endsWith('?') ? 'specified' : 'unclear';
  return { status, reason, timeAnchor };
}

function optionalText(value, name) {
  if (value == null) return '';
  if (typeof value !== 'string') throw new TypeError(name + ' must be text');
  return value.trim();
}

export function validate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Expected a JSON object');
  const sentence = optionalText(input.sentence, 'sentence');
  if (!sentence) throw new TypeError('sentence is required');
  return {
    sentence,
    context: optionalText(input.context, 'context'),
    takeaway: optionalText(input.takeaway, 'takeaway'),
    role: optionalText(input.role, 'role') || 'sentence',
  };
}

export function createAnalyser(engine, { spellchecker } = {}) {
  let referenceVectors;
  return async function analyse(input) {
    const { sentence, context, takeaway, role } = validate(input);
    referenceVectors ??= engine.embed(examples.map(([, text]) => text));
    const parsed = parseSentence(sentence, context, spellchecker);
    const premise = [parsed.contextText, parsed.analysisText].filter(Boolean).join(' ');
    const hypothesis = takeaway || 'The text states what specific action or event is expected to happen.';
    const [referenceEmbeddings, [vector], emotion, clickbait, toxicity, inference] = await Promise.all([
      referenceVectors,
      engine.embed([parsed.analysisText]),
      engine.emotion(parsed.analysisText),
      engine.clickbait(parsed.analysisText),
      engine.toxicity(parsed.analysisText),
      engine.inference(takeaway ? premise : parsed.analysisText, hypothesis),
    ]);
    return {
      sentence,
      models,
      consequence: describeText(parsed.analysisText, parsed.explicitClause),
      references: parsed.references,
      signals: {
        emotion,
        clickbait: { scope: role === 'headline' ? 'headline' : 'out_of_domain', scores: clickbait },
        toxicity,
        syntax: parsed.tokens,
        spelling: parsed.spelling,
        similarity: compareExamples(vector, referenceEmbeddings).slice(0, 4),
        inference: { purpose: takeaway ? 'takeaway' : 'consequence_probe', hypothesis, scores: inference },
      },
    };
  };
}
