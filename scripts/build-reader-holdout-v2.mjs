#!/usr/bin/env node
/**
 * Frozen, authored synthetic challenge corpus v2.
 * 100 scenario families x 10 context/relationship variants = 1000 boundaries.
 * The v2 examples are held out from classifier fitting and were authored
 * after reviewing errors on the 300-item development set. This is a designed
 * stress test, NOT a sample of naturally occurring writing. The scenario
 * families are the independent grouping units, not the 1000 instances.
 *
 * Usage:
 *   node scripts/build-reader-holdout-v2.mjs
 *   node scripts/build-reader-holdout-v2.mjs --check
 */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const SEED_FILE=path.join(root,'evaluation/reader-holdout-v2-seeds.tsv');
const OUT_FILE=path.join(root,'evaluation/reader-holdout-v2.json');
export const VERSION='reader-holdout-v2';
// Same background and ending are available to each class, avoiding label
// hints arising just from the document framing.
const BACKGROUND={
 'public-policy':['The item was recorded in the published meeting notes.','A reporter had requested an update on the scheme.'],
 workplace:['The team discussed the matter during the morning call.','A colleague summarised the plan for the department.'],
 science:['The methods were described in the latest progress report.','The researchers reviewed the available evidence together.'],
 consumer:['The customer kept a copy of the original correspondence.','A local reviewer had been following the product launch.'],
 travel:['The details appeared in the information sent to visitors.','Several travellers compared their booking details.'],
 sport:['The club sent supporters a written update.','The staff discussed the plan ahead of the weekend.'],
 technology:['The change was listed in the published release notes.','The engineers opened a ticket to track the issue.'],
 education:['The proposal appeared in the term newsletter.','A parent asked staff for a progress update.'],
 nature:['The work was described in the conservation diary.','A volunteer checked the most recent field notes.'],
 arts:['The details were included in the published programme.','The organisers discussed the arrangements in a short meeting.']
};
const FOLLOWUP={
 'public-policy':['The next meeting was scheduled for the following month.','A copy of the correspondence was placed on the public record.'],
 workplace:['A revised update was sent around the team later.','The issue remained on the agenda for the next review.'],
 science:['The observations were entered into the shared log.','The report was archived with the other study materials.'],
 consumer:['The customer saved the messages for reference.','A follow-up enquiry was lodged that afternoon.'],
 travel:['The visitors kept a copy of the itinerary.','The organiser promised another update by email.'],
 sport:['The result was discussed at the following team meeting.','Supporters received a newsletter the next morning.'],
 technology:['The incident was documented in the issue tracker.','Another review was booked for the next sprint.'],
 education:['The comments were recorded for the next consultation.','The class received a further update the next day.'],
 nature:['The records were added to the seasonal survey.','The team planned to revisit the site the following week.'],
 arts:['A short note was included in the next programme.','The organiser sent an update to ticket holders.']
};
// Purpose-written unrelated examples with the same surface word in different
// meanings. This small subset probes polysemy but does not prove sense recall.
const SENSE_PAIRS=[
 ['The banker waived the charge on the account.','The battery held enough charge for the torch.'],
 ['The gardener trimmed the hedge along the border.','The designer added a border to the printed invitation.'],
 ['The drummer tuned the snare before rehearsal.','The ranger set a snare to capture an invasive animal.'],
 ['The sailor estimated the ship’s draft.','The novelist revised a first draft overnight.'],
 ['The mechanic tightened the wheel nut.','A squirrel buried a hazelnut beneath the tree.'],
 ['The musician found a short break in the score.','Engineers investigated a break in the water pipe.'],
 ['The artist selected a pale wash for the background.','The launderette charged extra for a delicate wash.'],
 ['The photographer adjusted the exposure of the shot.','The referee reviewed the disputed shot on goal.'],
 ['The tailor checked the length of the sleeve.','The record collector placed a new sleeve around the vinyl.'],
 ['The accountant reviewed the company’s return.','A tennis coach practised a difficult return.'],
 ['The engineer measured the thread on a bolt.','The writer lost the thread of the discussion.'],
 ['The actor studied the play before auditions.','The goalkeeper restarted play from the centre circle.'],
 ['The diver wore a protective suit.','The lawyer filed a civil suit in court.'],
 ['The cyclist adjusted the bike’s chain.','The hotel opened another branch of its chain.'],
 ['The carpenter shaped the edge of the board.','The committee appointed a new board of trustees.'],
 ['The nurse recorded the patient’s pulse.','The technician tested a pulse of electrical current.'],
 ['The printer ordered a new set of plates.','The waiter carried empty plates back to the kitchen.'],
 ['The chef prepared the stock for the soup.','The investor sold shares of stock before noon.'],
 ['The historian examined the date on the letter.','The botanist picked a ripe date from the palm.'],
 ['The coach planned a new training drill.','The engineer ordered a drill for the workshop.'],
 ['The scientist prepared a culture in the laboratory.','The theatre hosted an evening celebrating local culture.'],
 ['The sailor tested the anchor before departure.','The news anchor rehearsed the opening headlines.'],
 ['The florist arranged the stems in a vase.','The linguist compared the stems of related verbs.'],
 ['The editor corrected the copy before printing.','The collector bought a copy of an antique sculpture.'],
 ['The gardener inspected the bulb before planting.','The electrician replaced the bulb in the stairwell.'],
 ['The mechanic examined the clutch assembly.','The naturalist counted a clutch of eggs in the nest.'],
 ['The tourist climbed the tower before dusk.','The mechanic inspected the tower of a drilling rig.'],
 ['The tailor marked the seam on the fabric.','The geologist mapped a coal seam beneath the valley.'],
 ['The journalist reviewed the latest issue of the magazine.','The technician reported an issue with the printer.'],
 ['The pianist practised a scale in the warm-up.','The laboratory measured the scale of the microscopic structure.']
];
export async function readScenarioSeeds(filename=SEED_FILE){
 const lines=(await readFile(filename,'utf8')).trim().split(/\r?\n/u);
 if(lines[0]!=='domain|premise|addition|contrast')
  throw Error('Unexpected seed header');
 const rows=lines.slice(1).filter(Boolean).map((line,i)=>{
  const parts=line.split('|');
  if(parts.length!==4||!BACKGROUND[parts[0]]||
     parts.slice(1).some(t=>!t||!/[.!?]$/u.test(t)))
   throw Error('Invalid authored scenario '+(i+1));
  return {domain:parts[0],premise:parts[1],addition:parts[2],contrast:parts[3]};
 });
 if(rows.length!==100)throw Error('Exactly 100 authored seed scenarios required');
 if(new Set(rows.map(row=>row.premise)).size!==100)
  throw Error('Duplicate premise');
 for(const domain of Object.keys(BACKGROUND))
  if(rows.filter(row=>row.domain===domain).length!==10)
   throw Error('Expected ten scenarios for '+domain);
 return rows;
}
export function buildCorpus(seeds){
 if(!Array.isArray(seeds)||seeds.length!==100)
  throw Error('Expected 100 reviewed seed scenarios');
 const cases=[],unique=new Set();
 const add=(i,variant,{first,second,choice,challenge,leading='',trailing=''})=>{
  if(!['keep','and','but'].includes(choice))throw Error('Unknown relation choice');
  const left=leading?leading+' '+first:first;
  const text=left+' '+second+(trailing?' '+trailing:'');
  const offset=left.length-1;
  if(text[offset]!=='.')throw Error('Expected target full stop at '+i+':'+variant);
  if(!/[.!?]$/u.test(text))throw Error('Incomplete example');
  if(unique.has(text))throw Error('Duplicate example: '+text);
  unique.add(text);
  cases.push({id:'holdout-v2-'+String(i*10+variant+1).padStart(4,'0'),
   text,expected_boundaries:[{offset,choice}],
   family:'v2-scenario-'+String(i+1).padStart(3,'0'),
   domain:seeds[i].domain,challenge,variant,
   provenance:'developer-authored synthetic; NOT independently annotated'});
 };
 for(let i=0;i<100;i++){
  const item=seeds[i];
  const other=seeds[(i+47)%100],other2=seeds[(i+63)%100];
  if(other.domain===item.domain||other2.domain===item.domain)
   throw Error('KEEP negative must come from a different domain');
  const leading=BACKGROUND[item.domain][i%2];
  const trailing=FOLLOWUP[item.domain][(i+1)%2];
  const unrelated=other.addition;
  const unrelated2=other2.contrast;
  const shared=SENSE_PAIRS[i%SENSE_PAIRS.length];
  // Three additions, three contrasts, three unrelated examples per family.
  // A fourth boundary cycles classes to achieve 334/333/333 labels.
  add(i,0,{first:item.premise,second:item.addition,choice:'and',challenge:'related_follow_on'});
  add(i,1,{first:item.premise,second:item.contrast,choice:'but',challenge:'expectation_reversal'});
  add(i,2,{first:item.premise,second:unrelated,choice:'keep',challenge:'cross_domain_disjoint'});
  if(i<30) add(i,3,{first:shared[0],second:shared[1],choice:'keep',challenge:'shared_word_different_sense'});
  else add(i,3,{first:item.premise,second:unrelated2,choice:'keep',challenge:'cross_domain_topic_shift'});
  add(i,4,{first:item.premise,second:item.addition,leading,choice:'and',challenge:'preceding_context_addition'});
  add(i,5,{first:item.premise,second:item.contrast,leading,choice:'but',challenge:'preceding_context_contrast'});
  add(i,6,{first:item.premise,second:unrelated,leading,choice:'keep',challenge:'preceding_context_disjoint'});
  add(i,7,{first:item.premise,second:item.addition,trailing,choice:'and',challenge:'following_context_addition'});
  add(i,8,{first:item.premise,second:item.contrast,trailing,choice:'but',challenge:'following_context_contrast'});
  const choice=i%3===0?'and':i%3===1?'but':'keep';
  const second=choice==='and'?item.addition:choice==='but'?item.contrast:unrelated2;
  add(i,9,{first:item.premise,second,leading,trailing,choice,
   challenge:'longer_context_'+choice});
 }
 const byClass=Object.fromEntries(['keep','and','but'].map(k=>[k,cases.filter(x=>x.expected_boundaries[0].choice===k).length]));
 if(cases.length!==1000||byClass.keep!==333||byClass.and!==334||byClass.but!==333)
  throw Error('Unexpected v2 size or class balance '+JSON.stringify(byClass));
 return {meta:{version:VERSION,kind:'synthetic designed stress test',
  sampleCount:1000,scenarioFamilies:100,
  independenceNote:'Cases are not 1000 independent examples; ten share one authored scenario family. Group by family for all future fitting and evaluation.',
  annotation:'Provisional author labels; no adjudication or inter-annotator agreement.',
  mapping:'and = additive/causal/related follow-on; but = expectation reversal/contrast; keep = no salient local relationship',
  sampling:'100 authored scenarios from 10 domains; ten controlled context/label variants each. Intentionally nonrepresentative. 30 separate homonym pairs are embedded.',
  intendedUse:'Freeze before any scoring; train on previous 402 only. Any development on errors forfeits independent test status.'},cases};
}
async function main(){
 const expected=buildCorpus(await readScenarioSeeds());
 const generated=JSON.stringify(expected,null,2)+'\n';
 if(process.argv.includes('--check')){
  const existing=await readFile(OUT_FILE,'utf8');
  if(existing!==generated)throw Error('Frozen corpus changed; regenerate and version it explicitly');
 }else{
  await mkdir(path.dirname(OUT_FILE),{recursive:true});
  await writeFile(OUT_FILE,generated);
 }
 const labels=Object.fromEntries(['keep','and','but'].map(c=>[c,expected.cases.filter(x=>x.expected_boundaries[0].choice===c).length]));
 console.log((process.argv.includes('--check')?'Verified':'Generated')+' '+expected.cases.length+
  ' examples from '+new Set(expected.cases.map(x=>x.family)).size+' families; '+JSON.stringify(labels));
 console.log('SHA-256 '+createHash('sha256').update(generated).digest('hex'));
 console.log(OUT_FILE);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
 main().catch(e=>{console.error(e?.stack||e);process.exitCode=1;});
