import { pipeline, env } from "@huggingface/transformers";
env.allowLocalModels = false;
env.allowRemoteModels = true;
env.useBrowserCache = true;
const MODEL = "Xenova/all-MiniLM-L6-v2";
const MATCH_THRESHOLD = 0.43;
let extractor, techniques=[], prototypes=[], initialising;
const dot=(a,b)=>{let sum=0,na=0,nb=0;for(let i=0;i<a.length;i++){sum+=a[i]*b[i];na+=a[i]*a[i];nb+=b[i]*b[i];}return sum/(Math.sqrt(na)*Math.sqrt(nb)||1);};
async function embed(texts){
 const output=await extractor(texts,{pooling:"mean",normalize:true});
 return Array.from({length:texts.length},(_,i)=>Array.from(output[i].data));
}
function prototypeTexts(t){
 return [...new Set([t.title,t.summary,t.definition,t.description,t.example,...(t.examples||[]),...(t.observable_features||[])].filter(x=>typeof x==="string"&&x.trim()).map(x=>x.trim()))];
}
async function initialise(catalogue){
 extractor=await pipeline("feature-extraction",MODEL,{dtype:"q8"});
 techniques=catalogue.techniques||[];
 const entries=techniques.flatMap((technique,index)=>prototypeTexts(technique).map(text=>({techniqueIndex:index,text})));
 const vectors=await embed(entries.map(x=>x.text));
 prototypes=entries.map((entry,index)=>({...entry,vector:vectors[index]}));
 self.postMessage({type:"ready"});
}
function windows(text){
 const out=[],sentences=[],re=/[^.!?\n]+[.!?]?/g;let m;
 while((m=re.exec(text))!==null){const value=m[0].trim();if(value.length>18){const start=m.index+m[0].indexOf(value);sentences.push({text:value,start,end:start+value.length});}}
 for(let i=0;i<sentences.length;i++){out.push(sentences[i]);if(i+1<sentences.length&&sentences[i+1].start-sentences[i].start<420)out.push({text:sentences[i].text+" "+sentences[i+1].text,start:sentences[i].start,end:sentences[i+1].end});}
 return out;
}
self.addEventListener("message",async event=>{
 const data=event.data;
 if(data.type==="init"){if(!initialising)initialising=initialise(data.catalogue).catch(error=>self.postMessage({type:"fatal",error:String(error?.message||error)}));return;}
 if(data.type!=="match")return;
 try{
  await initialising;
  const parts=windows(data.text);if(!parts.length){self.postMessage({id:data.id,matches:[]});return;}
  const embedded=await embed(parts.map(p=>p.text)),found=[];
  for(let i=0;i<parts.length;i++){
   let best=-1,score=-1;
   for(const prototype of prototypes){const value=dot(embedded[i],prototype.vector);if(value>score){score=value;best=prototype.techniqueIndex;}}
   if(score>=MATCH_THRESHOLD)found.push({...parts[i],technique:techniques[best],score});
  }
  found.sort((a,b)=>b.score-a.score);const selected=[];
  for(const m of found)if(!selected.some(x=>m.start<x.end&&m.end>x.start))selected.push(m);
  self.postMessage({id:data.id,matches:selected});
 }catch(error){self.postMessage({id:data.id,error:String(error?.message||error)});}
});
