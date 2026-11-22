import nlp from 'compromise';
import { preprocessText } from '../src/text-preprocessing.mjs';

const pronouns = new Set(['he', 'she', 'they', 'it']);
const nonSpecific = new Set(['be', 'happen', 'know', 'see', 'find', 'come', 'regret']);
const has = (term, tag) => term?.tags.includes(tag);

function taggedSentences(text) {
  let cursor = 0;
  return nlp(text).json().map(sentence => sentence.terms.flatMap(term => {
    if (!term.text.trim()) return [];
    const start = text.indexOf(term.text, cursor);
    if (start === -1) return [];
    cursor = start + term.text.length;
    return [{ text: term.text, lower: term.normal.toLowerCase(), tags: term.tags,
      start, end: cursor }];
  }));
}

function subjectCandidates(sentences, text) {
  return sentences.flatMap(terms => {
    const verb = terms.findIndex(term => has(term, 'Verb') && !has(term, 'Noun'));
    if (verb < 1) return [];
    return terms.slice(0, verb).flatMap((term, i) => {
      if (!has(term, 'Noun') || has(term, 'Pronoun') ||
          has(term, 'Date') || has(term, 'Time')) return [];
      const prior = terms[i - 1];
      const start = has(prior, 'Determiner') ? prior.start : term.start;
      return [{
        text: text.slice(start, term.end),
        person: has(term, 'Person'),
        plural: has(term, 'Plural') || /[^s]s$/i.test(term.lower),
      }];
    });
  });
}

// Narrow standard-English agreement cues. Keep dialect and quoted speech in mind.
const agreementRules = [
  /\b(?:you|we|they)\s+(?:was|is|has|doesn't|doesn’t)\b/gi,
  /\b(?:he|she|it)\s+(?:are|have|don't|don’t)\b/gi,
  /\bI\s+(?:is|are|has|does)\b/gi,
];

function grammarFlags(source) {
  return agreementRules.flatMap(rule => [...source.matchAll(rule)].map(match => ({
    kind: 'subject_verb_agreement',
    start: match.index,
    end: match.index + match[0].length,
    original: match[0],
    attentionSignal: true,
    reason: 'Possible nonstandard agreement and engagement cue',
  }))).sort((a, b) => a.start - b.start);
}

export function parseSentence(sentence, context, spellchecker) {
  const working = preprocessText(sentence, { spellchecker });
  const preceding = preprocessText(context, { spellchecker });
  const analysisText = working.analysisText;
  const sentences = taggedSentences(analysisText);
  const tokens = sentences.flat().map(({ text, tags, start, end }) => ({
    text,
    tags,
    start: working.characterOrigins[start].start,
    end: working.characterOrigins[end - 1].end,
  }));
  const candidates = subjectCandidates(taggedSentences(preceding.analysisText), preceding.analysisText);
  const references = sentences.flatMap(terms => terms.flatMap((term, i) => {
    if (!pronouns.has(term.lower) ||
        !['Verb', 'Modal', 'Auxiliary'].some(tag => has(terms[i + 1], tag))) return [];
    const earlier = subjectCandidates([terms.slice(0, i)], analysisText);
    const names = [...new Set([...candidates, ...earlier].filter(candidate => {
      if (term.lower === 'they') return candidate.plural || candidate.person;
      if (term.lower === 'it') return !candidate.plural && !candidate.person;
      return !candidate.plural;
    }).map(candidate => candidate.text))];
    const statuses = ['no_candidate_found', 'one_candidate', 'multiple_candidates'];
    return [{ pronoun: term.text, offset: working.characterOrigins[term.start].start,
      candidates: names, status: statuses[Math.min(2, names.length)] }];
  }));

  const expanded = analysisText.replace(/['’‘]ll\b/gi, ' will');
  const explicitClause = taggedSentences(expanded).some(terms => terms.some((term, i) => {
    if (!['will', 'shall'].includes(term.lower)) return false;
    const action = terms.slice(i + 1).find(next => !has(next, 'Adverb') && next.lower !== 'not');
    return has(action, 'Verb') && !nonSpecific.has(action.lower);
  }));
  const spelling = working.flags.filter(flag =>
    flag.kind === 'spelling_candidate' || flag.kind === 'nonstandard_vocabulary');
  return { analysisText, contextText: preceding.analysisText, tokens, references, explicitClause, spelling,
    grammar: grammarFlags(sentence) };
}
