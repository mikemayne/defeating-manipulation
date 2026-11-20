import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { escapeRegexLiteral, validatedNliScores }
 from "../extension/src/argument-safety.mjs";
import { analyseArguments, argumentFindings }
 from "../extension/src/argument-analysis.mjs";
import { inspectArgumentProof }
 from "../extension/src/argument-proof-graph.mjs";
import { structurePropositions }
 from "../extension/src/argument-propositions.mjs";

// A source literal, never a regular-expression program.
const metachars="a.*(b)|[c]$^{}\\";
const escaped=escapeRegexLiteral(metachars);
assert.equal(typeof escaped,"string");
const compiled=new RegExp("^"+escaped+"$");
assert.equal(compiled.test(metachars),true);
assert.equal(compiled.test("a any characters b"),false);
assert.equal(escapeRegexLiteral(42),null,"Model numbers are not string patterns");
assert.equal(escapeRegexLiteral("a".repeat(257)),null,"Unbounded regex fragments rejected");

for(const hostile of [
 "<img src=x onerror=alert(1)>",
 "<script>globalThis.HACKED=true</script>",
 "'; globalThis.HACKED=true; //",
 "\x60"+"$"+"{process.env.SECRET}",
 "x) | (.*",
 "__proto__",
 "constructor"
]){
 const literal=escapeRegexLiteral(hostile);
 assert.ok(literal!==null,"Bounded hostile input is representable as a literal");
 const regex=new RegExp("^"+literal+"$");
 assert.equal(regex.test(hostile),true,"Hostile input remains inert data");
 if(hostile!=="__proto__" && hostile!=="constructor")
  assert.equal(regex.test("ordinary unrelated phrase"),false);
}

// NLI output MUST be exactly three finite probabilities, with no methods,
// getters, extra payload fields, prototype tricks or string-to-number coercion.
const valid=validatedNliScores({contradiction:0.05,neutral:0.90,entailment:0.05});
assert.equal(valid.neutral,0.9);
assert.equal(Object.getPrototypeOf(valid),null,"Return inert null-prototype data");
assert.ok(Object.isFrozen(valid));
const mutated=JSON.parse('{"__proto__":{"polluted":true},"contradiction":0.05,"neutral":0.9,"entailment":0.05}');
assert.equal(validatedNliScores(mutated),null,"Reject all extra model fields");
assert.equal({}.polluted,undefined,"Never mutate object prototypes");
assert.equal(validatedNliScores({contradiction:"0.1",neutral:0.8,entailment:0.1}),null);
assert.equal(validatedNliScores({contradiction:Infinity,neutral:0,entailment:0}),null);
assert.equal(validatedNliScores({contradiction:NaN,neutral:0,entailment:0}),null);
assert.equal(validatedNliScores({contradiction:0.1,neutral:0.2,entailment:0.3}),null);
assert.equal(validatedNliScores({contradiction:0,neutral:0,entailment:0}),null);
assert.equal(validatedNliScores(["contradiction","neutral","entailment"]),null);
assert.equal(validatedNliScores(new Date()),null);
let getterCalled=false;
const getterPayload={
 get contradiction(){getterCalled=true;throw Error("Never evaluate model getters");},
 neutral:0,entailment:1
};
assert.equal(validatedNliScores(getterPayload),null);
assert.equal(getterCalled,false,"Payload getters are never read");

// Even if an untrusted selected paragraph contains script-like instructions,
// graph construction keeps that source as text and executes none of it.
delete globalThis.__argumentSafetyInjected;
const raw="The receipts contain a final fee of £12. Therefore the fee is £12. "+
 "'; globalThis.__argumentSafetyInjected=true; //";
inspectArgumentProof(raw,"the fee is £12.");
structurePropositions(raw,"the fee is £12.");
assert.equal(globalThis.__argumentSafetyInjected,undefined);

const seen=[];
const invalidResult=await analyseArguments(
 "The registrar published its timetable. Therefore the city will win an award.",
 async()=>({contradiction:0.99,neutral:0,entailment:0.01,
           override:"javascript:alert(1)"}),
 {onDiagnostic:d=>seen.push(d)});
assert.equal(seen.length,1);
assert.equal(seen[0].comparisons[0].forward,null,
 "Extra fields in model output are rejected, not forwarded to the UI");
assert.deepEqual(argumentFindings(invalidResult),[],
 "Malformed model output is a non-accusatory abstention");

const benchmark=readFileSync(
 new URL("../extension/src/benchmark-ui.mjs",import.meta.url),"utf8");
assert.ok(benchmark.includes("textContent"),"Diagnostic text goes to text-only DOM sinks");
assert.ok(!/\.(?:innerHTML|outerHTML)\s*=|insertAdjacentHTML\s*\(/.test(benchmark),
 "Benchmark diagnostics must not interpolate untrusted content as HTML");
console.log("Argument safety: literal regex, numeric-only model output, hostile source text, no HTML sinks passed.");
