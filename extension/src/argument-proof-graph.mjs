// Bounded, source-grounded premise/conclusion proof graph.
// The graph reports absent links as DIAGNOSTICS, never an automatic accusation.
// Each verified edge is a stated rule or a JS-calculated numeric relation.
import {inferNumericRelation,extractNumericalPropositions} from './argument-numeric.mjs';
import {inferTypedNumericRelation,extractTypedNumericalFacts} from './argument-numeric-relations.mjs';
import {inferQuantifierRelation,extractQuantifiedPropositions} from './argument-quantifiers.mjs';
import {inferNumericTemporalConstraint} from './argument-numeric-temporal.mjs';
import {inferSupportedDerivation} from './argument-supported-derivations.mjs';
import {inferExplicitPolicyPrerequisite} from './argument-policy-prerequisites.mjs';
import {inferGeneralisedPremiseProof} from './argument-generalised-proofs.mjs';
import {inferClosedScopeRelation} from './argument-closed-scope.mjs';
import {inferFiniteProof} from './argument-finite-proofs.mjs';

const MAX_NODES=40,MAX_DEPTH=3;
const QUOTE=/["“”]/;
const HEDGE=/\b(?:may|might|perhaps|probably|possibly|could|suggests?|seems?|apparently)\b/i;
const IDENT=/\b(?:another|other|different|separate)\b/i;
function normalize(s){return String(s||'').toLowerCase().replace(/[’]/g,"'")
 .replace(/^(?:therefore|thus|hence|consequently|as a result|so|it follows that|this means that)\b[, ]*/i,'')
 .replace(/^the\s+/,'').replace(/[.!?]+$/,'').replace(/\s+/g,' ').trim();}
function clauses(text){return String(text||'').split(/(?<=[.!?;])\s+(?=[A-Za-z])|;\s*/).map(x=>x.trim()).filter(Boolean);}
function safe(text){return typeof text==='string'&&text.length<=1600&&!QUOTE.test(text)&&!IDENT.test(text);}
function node(id,kind,text,extra={}){return{id,kind,text,...extra};}
function edge(from,to,rule){return {from,to,rule};}
function asRule(sentence){
 const m=/^if\s+(.{5,200}?),\s*(?:then\s+)?(.{5,200})[.]?$/i.exec(sentence.trim());
 if(m&&!HEDGE.test(m[1])&&!HEDGE.test(m[2]))return {condition:m[1],consequence:m[2].replace(/[.]$/,''),kind:'sufficient',source:sentence};
 // A necessary condition is not a sufficient one. Record it for backward
 // diagnosis, but do not infer the outcome merely from satisfying it.
 const n=/^(.{5,200}?)\s+only\s+if\s+(.{5,200})[.]?$/i.exec(sentence.trim());
 if(n&&!HEDGE.test(n[1])&&!HEDGE.test(n[2]))return {condition:n[2].replace(/[.]$/,''),consequence:n[1],kind:'necessary',source:sentence};
 return null;
}
// Return a literal negative of a simple affirmative copular proposition.
// No fuzzy synonym matching, nested negation, modals or implied identities.
function copularNegation(text){
 const s=normalize(text);
 if(HEDGE.test(s)||/\b(?:not|never|no|neither|nor|unless|except|only if)\b/i.test(s))return null;
 const m=/^(.{3,120}?)\s+(is|are|was|were)\s+(.{2,120})$/i.exec(s);
 if(!m||/\b(?:and|or|if|then|because)\b/i.test(m[1])||
    /\b(?:and|or|if|then|because)\b/i.test(m[3]))return null;
 return normalize(m[1]+' '+m[2]+' not '+m[3]);
}
function opposition(left,right){
 const a=normalize(left),b=normalize(right);
 const neg=(s)=>s.replace(/\b(?:not|never|no)\s+/g,'').replace(/\b(?:isn't|aren't|wasn't|weren't|doesn't|don't|didn't|cannot|can't|won't)\b/g,'');
 const n1=/\b(?:not|never|no|cannot|can't|won't|isn't|aren't|wasn't|weren't)\b/.test(a);
 const n2=/\b(?:not|never|no|cannot|can't|won't|isn't|aren't|wasn't|weren't)\b/.test(b);
 return n1!==n2 && neg(a)===neg(b);
}
/**
 * Build the proof graph from text, without asking the model to invent steps.
 * The graph contains all claims and explicit rules, plus up to three rounds
 * of mechanically matched forward deductions. Missing dependencies are
 * information for readers, NOT a proof that the conclusion is false.
 */
export function inspectArgumentProof(premise,conclusion){
 const p=String(premise||''),goal=String(conclusion||'');
 const graph={nodes:[],edges:[],status:'undetermined',verified:null,missingLinks:[],
  numericFacts:[],maxDepth:MAX_DEPTH};
 if(!p.trim()||!goal.trim()||!safe(p)||!safe(goal)||goal.length>400)return graph;
 const sentences=clauses(p).slice(0,12),rules=[];
 const entries=[];
 for(const s of sentences){
  if(graph.nodes.length>=MAX_NODES-2)break;
  const id='p'+graph.nodes.length,r=asRule(s);
  graph.nodes.push(node(id,r?'rule':'premise',s));
  if(r)rules.push({...r,id});else entries.push({text:s,id,depth:0});
 }
 const goalId='goal';graph.nodes.push(node(goalId,'goal',goal));
 // Numeric relations have priority over NLI confidence only when their exact
 // units, entity descriptions and temporal scopes have already matched.
 graph.numericFacts=[
  ...extractNumericalPropositions(p),
  ...extractTypedNumericalFacts(p),
  ...extractQuantifiedPropositions(p)
 ].slice(0,20);
 const numeric=inferNumericRelation(p,goal);
 const typed=inferTypedNumericRelation(p,goal);
 const quantified=inferQuantifierRelation(p,goal);
 const temporal=inferNumericTemporalConstraint(p,goal);
 const derived=inferSupportedDerivation(p,goal);
 const policy=inferExplicitPolicyPrerequisite(p,goal);
 const generalised=inferGeneralisedPremiseProof(p,goal);
 const closedScope=inferClosedScopeRelation(p,goal);
 const finite=inferFiniteProof(p,goal);
 // A disagreement between independent deterministic interpreters means a
 // malformed/ambiguous proposition or scope: do not pick a winner.
 const verifiedRelations=[numeric,typed,quantified,temporal,derived,policy,generalised,closedScope,finite].filter(Boolean);
 if(new Set(verifiedRelations.map(x=>x.label)).size>1){
  graph.missingLinks.push({type:'conflicting_proof_interpreters',
   statement:goal,neededFor:goal,certainty:'unverified'});
  return graph;
 }
 const verified=verifiedRelations[0]||null;
 if(verified){
  const id='d_verified';graph.nodes.push(node(id,'derived',verified.reason,{label:verified.label}));
  for(const n of graph.nodes.filter(x=>x.kind==='premise'))graph.edges.push(edge(n.id,id,'source_quantity'));
  graph.edges.push(edge(id,goalId,quantified&&!numeric&&!typed?
   'quantifier_rule':'javascript_checked_relation'));
  graph.verified={...verified,basis:quantified&&!numeric&&!typed?'quantifier':'numeric',graphNode:id};
  graph.status=verified.label==='supported_conclusion'?'proved':'contradicted';
  return graph;
 }
 // Generic conditional application. It relies on literal shared propositions,
 // not fuzzy topic overlap or unverified textual similarity.
 const visited=new Set(entries.map(x=>normalize(x.text)));
 const derivations=[];
 for(let depth=1;depth<=MAX_DEPTH;depth++){
  let added=0;
  for(const r of rules.filter(x=>x.kind==='sufficient')){
   const parent=entries.find(x=>normalize(x.text)===normalize(r.condition));
   if(!parent||parent.depth>=MAX_DEPTH)continue;
   const conclusionKey=normalize(r.consequence);
   if(visited.has(conclusionKey)||graph.nodes.length>=MAX_NODES-1)continue;
   const id='d'+derivations.length;
   graph.nodes.push(node(id,'derived',r.consequence,{rule:'modus_ponens',depth:parent.depth+1}));
   graph.edges.push(edge(parent.id,id,'antecedent'));
   graph.edges.push(edge(r.id,id,'conditional'));
   const item={id,text:r.consequence,depth:parent.depth+1};
   entries.push(item);derivations.push(item);visited.add(conclusionKey);added++;
  }
  if(!added)break;
 }
 const found=entries.find(x=>normalize(x.text)===normalize(goal));
 if(found){
  graph.edges.push(edge(found.id,goalId,'identical_proposition'));
  graph.status='proved';graph.verified={label:'supported_conclusion',reason:'bounded_conditional_chain',
   chain:graph.edges.filter(x=>x.to===found.id||x.to===goalId),basis:'graph'};
  return graph;
 }
 // Modus tollens: if P then Q; not Q; therefore not P.
 // Recognise only exact copular negations of BOTH Q and P. This never
 // licenses affirming the consequent or denying the antecedent.
 for(const r of rules.filter(x=>x.kind==='sufficient')){
  const notQ=copularNegation(r.consequence);
  const notP=copularNegation(r.condition);
  if(!notQ||!notP||normalize(goal)!==notP)continue;
  const contrary=entries.find(x=>normalize(x.text)===notQ);
  if(!contrary||graph.nodes.length>=MAX_NODES)continue;
  graph.edges.push(edge(contrary.id,goalId,'negated_consequent'));
  graph.edges.push(edge(r.id,goalId,'modus_tollens'));
  graph.status='proved';
  graph.verified={label:'supported_conclusion',reason:'bounded_modus_tollens',
   chain:[edge(contrary.id,goalId,'negated_consequent'),
    edge(r.id,goalId,'modus_tollens')],basis:'graph'};
  return graph;
 }
 // A direct and exact proposition negation can be shown as a verified
 // contradiction. Most natural-language opposites are NOT exact and abstain.
 const opposed=entries.find(x=>opposition(x.text,goal));
 if(opposed){
  graph.edges.push(edge(opposed.id,goalId,'explicit_negation'));
  graph.status='contradicted';graph.verified={label:'contradictory_claims',
   reason:'bounded_explicit_negation',chain:[edge(opposed.id,goalId,'explicit_negation')],basis:'graph'};
  return graph;
 }
 // Work backwards from the goal: for every stated rule that could derive it,
 // identify its unsatisfied antecedent. A 'necessary' rule can tell us which
 // prerequisite is missing but is never used to infer a positive conclusion.
 const goalKey=normalize(goal);
 for(const r of rules){
  const matches=normalize(r.consequence)===goalKey;
  if(!matches)continue;
  const present=entries.some(x=>normalize(x.text)===normalize(r.condition));
  if(!present)graph.missingLinks.push({type:'required_antecedent',
   statement:r.condition,neededFor:r.consequence,rule:r.source,certainty:'unverified'});
 }
 if(!graph.missingLinks.length&&graph.nodes.length<MAX_NODES)
  graph.missingLinks.push({type:'no_verified_derivation',statement:goal,
   neededFor:goal,certainty:'unverified'});
 return graph;
}