// A semantic embedding tells us that text resembles an example, not that it
// actually performs the rhetorical move. Require an observable mechanism for
// categories prone to matching neutral discussion of the same topic.
function sentences(text) {
 return text.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+/);
}

function isBandwagon(text) {
 const popular = /\b(?:everyone|everybody|everyone else|most people|most voters|the majority|millions of people|many people|nearly everyone|almost everyone|widely believed|widely accepted|popular)\b/i;
 const conclusion = /\b(?:so|therefore|thus|hence|which (?:proves?|shows?|means?))\b[^.!?]{0,120}\b(?:must|should|ought|have to|has to|true|correct|right|best|better|good|buy|follow|join|support|agree)\b/i;
 const reverse = /\b(?:must|should|ought|true|correct|right|best|better|good|buy|follow|join|support|agree)\b[^.!?]{0,100}\b(?:because|since)\b[^.!?]{0,100}/i;
 const parts = sentences(text);
 return parts.some((part, i) => {
  if (popular.test(part) && conclusion.test(part)) return true;
  // A clear inference can follow the popularity claim as a second sentence.
  if (popular.test(part) && i + 1 < parts.length &&
      /^(?:so|therefore|thus|hence|that (?:proves?|means?))\b/i.test(parts[i + 1]) &&
      /\b(?:must|should|ought|true|right|correct|best|better|good|buy|follow|join|support|agree)\b/i.test(parts[i + 1])) return true;
  if (popular.test(part) && reverse.test(part)) return true;
  return false;
 });
}

function isNarrativeReframing(text) {
 const medium = /\b(?:article|report|story|account|coverage|headline|narrative|news)\b/i;
 const ordering = /\b(?:begins?|starts?|opens?|focuses?|frames?|portrays?|describes?|presents?|recounts?|highlights?)\b/i;
 const omission = /\b(?:omits?|omitted|ignores?|ignored|excludes?|excluded|leaves? out|left out|hides?|conceals?)\b[^.!?]{0,130}\b(?:earlier|prior|preceding|previous|context|decision|events?|cause|details?|incident|circumstances?|reason|evidence|background|what led to|what happened)\b/i;
 return medium.test(text) && ordering.test(text) && omission.test(text);
}

export function hasSemanticEvidence(techniqueId, text) {
 switch (techniqueId) {
  case "bandwagon": return isBandwagon(text);
  case "narrative_reframing": return isNarrativeReframing(text);
  default: return true;
 }
}
