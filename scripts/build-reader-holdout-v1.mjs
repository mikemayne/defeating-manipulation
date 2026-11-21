#!/usr/bin/env node
/**
 * Frozen reader-relationship challenge corpus v1.
 * 300 labelled, two-sentence cases; 50 cases in each of six challenge groups.
 * Examples are fictional, human-authored seed pairs with two distinct second
 * sentences per first sentence. All test cases are strictly held out from
 * the 102-case dataset used to tune the fusion model.
 *
 * This is an intentionally challenging, provisional DEVELOPER-ANNOTATED
 * dataset. "and" denotes related additive, chronological or consequential
 * statements; it does not mean "and" is the only appropriate connector.
 * "keep" denotes no salient relationship between the propositions.
 * No human annotator agreement has been measured.
 */
import {writeFile,mkdir} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createHash} from "node:crypto";
import {extractBoundaryProbes} from "../extension/src/reader-boundary-scorer.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const output=path.join(root,"evaluation/reader-holdout-v1.json");
export const HOLDOUT_VERSION="reader-holdout-v1";
export const SEED_PAIRS=Object.freeze({
 implicit_contrast:{
  choice:"but",
  seeds:[
   ["The train was scheduled to arrive before noon","The platform remained empty until midafternoon","Passengers were still waiting at sunset"],
   ["The hotel advertised silent rooms","Drilling began next door before dawn","Guests could hear construction throughout the night"],
   ["The store promised next day delivery","The parcel appeared a week later","Customers waited nine days for their orders"],
   ["The forecast showed clear weather","Thunderstorms interrupted the festival","Heavy rain flooded the campsite"],
   ["The insurer guaranteed immediate assistance","The caller waited on hold for hours","Its helpline disconnected after a long queue"],
   ["The brochure described the journey as direct","Passengers had to change trains twice","Three transfers were required along the route"],
   ["The restaurant claimed every dish was freshly prepared","Frozen meals were reheated in the kitchen","Inspectors found ready meals being served"],
   ["The landlord said the flat was newly insulated","Cold air entered through gaps around the windows","The occupants could see daylight around the frames"],
   ["The campaign pledged to reduce parking charges","The council doubled the hourly tariff","Drivers faced a substantial increase in fees"],
   ["The laboratory report predicted a stable reaction","The mixture accelerated unexpectedly","The temperature climbed sharply during the test"],
   ["The publisher called the book a bestseller","Only a handful of copies were sold","Retailers returned almost all the stock"],
   ["The school promised smaller class sizes","The next intake placed forty pupils together","Teachers were assigned larger groups than before"],
   ["The advertisement guaranteed unlimited data","The connection was throttled after a small allowance","Downloads stopped once the monthly cap was reached"],
   ["The stadium announcement said every entrance was open","The north and west gates were locked","Most spectators had to use a single turnstile"],
   ["The company said redundancies were off the table","Two departments lost their entire workforce","A closure notice followed the announcement"],
   ["The builder estimated the renovation would take one week","The scaffolding remained for three months","Work was still unfinished by the end of the season"],
   ["The charity promised to publish its accounts","The figures remained unavailable to the public","Its website contained no financial statements"],
   ["The reviewer called the microphone almost silent","A steady hiss dominated the recording","The test captured noticeable background noise"],
   ["The candidate said the roads would be repaired","Potholes grew deeper throughout the year","The maintenance budget was later cancelled"],
   ["The travel agency described the beach as deserted","Hundreds of visitors crowded the sand","All available loungers were occupied"],
   ["The museum described its collection as complete","Several major exhibits were still missing","The catalogue listed objects the museum did not possess"],
   ["The coach announced that all players were fit","Three starters missed the match through injury","The medical team ruled out half the squad"],
   ["The ticket said the show would begin at seven","The first act did not appear until nine","The curtain rose two hours late"],
   ["The tablet was advertised as waterproof","A splash of rain disabled the screen","The device stopped working after a brief immersion"],
   ["The dealer guaranteed the car had never been damaged","An inspection found extensive collision repairs","The chassis showed signs of a previous crash"]
  ]},
 expectation_reversal:{
  choice:"but",
  seeds:[
   ["The baker won an award for the quality of his bread","The next batch came out burnt and inedible","Customers returned the loaves they had purchased"],
   ["The bridge passed its annual safety inspection","Engineers discovered major cracks the following day","An emergency closure was ordered after hidden damage emerged"],
   ["The team dominated the opening half","Their opponents scored every goal after the break","They lost despite controlling most of the match"],
   ["The new software attracted excellent early reviews","Its first update broke the login system","Users found the application unusable after release"],
   ["The farmer enjoyed ideal growing weather in spring","A late frost destroyed the young crop","An unexpected cold spell wiped out the seedlings"],
   ["The orchestra rehearsed for months","Its concert was cancelled when the hall lost power","The performance never began after the venue flooded"],
   ["The athlete set a personal record in qualifying","An injury prevented her from competing in the final","She withdrew before the championship race"],
   ["The company reported record sales","Its operating costs produced a substantial loss","The financial year still ended in deficit"],
   ["The university expanded its scholarship programme","Fewer students qualified under the revised rules","New eligibility conditions excluded most applicants"],
   ["The harbour received funding for new defences","A moderate storm nevertheless damaged the quay","The first high tide breached the new barrier"],
   ["The cinema invested in upgraded projectors","A technical failure interrupted the premiere","The opening screening had to be abandoned"],
   ["The airline added extra flights for the holiday weekend","Severe weather grounded every service","An airport closure left passengers stranded"],
   ["The library bought new computers","A network fault left them inaccessible for weeks","A software licence problem prevented anyone using them"],
   ["The factory installed an automated quality-control system","Defective products continued to reach customers","The recall rate increased after installation"],
   ["The town planted hundreds of young trees","A drought killed most of them by midsummer","Very few survived their first growing season"],
   ["The chef received praise for careful food handling","Inspectors later found serious hygiene violations","The kitchen was closed following a health inspection"],
   ["The actor received a standing ovation at rehearsal","The opening night performance was halted by illness","A sudden cancellation disappointed the waiting audience"],
   ["The council opened a new cycle lane","Cars regularly parked across the route","Riders still had to enter traffic to get around obstructions"],
   ["The telescope passed every calibration check","The first observations contained severe distortions","The final images were too blurred to interpret"],
   ["The vineyard predicted a strong harvest","A sudden storm destroyed much of the fruit","The final yield fell far below expectations"],
   ["The ship completed its sea trials","An engine fault emerged on its first commercial voyage","The vessel returned to port almost immediately"],
   ["The government announced more hospital appointments","Patients faced longer waiting lists by the autumn","The number of completed consultations actually fell"],
   ["The exhibition sold out its advance tickets","A transport strike prevented most visitors attending","The galleries were almost empty on opening day"],
   ["The battery showed full charge before the journey","The vehicle stopped after only a few miles","The range indicator fell to zero almost immediately"],
   ["The security system passed a demonstration","A simple outage disabled every alarm","The cameras stopped recording during the first power cut"]
  ]},
 keep_shared_word:{
  choice:"keep",
  seeds:[
   ["The bank approved a mortgage application","Heavy rain eroded the river bank","An angler slipped on the muddy bank"],
   ["The guitarist replaced the bass strings","Researchers counted bass in a freshwater lake","The fisherman released a large bass"],
   ["The actor wore a silver ring","The city opened a new ring road","A broken ring around Saturn appeared in the simulation"],
   ["The tennis player served a fast ball","The school organised a charity ball","Guests arrived in formal clothes for the ball"],
   ["The editor corrected the first draft","Cold air entered through a draft beneath the door","A sudden draft blew papers off the desk"],
   ["The singer struck a high note","The bank increased interest on the note","An antique banknote was sold at auction"],
   ["The theatre used bright stage lights","The suitcase was light enough to carry","The parcel felt surprisingly light"],
   ["The analyst checked the current figures","A strong current carried the kayak downstream","The boat struggled against the current"],
   ["The match was postponed after heavy rain","The candle could not be lit without a match","A box of matches was found in the drawer"],
   ["The photographer adjusted the camera lens","A tiny lens formed in the insect's eye","The biologist examined the creature's lens"],
   ["The prosecutor prepared to appear in court","The hotel added a tennis court","Children practised on the outdoor court"],
   ["The musician kept time with a metronome","The museum displayed a time capsule","Volunteers buried the capsule for future visitors"],
   ["The architect revised the building plan","The gardener planted herbs on the plot","An allotment plot was offered to a newcomer"],
   ["The painter chose a warmer tone","The laboratory produced a pure test tone","An audio engineer measured the tone's frequency"],
   ["The chef seasoned the meat carefully","The university began its spring term","Students returned for the new term"],
   ["The publisher printed a revised edition","The botanist examined a single leaf","A fallen leaf was collected for microscopy"],
   ["The model posed for a catalogue","The students built a working model of a volcano","An engineer tested a scale model in the wind tunnel"],
   ["The lawyer opened a new case","The phone arrived in a protective case","A cracked case exposed the handset"],
   ["The porter carried the heavy trunk","The elephant raised its trunk","A young elephant sprayed water from its trunk"],
   ["The programmer updated a local file","The carpenter sharpened a metal file","A workshop file removed the rough edges"],
   ["The broker bought shares in a firm","The mattress felt pleasantly firm","A firm cushion supported his back"],
   ["The pianist pressed the final key","The locksmith cut a replacement key","The brass key fitted the old door"],
   ["The driver crossed the spring bridge","The mechanic fitted a new coil spring","A compressed spring launched the mechanism"],
   ["The film director reviewed the final cut","The gardener cut back a rose bush","A sharp tool made a clean cut through the stem"],
   ["The journalist reported the election result","The scientist repeated an experiment to confirm the result","A result from the laboratory arrived in the afternoon"]
  ]},
 keep_disjoint:{
  choice:"keep",
  seeds:[
   ["The post office introduced a new stamp design","A group of astronomers observed a distant comet","The observatory photographed a passing asteroid"],
   ["The village bakery opened before sunrise","The airport replaced several runway lights","A cargo plane landed during the afternoon"],
   ["The gardener planted lavender beside the wall","An orchestra rehearsed a new symphony","The conductor reviewed the brass section"],
   ["The accountant checked the tax return","A seal rested on a rock near the harbour","Marine researchers tagged a young dolphin"],
   ["The cyclist replaced a worn chain","The theatre sold every ticket for Saturday","A cast rehearsed the final scene"],
   ["The chemist labelled a new sample","A mountain guide surveyed the ridge","Climbers reached the summit at dawn"],
   ["The librarian sorted books by subject","The fishing vessel returned with a damaged propeller","Divers inspected a wreck offshore"],
   ["The carpenter measured a wooden panel","A weather balloon crossed the upper atmosphere","Meteorologists launched instruments into the sky"],
   ["The florist arranged yellow tulips","The mayor announced a council by-election","Voters queued at the polling station"],
   ["The mechanic checked the wheel bearings","An opera singer practised a difficult aria","The audience applauded the soloist"],
   ["The beekeeper inspected the hives","A software engineer patched a database server","The application received a security update"],
   ["The child assembled a cardboard castle","A freight train passed through the station","Rail workers repaired a damaged signal"],
   ["The dentist ordered a replacement crown","A research ship mapped the seabed","Oceanographers collected samples from deep water"],
   ["The chef grated lemon peel","The astronomy club built a telescope","A meteor shower lit the night sky"],
   ["The pharmacist reorganised the shelves","A football club appointed a new goalkeeper","The striker missed a penalty"],
   ["The printer ran out of cyan ink","A lighthouse keeper inspected the beacon","A rescue boat crossed the estuary"],
   ["The archaeologist cleaned an ancient coin","A cinema installed new sound equipment","The opening film featured a large orchestra"],
   ["The baker weighed flour for the dough","A weather station reported a strong crosswind","The airport delayed several departures"],
   ["The violin teacher demonstrated a scale","The local council resurfaced a narrow lane","Traffic cones blocked the road"],
   ["The plumber repaired a leaking tap","A botanist catalogued rare orchids","An expedition discovered unfamiliar mosses"],
   ["The ferry operator published a revised schedule","The tailor hemmed a winter coat","A clothing shop displayed handmade scarves"],
   ["The writer outlined a detective novel","The swimming pool replaced its filtration system","Lifeguards rehearsed an evacuation"],
   ["The painter mixed a darker shade of blue","A chess player resigned after losing a rook","The tournament entered its final round"],
   ["The goalkeeper practised catching crosses","The bakery replaced its old oven","Fresh pastries cooled on the counter"],
   ["The museum acquired a ceramic vase","A telecommunications company laid fibre cable","Engineers tested the new network connection"]
  ]},
 related_different_words:{
  choice:"and",
  seeds:[
   ["The violinist tightened the strings","The orchestra began its rehearsal","The ensemble started practising together"],
   ["The bakery closed its ovens for cleaning","Fresh loaves were available again the next morning","Customers returned when the next batch was ready"],
   ["The surgeon reviewed the scan","The patient was booked for an operation","A theatre was reserved for the procedure"],
   ["The gardener watered the seed trays","New shoots appeared beside the greenhouse","Tiny seedlings emerged within days"],
   ["The pilot requested permission to descend","The aircraft approached the runway","The jet lined up for landing"],
   ["The accountant completed the year-end figures","The board received the financial statements","Directors reviewed the annual accounts"],
   ["The composer finished the final movement","Musicians were given the completed score","The players practised the closing passage"],
   ["The river rose after several days of rain","Residents moved belongings to higher ground","Families prepared for flooding nearby"],
   ["The new bridge opened to traffic","Commuters could cross the valley without a detour","Drivers reached the other side more directly"],
   ["The library extended its opening hours","Readers could borrow books later in the evening","Visitors gained access after normal working hours"],
   ["The chemist recorded the reaction temperature","The laboratory added the measurement to its report","The scientist logged the result in the experiment notes"],
   ["The electrician checked the distribution board","The building's power circuits passed inspection","The wiring was cleared for continued use"],
   ["The chef prepared dough before dawn","Warm pastries appeared in the display case","Fresh rolls were ready when the shop opened"],
   ["The detective examined the security footage","Investigators identified a vehicle leaving the scene","Officers traced a number plate visible in the recording"],
   ["The photographer changed to a longer lens","Distant birds filled more of the frame","Wildlife appeared larger in the resulting images"],
   ["The council approved funding for a new playground","Workers began installing climbing equipment","Children would soon have additional outdoor facilities"],
   ["The farmer repaired the broken gate","Livestock remained safely inside the field","The animals could no longer wander onto the road"],
   ["The broadcaster tested the new transmitter","Listeners reported clearer reception","The radio signal reached remote homes more reliably"],
   ["The scientist sequenced the bacterial sample","The laboratory identified the responsible organism","Researchers matched the specimen to a known species"],
   ["The editor approved the manuscript","The printer prepared the first edition","Copies were scheduled for publication"],
   ["The conductor raised her baton","The strings began the opening passage","The ensemble started playing the first movement"],
   ["The cyclist replaced the worn tyres","The bicycle handled wet corners more securely","Road grip improved during the next ride"],
   ["The architect approved the revised drawings","Builders began laying the foundations","Construction could proceed under the new plans"],
   ["The doctor adjusted the prescription","The patient's symptoms began to improve","The revised treatment produced a better response"],
   ["The team installed new solar panels","The building purchased less electricity from the grid","Daytime power came increasingly from the roof"]
  ]},
 related_cause_sequence:{
  choice:"and",
  seeds:[
   ["The reservoir gates opened after the storm","Water levels downstream rose sharply","The river carried a larger volume by morning"],
   ["The school cancelled the afternoon bus","Parents arranged alternative transport","Families collected their children by car"],
   ["The museum closed for emergency repairs","Visitors were directed to another entrance","Ticket holders were told to return after the work"],
   ["The alarm sounded in the laboratory","Staff evacuated the building","Researchers left through the emergency exits"],
   ["The chef turned off the oven","The kitchen gradually cooled","The heating elements stopped glowing"],
   ["A fault interrupted the telephone network","Customers lost their connections","Calls began failing across the area"],
   ["The council raised the bridge","Boats passed through the channel","River traffic was allowed to continue"],
   ["The train departed late","Passengers missed several onward connections","Arrival times slipped along the route"],
   ["The hospital introduced an online booking system","Patients began scheduling visits from home","Reception staff received fewer telephone calls"],
   ["The cyclist applied the brakes","The bicycle slowed before the corner","The wheels came to a stop at the crossing"],
   ["The laboratory refrigerated the specimens","Decomposition slowed during storage","The samples stayed usable for longer"],
   ["The theatre sold out its opening performance","Extra seats were released for the following night","Management scheduled an additional show"],
   ["The gardener planted bulbs in autumn","Flowers emerged in early spring","The border filled with colour after winter"],
   ["The server ran out of storage space","New uploads failed","The application stopped accepting attachments"],
   ["The storm damaged the power line","Several streets lost electricity","Homes were left without lighting"],
   ["The referee blew the final whistle","Players began leaving the pitch","The teams shook hands before departing"],
   ["The publisher increased the print run","More copies reached local bookshops","The title became easier to find on shelves"],
   ["The airport reopened after the inspection","Flights resumed during the afternoon","The departure boards began updating again"],
   ["The mechanic replaced the faulty pump","Coolant circulated normally through the engine","The overheating problem disappeared"],
   ["The bakery increased its flour order","More bread was prepared for the weekend","The staff were able to produce extra loaves"],
   ["The council introduced a recycling collection","Households began separating paper from food waste","Residents received additional bins"],
   ["The scientist increased the voltage","The motor spun faster","The rotor completed more revolutions per second"],
   ["The farm installed an irrigation system","Crops received water during the dry spell","Plants were less affected by the lack of rain"],
   ["The musician tuned the instrument","The ensemble sounded more harmonious","The notes matched the reference pitch"],
   ["The dentist applied a local anaesthetic","The patient felt less discomfort during treatment","The procedure could continue without sharp pain"]
  ]}
});
export function generateHoldout(){
 const cases=[];
 let index=1;
 for(const [challenge,{choice,seeds}] of Object.entries(SEED_PAIRS)){
  if(seeds.length!==25)throw Error(challenge+" must contain exactly 25 distinct seed scenarios");
  for(let i=0;i<seeds.length;i++){
   const [left,...rights]=seeds[i];
   if(rights.length!==2)throw Error("Two independent endings required in "+challenge);
   for(let j=0;j<2;j++){
    const text=left+". "+rights[j]+".";
    const offset=left.length;
    const probes=extractBoundaryProbes(text,{maxPairs:8});
    if(probes.length!==1||probes[0].punctuationStart!==offset)
     throw Error("Invalid sentence boundary "+challenge+"/"+i+"/"+j+": "+text);
    cases.push({
     id:"holdout-v1-"+String(index++).padStart(3,"0"),
     text,expected_boundaries:[{offset,choice}],
     challenge,family:challenge+"-"+String(i+1).padStart(2,"0"),
     note:"Provisional synthetic gold; no human annotation"
    });
   }
  }
 }
 if(cases.length!==300)throw Error("Holdout corpus must have exactly 300 cases");
 const seen=new Set();
 for(const c of cases){
  if(seen.has(c.text.toLowerCase()))throw Error("Duplicate holdout text");
  seen.add(c.text.toLowerCase());
 }
 return {
  meta:{
   version:HOLDOUT_VERSION,description:"300 fresh challenging labelled two-sentence items, 50 per challenge; held out of the 102-case training corpus",
   labels:{keep:"No salient relationship",and:"Addition, consequence or temporal follow-on",but:"Contrast or expectation reversal"},
   design:"25 authored seeds x 2 different second-sentence variants x 6 challenge groups",
   independentOfOldModelFitting:true,
   provisionalDeveloperLabels:true,
   independentlyHumanAnnotated:false,
   noRealWorldCorpus:true
  },cases
 };
}
async function main(){
 const dataset=generateHoldout();
 await mkdir(path.dirname(output),{recursive:true});
 const content=JSON.stringify(dataset,null,2)+"\n";
 await writeFile(output,content);
 const hash=createHash("sha256").update(content).digest("hex");
 const labels=Object.fromEntries(["keep","and","but"].map(label=>
  [label,dataset.cases.filter(c=>c.expected_boundaries[0].choice===label).length]));
 console.log("Generated "+dataset.cases.length+" holdout cases: "+JSON.stringify(labels));
 console.log("SHA-256: "+hash);
 console.log("Saved "+output);
 console.log("No neural inference was performed.");
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
 main().catch(err=>{console.error(err?.stack||err);process.exitCode=1;});
