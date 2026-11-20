// Evidence-scope and certainty escalation. These rules only evaluate whether
// the SPECIFIC premises supplied logically justify the asserted conclusion.
// They cannot establish the factual truth of either statement or author intent.
//
// Fixed regexes, bounded input and exact subject/scope matching. No user text
// is compiled or executed as code; no NLI threshold is relaxed.
const INFERENCE=/\b(?:therefore|hence|thus|consequently|accordingly|as a result|so|it follows|this means|that means|this proves|that proves|guarantees|demonstrates)\b/i;
const QUOTE=/["“”‘’]/;
const CLAIM_HEDGE=/\b(?:may|might|could|perhaps|possibly|probably|potentially|likely|should|ought|seems?|appears?|suggests?|if|unless|provided that|assuming)\b/i;
const SOURCE_HEDGE=/\b(?:may|might|could|perhaps|possibly|probably|allegedly|reportedly|estimated|approximately|roughly|if|unless|assuming|except)\b/i;
const STRONG_SUPPORT=/\b(?:nationally representative|representative national|nationwide survey|national census|full population|independent causal|controlled causal|validated predictive|randomi[sz]ed|peer.reviewed|certified for all|all subsequent events|every later event|complete accessibility assessment|comprehensive accessibility testing|modelled national results|modeled national results)\b/i;
function exactOneStatement(s){
 return s.split(/[.!?]+(?:\s+|$)/).map(x=>x.trim()).filter(Boolean).length===1;
}
function safe(p,c,marker){
 return typeof p==='string'&&typeof c==='string'&&p.trim().length>0&&c.trim().length>0&&
  p.length<=1200&&c.length<=340&&INFERENCE.test(marker)&&!QUOTE.test(p+c)&&
  !CLAIM_HEDGE.test(c)&&!SOURCE_HEDGE.test(p)&&!STRONG_SUPPORT.test(p)&&
  exactOneStatement(p);
}
function same(a,b){return String(a).trim().toLowerCase()===String(b).trim().toLowerCase();}
function singular(w){
 const s=w.toLowerCase();
 if(s==='buses')return 'bus';
 if(s.endsWith('ies')&&s.length>4)return s.slice(0,-3)+'y';
 if(s.endsWith('ches')||s.endsWith('shes')||s.endsWith('sses'))return s.slice(0,-2);
 return s.endsWith('s')&&!s.endsWith('ss')&&s.length>3?s.slice(0,-1):s;
}
function sameGroup(a,b){
 const tokens=s=>s.toLowerCase().split(/\s+/).filter(Boolean).map(singular).join(' ');
 return tokens(a)===tokens(b);
}
function gap(reason,obligation,observed,anchors){
 return {label:'unsupported_conclusion',reason,obligation,observed,
  evidenceType:'bounded_scope_or_claim_strength_mismatch',anchors};
}
const LOCAL_PERCENT=/\b(?:one|a single|a local|one particular)\s+(?:[a-z-]+\s+){0,3}(?:neighbou?rhood|village|town|branch|district|school|clinic|site|ward)\s+(?:recorded|reported|observed|measured|saw)\s+(?:a|an)\s+(\d+(?:\.\d+)?)\s*(?:percent|%)\s+(rise|increase|fall|decrease|drop)\s+in\s+([a-z-]+(?:\s+[a-z-]+){0,3})\b/i;
const NATIONAL_PERCENT=/\b(?:the\s+)?(?:national|nationwide|countrywide|regional|statewide)\s+(?:rate|figure|total|level)\s+of\s+([a-z-]+(?:\s+[a-z-]+){0,3})\s+has\s+(risen|increased|fallen|decreased|dropped)\s+by\s+(?:exactly|precisely)\s+(\d+(?:\.\d+)?)\s*(?:percent|%)\b/i;
function direction(s){return /^(?:rise|increase|risen|increased)$/.test(s)?'up':'down';}
function localToPopulation(p,c){
 const m=LOCAL_PERCENT.exec(p),g=NATIONAL_PERCENT.exec(c);
 if(!m||!g||!sameGroup(m[3],g[1])||direction(m[2])!==direction(g[2]))return null;
 const observed=Number(m[1]),claimed=Number(g[3]);
 if(!Number.isFinite(observed)||!Number.isFinite(claimed)||observed<0||claimed<0)return null;
 // Even an identical local percentage cannot prove a national aggregate.
 return gap('single_local_measurement_to_population_statistic',
  'nationally_representative_measurement','single_local_percent',
  {metric:m[3],localPercent:observed,claimedPopulationPercent:claimed});
}
const PRELIMINARY=/\b(?:first|initial|early|small|preliminary|limited|pilot)\b.{0,100}\b(?:pilot|trial|test|simulation|preview|survey|experiment|study)\b.{0,110}\b(?:encouraging|promising|positive|favourable|favorable|preliminary|early|suggestive)\b/i;
const FINAL_ABSOLUTE=/\b(?:completed|final|finished|full.scale|production|future)\s+(?:project|trial|study|test|programme|program|version|product)\b.{0,95}\bwill\b.{0,95}\b(?:without exception|every|all|zero failures|perfect|never|always|guaranteed)\b/i;
function preliminaryToGuarantee(p,c){
 if(!PRELIMINARY.test(p)||!FINAL_ABSOLUTE.test(c))return null;
 return gap('preliminary_observation_to_unqualified_final_guarantee',
  'completed_robust_results_or_stated_deterministic_rule',
  'positive_early_stage_observation',{claimStrength:'absolute_final'});
}
const SIMPLE_FEATURE=/\bthe\s+([a-z-]+(?:\s+(?!(?:now|recently|already)\b)[a-z-]+){0,2})\s+(?:now\s+)?(?:includes?|uses?|features?|has|added|introduced|installed)\s+(?:a|an|the)?\s*([a-z-]+(?:\s+[a-z-]+){0,5})\s*$/i;
const FEATURE_CHANGE=/\b(?:new|extra|revised|replacement|colour.coded|color.coded|improved|upgraded|larger|smaller|clearer|higher|wider|simpler|accessible|redesigned|menu|icons?|buttons?|labels?|font|contrast|type|navigation|sign|handle|checklist|light)\b/i;
const ZERO_RISK=/\bthe\s+([a-z-]+(?:\s+(?!(?:will|never|cannot)\b)[a-z-]+){0,2})\s+(?:will\s+)?(?:never|cannot|can't)\s+(?:cause|experience|suffer|have)\s+(?:an?\s+)?(?:accident|failure|injury|risk|problem|outage)\b.{0,65}\b(?:under any circumstances|ever|again|at all|in any situation)\b/i;
const UNIVERSAL_ACCESS=/\b(?:every|all)\s+(?:person|people|user|users)\s+with\s+(?:any|every|a)\s+disabilit(?:y|ies)\s+can\s+use\s+every\s+(?:feature|function|service)\s+of\s+(?:the\s+)?([a-z-]+(?:\s+[a-z-]+){0,2})\s+independently\b/i;
function singleFeatureToAbsoluteOutcome(p,c){
 const source=SIMPLE_FEATURE.exec(p);
 if(!source||!FEATURE_CHANGE.test(source[2])||/\b(?:all|every|guaranteed|verified|certified|tested)\b/i.test(p))return null;
 const risk=ZERO_RISK.exec(c),access=UNIVERSAL_ACCESS.exec(c);
 if(risk&&same(source[1],risk[1]))
  return gap('isolated_feature_to_no_future_risk',
   'evidence_for_all_risk_paths','one_feature_or_local_change',{subject:source[1],kind:'zero_risk'});
 if(access&&same(source[1],access[1]))
  return gap('isolated_feature_to_universal_accessibility',
   'complete_accessibility_evidence','one_interface_change',{subject:source[1],kind:'all_users_and_features'});
 return null;
}
const PAST_SELLOUT=/\b(?:all\s+tickets\s+(?:sold|were\s+sold|sold\s+out)|every\s+ticket\s+(?:sold|was\s+sold))\s+for\s+(?:one|a\s+single)\s+([a-z-]+(?:\s+[a-z-]+){0,3})\s+last\s+(?:week|month|year)\b/i;
const GUARANTEED_NEXT=/\b(?:the\s+)?next\s+(\d{1,4})\s+([a-z-]+(?:\s+[a-z-]+){0,3})\s+(?:are|will\s+be)\s+(?:certain|guaranteed|sure)\s+to\s+sell\s+out(?:\s+completely)?\b/i;
function oneEventToAllFuture(p,c){
 const source=PAST_SELLOUT.exec(p),claim=GUARANTEED_NEXT.exec(c);
 if(!source||!claim||!sameGroup(source[1],claim[2]))return null;
 const futureCount=Number(claim[1]);
 if(!Number.isSafeInteger(futureCount)||futureCount<1)return null;
 return gap('one_sold_out_event_to_guaranteed_future_series',
  'evidence_about_each_future_event_or_causal_rule',
  'one_past_sold_out_event',{event:source[1],futureCount});
}
const LOCAL_REPAIR=/\bthe\s+([a-z-]+(?:\s+[a-z-]+){0,2})\s+(?:council|authority|company|charity|school|organisation|organization)\s+(?:restored|opened|built|installed|repaired|replaced|introduced|renovated|upgraded)\s+(?:the\s+)?(?:old\s+|new\s+|local\s+)?([a-z-]+(?:\s+[a-z-]+){0,3})\b/i;
const MACRO_EFFECT=/\b(?:regional|national|nationwide|countrywide|countywide)\s+(?:unemployment|employment|inflation|poverty|tax\s+revenue|economic\s+growth)\s+will\s+(?:fall|rise|grow|drop|increase|decrease)\s+by\s+(?:exactly|precisely)\s+(\d+(?:\.\d+)?)\s*(?:percent|%)\b.{0,85}\bbecause\s+of\s+(?:that|this|the)\s+(?:restoration|renovation|project|action|change|improvement|installation|repair)\b/i;
function interventionToExactMacroForecast(p,c){
 const source=LOCAL_REPAIR.exec(p),claim=MACRO_EFFECT.exec(c);
 if(!source||!claim||!Number.isFinite(Number(claim[1])))return null;
 return gap('local_intervention_to_exact_macro_causal_prediction',
  'macro_outcome_measurement_and_causal_basis',
  'single_local_physical_action',{location:source[1],intervention:source[2],claimedPercent:Number(claim[1])});
}
export function inferScopeCertaintyGap(premise,conclusion,{inferenceMarker=''}={}){
 if(!safe(premise,conclusion,inferenceMarker))return null;
 const p=premise.trim(),c=conclusion.trim();
 return localToPopulation(p,c)||
  preliminaryToGuarantee(p,c)||
  singleFeatureToAbsoluteOutcome(p,c)||
  oneEventToAllFuture(p,c)||
  interventionToExactMacroForecast(p,c);
}
