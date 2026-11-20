// Conservative one-paragraph scope checks. These identify explicit leaps
// from limited observations to unqualified claims; they do NOT determine
// whether a statement is factually true or whether its author acted in bad faith.
const HEDGE=/\b(?:might|may|could|possibly|perhaps|potentially|apparently|seems|appears|suggests)\b/i;
const UNIVERSAL_PREMISE=/\b(?:all|every|each|any|none|nobody|nothing|no one|never|always|the only|only if|whenever|provided that|must|guaranteed|necessarily|without exception|sole|exclusively|entire|whole|permanently)\b/i;
const CONDITIONAL=/\b(?:if|whenever|provided that|unless|only when|assuming that)\b/i;
const LIMITED_OBSERVATIONS=/\b(?:a single|a lone|only one|one|two|three|four|five|six|seven|eight|nine|ten|first match|first game|one occasion)\b/i;
const VAGUE_SAMPLE=/\b(?:a few|few|several|some|a handful of|a couple of)\s+([a-z][a-z-]{2,})\b/i;
const UNIVERSAL_RESULT=/\b(?:all|every|everyone|everybody|nobody|nothing|never|always|none|entire|whole|everywhere|permanently|entirely|no longer)\b/i;
const GLOBAL_ZERO=/\b(?:across (?:the )?(?:whole |entire )?(?:country|region|city|district|town)|nationwide|regionwide|citywide|everywhere|all)\b.{0,85}\bzero\b|\bzero\b.{0,85}\b(?:across (?:the )?(?:country|region|city|district|town)|nationwide|regionwide|citywide|everywhere)\b/i;
const FINITE_RESULT=/\b(?:all of (?:them|those|these)|every one of (?:them|those|these)|every (?:one of )?(?:the|these|those) (?:sampled|tested|inspected|observed|interviewed)|every (?:surveyed|sampled|tested|inspected|observed|interviewed)|all (?:surveyed|sampled|tested|inspected|observed|interviewed)|only (?:the|those|these) (?:two|three|four|five))\b/i;
const TIME_SAMPLE=/\b(?:on (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|at \d{1,2}(?::\d\d)?\s*(?:a\.?m\.?|p\.?m\.?))\b/i;
const PROXY=/\b(?:shares?|followers?|likes?|views?|downloads?|five.star|star ratings?|customer reviews?|online reviews?|social.media engagement)\b/i;
const CERTAINTY=/\b(?:most popular|safest|best in|certain to win|sure to win|guaranteed to win|definitely win|will inevitably win|no (?:privacy|security|health|safety)(?:\\s+or\\s+(?:privacy|security|health|safety))?\\s+risks?|cannot possibly|guaranteed|nothing can|every|all)\b/i;
const FORECAST=/\b(?:published|posted|announced|released|unveiled|launched|introduced|adopted)\b.{0,70}\b(?:plan|strategy|proposal|policy|forecast|announcement)\b/i;
const COMPLETED=/\b(?:all|every|zero|entire|whole|permanently|eliminated|eradicated|ended|solved|prevented|cannot possibly|guaranteed|never)\b/i;
const QUOTED_LABEL=/\b(?:used the words|used the phrase|wrote the words|claimed in (?:an?|the) (?:advert|advertisement|marketing)|labelled itself)\b/i;
function isHedged(text){
 // "in May" is a calendar month, not the epistemic modal "may".
 // "cannot possibly" is emphatic certainty, not a hedge.
 const clean=text.replace(/\b(?:in|during|by|before|until)\s+May\b/g,"")
  .replace(/\bcannot possibly\b/gi,"").replace(/\bcan't possibly\b/gi,"");
 return HEDGE.test(clean);
}
/** Return an explicit narrow overreach or null (abstention). */
export function observableOverreach(premise, conclusion, {inferenceMarker=""}={}){
 if(typeof premise!=="string"||typeof conclusion!=="string")return null;
 const p=premise.trim(),c=conclusion.trim();
 if(!p||!c||isHedged(c)||UNIVERSAL_PREMISE.test(p)||
    /\bonly\s+(?:one|two|three|four|five|six|seven|eight|nine|ten)\b/i.test(p)||
    CONDITIONAL.test(p)||FINITE_RESULT.test(c))return null;
 // A small sample or time-limited observation is not an unqualified result
 // for everybody, all cases, every place or all future times.
 const vague=VAGUE_SAMPLE.exec(p);
 // A vague count of unrelated 'options', 'ideas' or similar items does
 // not establish which *population* the conclusion quantifies. Require a
 // shared category before treating vague quantifiers as a sampling leap.
 const matchedCategory=vague?.[1]?.toLowerCase().replace(/s$/,"");
 const sameCategory=matchedCategory &&
   new RegExp("\\b"+matchedCategory+"(?:s|es)?\\b","i").test(c);
 const limited=LIMITED_OBSERVATIONS.test(p)||Boolean(sameCategory)||
    (TIME_SAMPLE.test(p)&&/\b(?:arrived|observed|reported|saw|found|recorded|showed)\b/i.test(p));
 if(limited&&(UNIVERSAL_RESULT.test(c)||GLOBAL_ZERO.test(c)))
  return {label:"unsupported_conclusion",reason:"limited_observation_to_universal_claim"};
 // Proxy popularity and usage metrics cannot alone settle a different
 // nationwide ranking, safety status or guaranteed future outcome.
 if(PROXY.test(p)&&CERTAINTY.test(c)&&
    !/\b(?:ranking|independently tested|certified|risk assessment|nationwide (?:survey|census))\b/i.test(p))
  return {label:"unsupported_conclusion",reason:"proxy_measurement_to_certain_outcome"};
 // A plan being published is distinct from its goals having been achieved.
 if(FORECAST.test(p)&&COMPLETED.test(c))
  return {label:"unsupported_conclusion",reason:"plan_or_forecast_as_completed_outcome"};
 // Advertising wording is not itself proof of a universal physical property.
 if(QUOTED_LABEL.test(p)&&(UNIVERSAL_RESULT.test(c)||GLOBAL_ZERO.test(c)))
  return {label:"unsupported_conclusion",reason:"quoted_label_to_universal_property"};
 // First wins do not *guarantee* the rest of a season.
 if(/\b(?:first|opening|initial)\s+(?:game|match|contest|trial)\b/i.test(p)&&
    /\b(?:won|success|succeeded|passed)\b/i.test(p)&&
    /\b(?:win|champion|victory|succeed|pass)\b/i.test(c)&&
    (/\b(?:will|must|certain|definitely|guaranteed)\b/i.test(c)||
     /\bguarantee/i.test(inferenceMarker)))
  return {label:"unsupported_conclusion",reason:"initial_success_to_guaranteed_future_result"};
 return null;
}
