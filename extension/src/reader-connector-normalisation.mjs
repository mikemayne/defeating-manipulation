// High-precision sentence-initial discourse markers. These describe an explicit
// relationship, not whether replacing punctuation would improve the text.
// No inferred synonym substitutions, and no changes to the original source.
const RULES = Object.freeze([
 {marker:"and yet",choice:"but",relation:"contrast",re:/^and\s+yet(?:,\s*|\s+)/iu},
 {marker:"but",choice:"but",relation:"contrast",re:/^but(?:,\s*|\s+)/iu},
 {marker:"however",choice:"but",relation:"contrast",re:/^however,\s*/iu},
 {marker:"nevertheless",choice:"but",relation:"contrast",re:/^nevertheless,\s*/iu},
 {marker:"nonetheless",choice:"but",relation:"contrast",re:/^nonetheless,\s*/iu},
 {marker:"on the other hand",choice:"but",relation:"contrast",re:/^on\s+the\s+other\s+hand,\s*/iu},
 {marker:"still",choice:"but",relation:"contrast",re:/^still,\s*/iu},
 // 'Yet to arrive', 'yet another' and 'yet more' aren't contrastive joins.
 {marker:"yet",choice:"but",relation:"contrast",re:/^yet(?!\s+(?:to|another|more)\b)\s+/iu},
 {marker:"and",choice:"and",relation:"addition",re:/^and(?!\s+yet\b)(?:,\s*|\s+)/iu},
 {marker:"furthermore",choice:"and",relation:"addition",re:/^furthermore,\s*/iu},
 {marker:"moreover",choice:"and",relation:"addition",re:/^moreover,\s*/iu},
 {marker:"additionally",choice:"and",relation:"addition",re:/^additionally,\s*/iu},
 {marker:"in addition",choice:"and",relation:"addition",re:/^in\s+addition,\s*/iu},
 {marker:"also",choice:"and",relation:"addition",re:/^also,\s*/iu}
]);

// Match only at the start of the *right-hand* statement. Restrict the rule
// to a small closed vocabulary so e.g. 'however many' or 'still working'
// does not accidentally become a contrast decision.
export function leadingExplicitConnector(right) {
 if(typeof right!=="string")return null;
 const whitespace=/^\s*/u.exec(right)?.[0].length??0;
 const text=right.slice(whitespace);
 for(const rule of RULES){
  const match=rule.re.exec(text);
  if(!match || !text.slice(match[0].length).trim())continue;
  return {marker:rule.marker,choice:rule.choice,relation:rule.relation,
   start:whitespace,end:whitespace+match[0].length};
 }
 return null;
}

export function explicitBoundaryConnector(source,boundary) {
 if(typeof source!=="string"||!Number.isSafeInteger(boundary?.punctuationEnd)||
    boundary.punctuationEnd<0||boundary.punctuationEnd>=source.length)return null;
 // A marker after a boundary signals the relation even when the punctuation
 // is best kept. Offsets always refer to the untouched original source.
 const suffix=source.slice(boundary.punctuationEnd);
 const cue=leadingExplicitConnector(suffix);
 return cue?{...cue,start:cue.start+boundary.punctuationEnd,
  end:cue.end+boundary.punctuationEnd}:null;
}

export function normaliseConnectorCandidate(join,right){
 if(join!=="and"&&join!=="but")throw Error("Join must be 'and' or 'but'");
 if(typeof right!=="string")throw Error("Right-hand text must be a string");
 const cue=leadingExplicitConnector(right);
 // Only normalise this small, explicit vocabulary. Never rewrite other words.
 // A contrastive or additive marker is already present, so do not duplicate it.
 return {text:cue?right.slice(cue.end).trimStart():right,
  removedConnector:cue?.marker??null};
}
