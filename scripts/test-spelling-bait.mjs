import assert from "node:assert/strict";
import { findSpellingBait } from "../extension/src/spelling-bait.mjs";

const knownErrors = new Map([
 ["absoloute", ["absolute"]],
 ["idoit", ["idiot"]],
 ["terrrible", ["terrible"]],
 ["trnsposition", ["transposition"]]
]);
const checker = {
 correct: word => !knownErrors.has(word),
 suggest: word => knownErrors.get(word) || []
};
const technique = { id: "deliberate_errors", title: "Deliberate errors",
 category: "Attention and memory" };
const markedWords = text => findSpellingBait(text, checker, technique)
 .map(m => text.slice(m.start, m.end));

assert.deepEqual(markedWords("This is absoloute nonsense."), ["absoloute"],
 "An obvious one-letter misspelling is a possible hook");
assert.deepEqual(markedWords("Only an idoit would say that."), ["idoit"],
 "A transposed-letter typo can be identified");
assert.deepEqual(markedWords("A terrrible, terrrible idea."), ["terrrible", "terrrible"],
 "Repeated occurrences retain separate offsets");
assert.deepEqual(markedWords("This is an absolute disaster."), [],
 "Correct spelling does not trigger an engagement-bait warning");
assert.deepEqual(markedWords("Reddit and WhatsApp users discussed this."), [],
 "Capitalised brands and proper names are skipped");
assert.deepEqual(markedWords("https://example.org/absoloute @idoit #terrrible"), [],
 "Links, mentions and hashtags are not flagged");
assert.deepEqual(markedWords("Absoloute claims are interesting."), [],
 "Conservative pass does not guess title-cased words");
assert.deepEqual(markedWords("We checked absoloute and idoit."),
 ["absoloute", "idoit"], "Different errors receive their own word underlines");
assert.deepEqual(markedWords("This is an idoit."), ["idoit"]);
const capped = findSpellingBait("terrrible ".repeat(20), checker, technique);
assert.equal(capped.length, 8, "Too many warnings would make the page unreadable");
assert.deepEqual(findSpellingBait("absoloute", null, technique), [],
 "Unavailable dictionaries degrade safely");
assert.deepEqual(findSpellingBait("absoloute", checker, null), [],
 "Missing catalogue entry degrades safely");
console.log("Possible correction bait: local matching and false-positive guards passed.");
