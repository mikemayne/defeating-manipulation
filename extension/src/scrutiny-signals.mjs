// Advisory fallback for strongly converging weak signals.
// This never guesses author intent or upgrades uncertainty into a named pattern.
import { windows } from "./text-windows.mjs";

const SIGNALS = [
 { id: "pressure", label: "pressure on the reader",
  re: /\b(?:you|we)\s+(?:must|need to|have to|cannot afford to|can't afford to)\b|\b(?:must|need to|have to)\s+(?:agree|accept|believe|support)\b/i },
 { id: "certainty", label: "unqualified certainty",
  re: /\b(?:obviously|undeniably|unquestionably|inevitably|everyone knows|there is no doubt|beyond any doubt|cannot be questioned|can't be questioned)\b/i },
 { id: "emotional_stakes", label: "strongly emotive stakes",
  re: /\b(?:catastrophe|catastrophic|disastrous|devastating|terrifying|horrifying|shameful|traitorous|disgusting|ruinous|ruined|destroyed|destroying)\b/i },
 { id: "urgency", label: "pressure for immediate action",
  re: /\b(?:immediately|right now|at once|before it['’]s too late|now or never|no time to (?:question|think|debate))\b/i },
 { id: "consequences", label: "threatened consequences",
  re: /\b(?:otherwise|or else|if you (?:do not|don't|refuse to|fail to)|you will (?:regret|suffer|pay the price)|risk everything)\b/i },
 { id: "agreement", label: "presumed agreement or exclusion of dissent",
  re: /\b(?:anyone who (?:disagrees|questions|objects|refuses)|no reasonable person|only a fool|the only acceptable choice)\b/i }
];
const ADVISORY = Object.freeze({
 id: "deserves_scrutiny",
 title: "Deserves scrutiny",
 category: "Scrutiny",
 summary: "Several different signals suggest this wording is worth examining, but no specific manipulation pattern has been identified. Check the context and supporting argument; this is not a verdict."
});
const overlap = (a, b) => a.start < b.end && a.end > b.start;

// Weak signals must come from different families, not repeated occurrences
// of one expressive word. Model signals are optional; no model is required.
export function findScrutinyWarnings(source,
 { findings = [], nearMisses = [], argumentDiagnostics = [], maxFindings = 6 } = {}) {
 if (typeof source !== "string" || !source.trim() || maxFindings < 1) return [];
 const candidates = [];
 for (const part of windows(source)) {
  if (part.text.length < 55 || part.text.length > 500 ||
      (part.text.match(/\b[\w'-]+\b/g) || []).length < 9) continue;
  // Contextual model windows can cross unrelated paragraphs. Orange cannot.
  if (part.contextual && (part.sourceEnd - part.sourceStart > 300 ||
      source.slice(part.sourceStart, part.sourceEnd).includes("\n"))) continue;
  const span = { start: part.start, end: part.end };
  if (findings.some(item => overlap(span, item))) continue;
  const lexical = SIGNALS.filter(signal => signal.re.test(part.text));
  if (!lexical.some(item => ["pressure", "certainty", "agreement"].includes(item.id)))
   continue;
  const semantic = nearMisses.some(item => item.score >= 0.63 &&
   overlap(span, item));
  const argument = argumentDiagnostics.some(item =>
   item.status === "evidential_support_uncertain" &&
   typeof item.conclusion === "string" && part.text.includes(item.conclusion) &&
   item.comparisons?.some(c => c.forward?.neutral >= 0.78));
  // Require >=4 separate lexical families without ML, or a combination
  // of multiple textual cues and independent model observations.
  if (!(lexical.length >= 4 ||
        (lexical.length >= 3 && (semantic || argument)) ||
        (lexical.length >= 2 && semantic && argument))) continue;
  const signals = lexical.map(item => item.label);
  if (semantic) signals.push("similarity to known patterns without a reliable match");
  if (argument) signals.push("uncertain support for a stated conclusion");
  candidates.push({ ...span, kind: "scrutiny", technique: ADVISORY,
   method: "multi_signal", strength: "Review context", signals,
   score: Math.min(1, signals.length / 8) });
 }
 // Prefer local spans to contextual ones when both explain the same text.
 // Never blanket-highlight a paragraph or cover a recognised result.
 candidates.sort((a, b) => b.signals.length - a.signals.length ||
  (a.end - a.start) - (b.end - b.start) || a.start - b.start);
 const selected = [];
 for (const item of candidates) {
  if (!selected.some(other => overlap(item, other))) selected.push(item);
  if (selected.length >= maxFindings) break;
 }
 return selected.sort((a, b) => a.start - b.start);
}
