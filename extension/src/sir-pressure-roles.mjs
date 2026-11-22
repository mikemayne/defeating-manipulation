import { pressureFeatures, walkPressureTree } from "./sir-pressure-tree.mjs";

const dismissal = /\b(?:you(?:'re| are) (?:just |clearly )?(?:imagining|delusional|paranoid|overreacting)|you (?:imagined|misremember\w*|made it up|misunderstood)|your (?:memory|perception) (?:is|was) wrong|(?:all |just )?in your head|you (?:do not|don't) (?:know|understand|remember)|you (?:can't|cannot) (?:understand|remember))\b/i;
const refusal = /\b(?:if|unless) you\b/i;
const sanction = /\bi(?:'ll| will) (?:cancel|remove|report|dock|cut|expose|withdraw|fire|suspend|stop paying|take away)\b/i;
const adverse = /\byou(?:'ll| will| might| could) (?:lose|regret|suffer|pay|face|be fired)\b/i;

export function roleFeatures(structure) {
 const shared = pressureFeatures(structure);
 const fear = new Set(shared), doubt = new Set(shared);
 for (const paragraph of structure.paragraphs) {
  const direct = new Map();
  for (const sentence of paragraph.sentences) for (const clause of sentence.clauses) {
   if (clause.kinds.some(k => ["reported_speech","quotation","parenthetical"].includes(k))) continue;
   // An enclosing SIR clause can contain a nested quotation.
   const text = clause.text.replace(/[“"][^”"]*[”"]/g, "").replace(/’/g, "'");
   direct.set(clause.id, text);
   if (dismissal.test(text)) doubt.add("judgement/direct_dismissal");
   if (/\byou(?:'re| are| seem| think| believe| understand| remember| know)\b/i.test(text))
    doubt.add("judgement/listener_belief");
   if (/\b(?:records?|receipt|footage|transcript|evidence)\b/i.test(text))
    doubt.add("judgement/evidence_mentioned");
  }
  for (const edge of paragraph.edges.filter(e => e.type === "condition_consequence")) {
   const condition = direct.get(edge.from), outcome = direct.get(edge.to);
   if (!condition || !outcome || !refusal.test(condition)) continue;
   fear.add("consequence/listener_condition");
   if (sanction.test(outcome)) fear.add("consequence/speaker_penalty");
   if (adverse.test(outcome)) fear.add("consequence/listener_loss");
   if (/\bi(?:'ll| will| can) (?:help|send|find|show|explain)\b/i.test(outcome))
    fear.add("consequence/offered_help");
  }
 }
 return { fear, doubt };
}

export function assessRoles(features, model) {
 const fear = walkPressureTree(model.fear, features.fear);
 const doubt = walkPressureTree(model.doubt, features.doubt);
 const score = Math.max(fear.score, doubt.score);
 return { fear, doubt, score, flagged: score >= model.threshold };
}
