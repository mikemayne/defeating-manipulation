import assert from "node:assert/strict";
import { findScrutinyWarnings } from "../extension/src/scrutiny-signals.mjs";
import { matchText } from "../extension/src/matching-core.mjs";

const flagged = "Obviously, this is catastrophic and you must accept the decision immediately, or you will regret it.";
const good = "The committee published a revised timetable after considering feedback from several departments.";
const mild = "Obviously, you must support this decision immediately for the benefit of the whole organisation.";

const all = findScrutinyWarnings(flagged);
assert.equal(all.length, 1, "Four distinct weak signals may lead to orange");
assert.equal(all[0].kind, "scrutiny");
assert.equal(all[0].technique.category, "Scrutiny");
assert.equal(flagged.slice(all[0].start, all[0].end), flagged);
assert.ok(all[0].signals.length >= 4);
assert.deepEqual(findScrutinyWarnings(good), [], "Ordinary prose is not flagged");
assert.deepEqual(findScrutinyWarnings(mild), [], "Three lexical cues alone are insufficient");
assert.deepEqual(findScrutinyWarnings(flagged,
 { findings: [{start: 10, end: 25, technique: {id:"known"}}] }), [],
 "A recognised pattern takes priority over orange");
assert.deepEqual(findScrutinyWarnings(mild,
 { nearMisses: [{start:0,end:mild.length,score:0.6}] }), [],
 "Low-similarity near misses are insufficient");
assert.equal(findScrutinyWarnings(mild,
 { nearMisses: [{start:0,end:mild.length,score:0.76}] }).length, 1,
 "A model near miss plus multiple distinct text signals prompts scrutiny");
assert.deepEqual(findScrutinyWarnings("Clear.", {maxFindings:0}), []);
assert.ok(findScrutinyWarnings(flagged)[0].start >= 0,
 "Warnings preserve original source offsets");

// Negative semantic prototypes are used only as an advisory weak signal
// when the stronger matching pipeline abstains; no forced technique label.
const near = [];
const matches = await matchText(mild, {
 techniques: [{id:"test",title:"Test",category:"Manipulation"}],
 rules: [],
 prototypes: [{techniqueIndex:0,vector:[1,0]}],
 embed: async texts => texts.map(() => [1,0]),
 evidence: () => false,
 onNearMiss: signal => near.push(signal)
});
assert.equal(matches.length, 0, "Failed semantic-evidence gate cannot become a named finding");
assert.ok(near.length > 0, "Near misses remain available to the advisory pass");
assert.equal(findScrutinyWarnings(mild, { nearMisses:near }).length, 1);
console.log("Scrutiny-signal tests passed");
