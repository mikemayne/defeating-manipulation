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
const CERTAINTY=/\b(?:most popular|safest|best in|certain to win|sure to win|guaranteed to win|definitely win|will inevitably win|no (?:privacy|security|health|safety)(?:\s+or\s+(?:privacy|security|health|safety))?\s+risks?|cannot possibly|guaranteed|nothing can|every|all)\b/i;
const FORECAST=/\b(?:published|posted|announced|released|unveiled|launched|introduced|adopted)\b.{0,70}\b(?:plan|strategy|proposal|policy|forecast|announcement)\b/i;
const COMPLETED=/\b(?:all|every|zero|entire|whole|permanently|eliminated|eradicated|ended|solved|prevented|cannot possibly|guaranteed|never)\b/i;
// A bounded, concrete intervention cannot, by itself, establish a
// universal or permanent outcome. This deliberately excludes rules,
// exhaustive premises and contingent conclusions via the main gates below.
// Publishing, attending or announcing information is excluded: such texts may
// contain actual evidence that must be assessed on its own terms.
const LOCAL_INTERVENTION=/\b(?:added|installed|replaced|redesigned|repainted|changed|introduced|purchased|bought|launched|started|began|opened|planted|removed|offered|hired|updated|repaired|upgraded)\b/i;
const STRONG_UNIVERSAL=/\b(?:every|everyone|everybody|all|always|never|nobody|no one|nothing|permanently|entire|entirely|guaranteed|without exception)\b/i;
const QUOTED_LABEL=/\b(?:used the words|used the phrase|wrote the words|claimed in (?:an?|the) (?:advert|advertisement|marketing)|labelled itself)\b/i;
// A bounded charitable distribution is not a measurement establishing
// complete eradication of a broader social condition.
const LIMITED_DISTRIBUTION=/\b(?:donated|distributed|supplied|handed\s+out|gave\s+away)\b.{0,100}\b(?:\d[\d,.]*|one|two|three|four|five|ten|twenty|fifty|hundred|thousand)\b/i;
const ENDED_SYSTEMIC_CONDITION=/\b(?:has|have|had)\s+(?:now\s+)?(?:completely\s+)?(?:ended|eradicated|eliminated|solved)\b.{0,85}\b(?:poverty|homelessness|hunger|food\s+insecurity)\b/i;
const OUTCOME_MEASURED=/\b(?:measured|verified|independently\s+tested|population\s+census|independent\s+study)\b/i;
// A planned amenity does not demonstrate universal future uptake of
// a residential development. Demand and the presence of a feature differ.
const HOUSING_AMENITY=/\b(?:housing|residential)\s+(?:plan|proposal|scheme|development)\b.{0,90}\b(?:includes?|features?|offers?|contains?|has)\b/i;
const EVERYONE_MOVES=/\b(?:all|every)\s+(?:families|family|households|household|residents|resident)\b.{0,95}\b(?:will|must|are\s+guaranteed\s+to)\s+(?:move|relocate|buy|rent)\b.{0,85}\b(?:development|housing|home|homes|estate|properties|property)\b/i;
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
 if(!p||!c||isHedged(c)||CONDITIONAL.test(c)||UNIVERSAL_PREMISE.test(p)||
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
 // The scale of a one-off intervention does not logically determine an
 // unrestricted, permanent or universal outcome. Record a specific scope
 // overclaim rather than equating a neutral NLI score with unsupportedness.
 if(LOCAL_INTERVENTION.test(p)&&STRONG_UNIVERSAL.test(c)&&
    !/\b(?:every|everyone|everybody|all|always|never|nobody|no one|nothing|permanently|entire|guaranteed)\b/i.test(p)&&
    !/\b(?:if|provided|only|necessarily|entails|logically)\b/i.test(p))
  return {label:"unsupported_conclusion",reason:"local_intervention_to_universal_outcome"};
 // A finite giveaway cannot itself prove a social condition has ended.
 // Do not infer the mismatch if the premise reports direct outcome evidence.
 if(LIMITED_DISTRIBUTION.test(p)&&ENDED_SYSTEMIC_CONDITION.test(c)&&
    !OUTCOME_MEASURED.test(p))
  return {label:"unsupported_conclusion",
   reason:"limited_donation_to_claimed_systemic_eradication"};
 // A feature included in proposed housing cannot imply that every
 // household will move there, without separately stated uptake evidence.
 if(HOUSING_AMENITY.test(p)&&EVERYONE_MOVES.test(c)&&
    !OUTCOME_MEASURED.test(p))
  return {label:"unsupported_conclusion",
   reason:"planned_amenity_to_universal_future_adoption"};
 // First wins do not *guarantee* the rest of a season.
 if(/\b(?:first|opening|initial)\s+(?:game|match|contest|trial)\b/i.test(p)&&
    /\b(?:won|success|succeeded|passed)\b/i.test(p)&&
    /\b(?:win|champion|victory|succeed|pass)\b/i.test(c)&&
    (/\b(?:will|must|certain|definitely|guaranteed)\b/i.test(c)||
     /\bguarantee/i.test(inferenceMarker)))
  return {label:"unsupported_conclusion",reason:"initial_success_to_guaranteed_future_result"};
 return null;
}
