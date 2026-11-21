// Minimal dependency-free multiclass gradient-boosted decision trees.
// Fixed conservative hyperparameters for reproducible reader experiments.
// One shallow Newton tree per class per boosting round; softmax loss.
// Each tree's split thresholds and leaf values are learned only from training
// rows. The implementation never reads held-out labels or source text.
export const BOOSTED_DEFAULTS=Object.freeze({
 rounds:32,maxDepth:2,minLeaf:12,maxBins:16,
 learningRate:0.09,l2:8,minGain:0.015,maxLeafValue:2.0
});
const CLASSES=Object.freeze(["keep","and","but"]);
const finite=Number.isFinite;
const bounded=(x,min,max)=>Math.max(min,Math.min(max,x));

export function softmax3(logits){
 if(!Array.isArray(logits)||logits.length!==3||!logits.every(finite))
  throw Error("Three finite logits required");
 const top=Math.max(...logits);
 const values=logits.map(x=>Math.exp(x-top));
 const denom=values.reduce((s,v)=>s+v,0);
 return values.map(x=>x/denom);
}
function extractFeatures(rows,keys){
 return rows.map(row=>keys.map(key=>{
  const v=row.features?.[key];
  if(!finite(v))throw Error("Missing or nonfinite feature "+key+" at "+row.id);
  return v;
 }));
}
function treeLeaf(indices,gradient,hessian,p){
 let g=0,h=0;
 for(const id of indices){g+=gradient[id];h+=hessian[id];}
 return {g,h,value:bounded(g/(h+p.l2),-p.maxLeafValue,p.maxLeafValue)};
}
function buildTree(features,gradient,hessian,indices,depth,p){
 const leaf=treeLeaf(indices,gradient,hessian,p);
 if(depth===0||indices.length<2*p.minLeaf)return {value:leaf.value};
 const base=(leaf.g*leaf.g)/(leaf.h+p.l2);
 let best=null;
 for(let key=0;key<features[0].length;key++){
  const sorted=indices.map(id=>({id,x:features[id][key]}))
   .sort((a,b)=>a.x-b.x||a.id-b.id);
  let gl=0,hl=0;
  const stride=Math.max(1,Math.floor(sorted.length/p.maxBins));
  for(let j=1;j<sorted.length;j++){
   const id=sorted[j-1].id;gl+=gradient[id];hl+=hessian[id];
   if(j<p.minLeaf||sorted.length-j<p.minLeaf||j%stride!==0)continue;
   if(sorted[j-1].x===sorted[j].x)continue;
   const gr=leaf.g-gl,hr=leaf.h-hl;
   const gain=0.5*(gl*gl/(hl+p.l2)+gr*gr/(hr+p.l2)-base);
   if(gain>p.minGain&&(best===null||gain>best.gain+1e-12))
    best={feature:key,threshold:(sorted[j-1].x+sorted[j].x)/2,gain};
  }
 }
 if(!best)return {value:leaf.value};
 const lhs=[],rhs=[];
 for(const id of indices){
  (features[id][best.feature]<=best.threshold?lhs:rhs).push(id);
 }
 if(lhs.length<p.minLeaf||rhs.length<p.minLeaf)return {value:leaf.value};
 return {feature:best.feature,threshold:best.threshold,
  left:buildTree(features,gradient,hessian,lhs,depth-1,p),
  right:buildTree(features,gradient,hessian,rhs,depth-1,p)};
}
export function scoreTree(tree,values){
 let node=tree;
 while(node.feature!==undefined)
  node=values[node.feature]<=node.threshold?node.left:node.right;
 return node.value;
}
export function trainBoostedFusion(training,keys,options={}){
 const p={...BOOSTED_DEFAULTS,...options};
 if(!Array.isArray(training)||training.length<3*p.minLeaf||
    !Array.isArray(keys)||keys.length<1||new Set(keys).size!==keys.length)
  throw Error("Not enough training rows, or invalid features");
 if(!Number.isSafeInteger(p.rounds)||p.rounds<1||p.rounds>150||
    !Number.isSafeInteger(p.maxDepth)||p.maxDepth<1||p.maxDepth>3||
    !Number.isSafeInteger(p.minLeaf)||p.minLeaf<2||
    !Number.isSafeInteger(p.maxBins)||p.maxBins<2||
    !finite(p.l2)||p.l2<=0||!finite(p.learningRate)||p.learningRate<=0||
    p.learningRate>1||!finite(p.minGain)||p.minGain<0||
    !finite(p.maxLeafValue)||p.maxLeafValue<=0)
  throw Error("Invalid boosted-tree hyperparameters");
 const x=extractFeatures(training,keys);
 const counts=CLASSES.map(c=>training.filter(row=>row.gold===c).length);
 if(counts.some(n=>n<1))throw Error("Training fold has an absent class");
 const n=training.length;
 const weight=training.map(row=>
  Math.sqrt(n/(3*counts[CLASSES.indexOf(row.gold)])));
 const priors=CLASSES.map(c=>
  training.reduce((s,row,i)=>s+(row.gold===c?weight[i]:0),0));
 const sum=priors.reduce((s,v)=>s+v,0);
 const base=priors.map(v=>Math.log(v/sum));
 const logits=Array.from({length:n},()=>base.slice());
 const all=Array.from({length:n},(_,i)=>i);
 const trees=[];
 for(let round=0;round<p.rounds;round++){
  const probabilities=logits.map(softmax3);
  const classifiers=[];
  for(let classIndex=0;classIndex<3;classIndex++){
   const gradients=training.map((row,i)=>weight[i]*
    ((row.gold===CLASSES[classIndex]?1:0)-probabilities[i][classIndex]));
   const hessians=training.map((_,i)=>weight[i]*
    Math.max(1e-6,probabilities[i][classIndex]*(1-probabilities[i][classIndex])));
   const tree=buildTree(x,gradients,hessians,all,p.maxDepth,p);
   classifiers.push(tree);
   for(let i=0;i<n;i++)
    logits[i][classIndex]+=p.learningRate*scoreTree(tree,x[i]);
  }
  trees.push(classifiers);
 }
 function predict(row){
  const values=keys.map(key=>{
   const v=row.features?.[key];
   if(!finite(v))throw Error("Missing or nonfinite prediction feature "+key);
   return v;
  });
  const scores=base.slice();
  for(const round of trees)for(let c=0;c<3;c++)
   scores[c]+=p.learningRate*scoreTree(round[c],values);
  return CLASSES[scores.indexOf(Math.max(...scores))];
 }
 return predict;
}
