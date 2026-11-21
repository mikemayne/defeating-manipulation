// Conservative, analysis-only discourse simplification for a small causal LM.
// These strings must NEVER replace the source text or its character offsets.
// The substitutions preserve broad relations, not every rhetorical nuance.
export const DISCOURSE_SIMPLIFIER_VERSION="discourse-v1";

// Only clause-initial markers with a clear role are rewritten. Ambiguous
// time/causal words such as since, as, while, then, so and otherwise stay intact.
const MARKERS=[
 ["on the other hand","but"],
 ["as a consequence","so"],
 ["for this reason","so"],
 ["as a result","so"],
 ["in contrast","but"],
 ["by contrast","but"],
 ["nevertheless","but"],
 ["nonetheless","but"],
 ["even so","but"],
 ["that said","but"],
 ["all the same","but"],
 ["however","but"],
 ["still","but"],
 ["and yet","but"],
 ["yet","but"],
 ["furthermore","and"],
 ["additionally","and"],
 ["in addition","and"],
 ["what's more","and"],
 ["moreover","and"],
 ["also","and"],
 ["consequently","so"],
 ["therefore","so"],
 ["thus","so"],
 ["hence","so"],
 ["subsequently","then"],
 ["afterwards","then"]
];
const escapeRegex=text=>text.replace(/[.*+?^$()|[\]{}\\]/g,"\\$&");
const rules=MARKERS.map(([phrase,short])=>{
 const marker=phrase.split(" ").map(escapeRegex).join("\\s+");
 const guard=phrase==="yet"?"(?!\\s+(?:to|another|more)\\b)":"";
 const separator=phrase==="yet"||phrase==="and yet"?"\\s*,?\\s+":",\\s+";
 return {phrase,short,
  re:new RegExp("(^|[.;!?]\\s+)"+marker+guard+separator,"gimu")};
});

// These longer expressions have direct short replacements without changing
// the sentence structure. No broad thesaurus substitutions are performed.
const PHRASES=[
 [/\bdue\s+to\s+the\s+fact\s+that\b/giu,"because"],
 [/\bowing\s+to\s+the\s+fact\s+that\b/giu,"because"],
 [/\bfor\s+the\s+reason\s+that\b/giu,"because"],
 [/\bdespite\s+the\s+fact\s+that\b/giu,"although"],
 [/\bin\s+spite\s+of\s+the\s+fact\s+that\b/giu,"although"],
 [/\bin\s+the\s+event\s+that\b/giu,"if"],
 [/\bin\s+order\s+to\b/giu,"to"]
];

export function simplifyDiscourseForModel(input){
 if(typeof input!=="string")throw new TypeError("Discourse input must be a string");
 let text=input;
 const changes=[];
 for(const [re,short] of PHRASES){
  text=text.replace(re,match=>{
   changes.push({original:match,normalised:short});
   return match[0]===match[0].toUpperCase()?
    short[0].toUpperCase()+short.slice(1):short;
  });
 }
 for(const {phrase,short,re} of rules){
  text=text.replace(re,(_match,prefix)=>{
   const atStart=prefix===""||prefix==="\n";
   changes.push({original:phrase,normalised:short});
   if(atStart)return prefix+short[0].toUpperCase()+short.slice(1)+" ";
   if(prefix[0]==="?"||prefix[0]==="!")
    return prefix+short[0].toUpperCase()+short.slice(1)+" ";
   // Two independent clauses remain grammatical after shortening the marker.
   return ", "+short+" ";
  });
 }
 return {text,changes};
}
