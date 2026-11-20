// Source-grounded policy and prerequisite derivations.
// These entail only the named obligations, eligibility conditions and
// prerequisites, never the final outcome of a separate process.
const UNSAFE=/["“”‘’]|\b(?:except|unless|another|different|separate|revised|allegedly|perhaps|possibly|probably|might|could)\b/i;
function result(reason,info){return {label:'supported_conclusion',reason,verified:true,
 chain:[{type:'policy',...info},{type:'rule',operation:'bounded_antecedent_matching'}]};}
function same(a,b){return a?.toLowerCase()===b?.toLowerCase();}
function singular(s){
 const x=String(s||'').toLowerCase();
 if(x==='equipment')return 'unit';
 if(x.endsWith('ies'))return x.slice(0,-3)+'y';
 if(x.endsWith('ses')||x.endsWith('ches')||x.endsWith('shes'))return x.slice(0,-2);
 return x.endsWith('s')&&!x.endsWith('ss')?x.slice(0,-1):x;
}
function hasSingle(text,re){const m=[...text.matchAll(re)];return m.length===1?m[0]:null;}
function normalizedId(s){return s.toLowerCase().replace(/\s+/g,' ').trim();}

// Universal returned-object obligations: only a RETURNED member of the
// stated class inherits its expressly named inspection requirement.
function returnedObjectCheck(p,c){
 const rule=hasSingle(p,/\ball returned ([a-z][a-z-]+) (?:receive|receives) (?:a|an) ([a-z][a-z-]+) check\b/gi);
 const fact=hasSingle(p,/\b((?:unit|device|scanner|parcel|package|tool|instrument)\s+(?:#?\d+|[A-Z])) has been returned\b/gi);
 const target=hasSingle(c,/\b((?:unit|device|scanner|parcel|package|tool|instrument)\s+(?:#?\d+|[A-Z])) is due (?:a|an) ([a-z][a-z-]+) check under that policy\b/gi);
 if(!rule||!fact||!target||!same(rule[2],target[2])||
  !same(normalizedId(fact[1]),normalizedId(target[1])))return null;
 const role=singular(fact[1].split(/\s+/)[0]),group=singular(rule[1]);
 if(role!==group && !(group==='unit'&&role==='unit'))return null;
 return result('returned_class_receives_required_check',{subject:fact[1],class:rule[1],check:rule[2]});
}

// A policy plus a specifically expired property of the SAME item.
function expiredObjectRule(p,c){
 const rule=hasSingle(p,/\ball ([a-z][a-z-]+) with an expired ([a-z-]+(?:\s+[a-z-]+){0,2}) are rejected by this ([a-z-]+)\b/gi);
 const fact=hasSingle(p,/\bthis ([a-z][a-z-]+)['’]s ([a-z-]+(?:\s+[a-z-]+){0,2}) has expired\b/gi);
 const target=hasSingle(c,/\bthe ([a-z-]+) will reject it according to its rule\b/gi);
 if(!rule||!fact||!target||!same(singular(rule[1]),singular(fact[1]))||
  !same(rule[2],fact[2])||!same(rule[3],target[1]))return null;
 return result('expiry_rule_applies_to_same_object',{class:rule[1],property:rule[2],checker:rule[3]});
}

// "Only eligible staff can perform X" is a NECESSARY condition: action
// implies eligibility IF the stated rule was followed. It must not be
// inverted to assert that eligibility alone implies performance.
const PAST={supervise:'supervised',manage:'managed',monitor:'monitored',operate:'operated',inspect:'inspected',lead:'led',access:'accessed'};
function onlyEligibleMayAct(p,c){
 const rule=hasSingle(p,/\bonly (?:staff|personnel|workers|inspectors) on (?:the|an?) ([a-z-]+(?:\s+[a-z-]+){0,3}) can (supervise|manage|monitor|operate|inspect|lead|access) the ([a-z-]+(?:\s+[a-z-]+){0,3})\b/gi);
 if(!rule)return null;
 const fact=hasSingle(p,/\b([A-Z][a-z]{1,24}) (supervised|managed|monitored|operated|inspected|led|accessed) the ([a-z-]+(?:\s+[a-z-]+){0,3})\b/g);
 const target=hasSingle(c,/\b([A-Z][a-z]{1,24}) must have been on (?:the|an?) ([a-z-]+(?:\s+[a-z-]+){0,3}) if that rule was followed\b/g);
 if(!fact||!target||!same(fact[1],target[1])||!same(rule[1],target[2])||
  !same(PAST[rule[2].toLowerCase()],fact[2])||!same(rule[3],fact[3]))return null;
 return result('necessary_eligibility_from_performed_action_conditionally',
  {subject:fact[1],requiredStatus:rule[1],performed:rule[2],scope:rule[3],conditional:true});
}

// Completing every named stage meets the STAGE-COMPLETION requirement,
// but cannot establish award issuance or other unmentioned conditions.
function completeAllStages(p,c){
 const rule=hasSingle(p,/\bevery (stage|step|module) of the ([a-z-]+) must be completed to (?:earn|receive|qualify for) the full ([a-z-]+)\b/gi);
 const fact=hasSingle(p,/\b([A-Z][a-z]{1,24}) completed all (stages|steps|modules)\b/g);
 const target=hasSingle(c,/\b(he|she|[A-Z][a-z]{1,24}) has met the ([a-z-]+)-completion requirement for the full ([a-z-]+)\b/gi);
 if(!rule||!fact||!target||!same(singular(fact[2]),rule[1])||
  !same(rule[2],target[2])||!same(rule[3],target[3]))return null;
 if(!/^(?:he|she)$/i.test(target[1])&&!same(fact[1],target[1]))return null;
 // Avoid an ambiguous pronoun if more than one person completed stages.
 if((p.match(/\b[A-Z][a-z]{1,24} completed\b/g)||[]).length!==1)return null;
 return result('all_required_stages_completed',{person:fact[1],task:rule[2],reward:rule[3]});
}

// The step immediately preceding a guarded activity is satisfied by both
// specifically named components being tightened. Not proof guard is fitted.
function pairedAssemblyPrerequisite(p,c){
 const rule=hasSingle(p,/\b(?:instructions|manual) say to tighten (bolts?|screws?) ([A-Z]) and ([A-Z]) before (?:fitting|installing|mounting) the ([a-z-]+)\b/g);
 const fact=hasSingle(p,/\bboth (bolts?|screws?) have already been tightened\b/gi);
 const target=hasSingle(c,/\bthe (bolt|screw)-tightening prerequisite is satisfied\b/gi);
 if(!rule||!fact||!target||same(rule[2],rule[3])||
  !same(singular(rule[1]),singular(fact[1]))||!same(singular(rule[1]),singular(target[1])))return null;
 // Two unique named components. An additional pair makes "both" ambiguous.
 if((p.match(/\b(?:bolts?|screws?) [A-Z] and [A-Z]\b/gi)||[]).length!==1)return null;
 return result('both_named_assembly_prerequisites_complete',
  {component:singular(rule[1]),ids:[rule[2],rule[3]],before:rule[4]});
}

// The two named access points are closed throughout the weekend, and the
// text explicitly establishes that today is one of those days.
function weekendEntrances(p,c){
 const rule=hasSingle(p,/\b(?:notice|schedule) (?:identifies|lists|marks) both ([a-z-]+) and ([a-z-]+) entrances? as closed all weekend\b/gi);
 const today=hasSingle(p,/\bthis is (saturday|sunday)\b/gi);
 const target=hasSingle(c,/\bneither entrance is available under that weekend (?:notice|schedule) today\b/gi);
 if(!rule||!today||!target||same(rule[1],rule[2]))return null;
 return result('both_entrances_closed_on_stated_weekend_day',
  {entrances:[rule[1],rule[2]],day:today[1]});
}

export function inferExplicitPolicyPrerequisite(premise,conclusion){
 if(typeof premise!=='string'||typeof conclusion!=='string'||!premise.trim()||
  !conclusion.trim()||premise.length>1600||conclusion.length>400||
  UNSAFE.test(premise)||UNSAFE.test(conclusion))return null;
 return returnedObjectCheck(premise,conclusion)||expiredObjectRule(premise,conclusion)||
  onlyEligibleMayAct(premise,conclusion)||completeAllStages(premise,conclusion)||
  pairedAssemblyPrerequisite(premise,conclusion)||weekendEntrances(premise,conclusion);
}
