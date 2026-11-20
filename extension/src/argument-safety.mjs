// Pure boundary helpers for untrusted text and local model scores.
// The model never supplies source code, regex syntax, predicates or callbacks.
// Render source text with textContent rather than interpolated HTML.
const META = /[.*+?^{}$()|[\]\\]/g;
const SCORE_KEYS = Object.freeze(["contradiction","neutral","entailment"]);
const SCORE_KEY_SET = new Set(SCORE_KEYS);

/** Literal-only interpolation into a bounded RegExp; null means reject. */
export function escapeRegexLiteral(value) {
 if (typeof value!=="string" || value.length>256) return null;
 return value.replace(META,"\\$&");
}

/** Convert NLI output to exactly three inert, finite probabilities. */
export function validatedNliScores(value) {
 if (value===null || typeof value!=="object" || Array.isArray(value)) return null;
 const prototype = Object.getPrototypeOf(value);
 if(prototype!==Object.prototype && prototype!==null)return null;
 const descriptors=Object.getOwnPropertyDescriptors(value);
 const names=Reflect.ownKeys(descriptors);
 if(names.length!==3 || names.some(key=>!SCORE_KEY_SET.has(key)))return null;
 const result=Object.create(null);
 let total=0;
 for(const key of SCORE_KEYS){
  const descriptor=descriptors[key];
  // Do not invoke getters, inherited fields, methods or coercion hooks.
  if(!descriptor || !Object.hasOwn(descriptor,"value"))return null;
  const n=descriptor.value;
  if(typeof n!=="number" || !Number.isFinite(n) || n<0 || n>1)return null;
  result[key]=n;total+=n;
 }
 if(total<=0 || Math.abs(total-1)>0.025)return null;
 return Object.freeze(result);
}
