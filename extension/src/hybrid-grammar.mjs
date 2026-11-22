import winkNLP from "wink-nlp";
import english from "wink-eng-lite-web-model";

const nlp = winkNLP(english, ["sbd", "pos"]);
const { its } = nlp;

export const presuppositionRule = {
 id: "prior_activity_assumed",
 limit: "A direct statement or time/reason question uses 'stop' with an activity. This suggests prior activity without verifying it."
};

export const hasStopWording = text => /\bstop(?:s|ped|ping)?\b/i.test(text);
const nounPhraseTags = new Set(["DET", "ADJ", "NOUN", "PROPN", "PRON", "NUM"]);
const modifiers = new Set(["already", "finally", "recently", "just", "completely", "ever"]);

function hasDirectSubject(before, sentence) {
 const prefix = before.slice();
 const question = ["when", "why"].includes(prefix[0]?.word);
 if (question) prefix.shift();
 if (question !== sentence.trimEnd().endsWith("?") ||
     (question && !["do", "have"].includes(prefix[0]?.lemma))) return false;
 if (["do", "have"].includes(prefix[0]?.lemma) && prefix[0]?.pos === "AUX") prefix.shift();
 return prefix.some(token => ["NOUN", "PROPN", "PRON"].includes(token.pos)) &&
  prefix.every(token => nounPhraseTags.has(token.pos) ||
   (token.pos === "AUX" && token.lemma === "have") || modifiers.has(token.word));
}

export function findPriorActivities(passage, scope) {
 if (!hasStopWording(passage) || /["“”‘]/.test(passage)) return [];
 const evidence = [];
 let offset = 0;
 let aligned = true;
 // Token strings must map exactly and contiguously apart from whitespace.
 nlp.readDoc(passage).sentences().each(sentence => {
  const tokens = [];
  sentence.tokens().each(token => {
   if (!aligned) return;
   const value = token.out(its.value);
   if (!value.trim()) return;
   const start = offset + (passage.slice(offset).match(/^\s*/)?.[0].length ?? 0);
   if (passage.slice(start, start + value.length) !== value) {
    aligned = false;
    return;
   }
   offset = start + value.length;
   tokens.push({ start, end: offset, word: value.toLowerCase(), lemma: token.out(its.lemma), pos: token.out(its.pos) });
  });
  if (!aligned || tokens.some(token => ["'", "not", "n't", "never", "whether", "if"].includes(token.word))) return;
  const stop = tokens.findIndex(token => token.lemma === "stop" && token.pos === "VERB");
  const activity = tokens[stop + 1];
  const afterActivity = tokens[stop + 2];
  if (stop <= 0 || !activity?.word.endsWith("ing") ||
      !(activity.pos === "VERB" || (["NOUN", "ADJ"].includes(activity.pos) && afterActivity?.pos === "DET")) ||
      !hasDirectSubject(tokens.slice(0, stop), sentence.out())) return;

  let last = stop + 1;
  while (last + 1 < tokens.length && nounPhraseTags.has(tokens[last + 1].pos) &&
         !/^(?:today|yesterday|tomorrow|tonight)$/.test(tokens[last + 1].word)) last++;
  const start = tokens[0].start;
  const end = tokens[last].end;
  evidence.push({
   id: presuppositionRule.id, ruleId: "presupposition.stop_activity.v1",
   start: scope.start + start, end: scope.start + end, quote: passage.slice(start, end),
   limit: presuppositionRule.limit,
   activity: { start: scope.start + activity.start, end: scope.start + end,
    quote: passage.slice(activity.start, end) }
  });
 });
 return aligned ? evidence : [];
}
