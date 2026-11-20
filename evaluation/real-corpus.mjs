// Shared browser/Node validation for authentic, source-linked argument samples.
// A human label is set before running the model. No auto-generated or guessed labels.
export const REAL_LABELS = [
 "supported_conclusion", "unsupported_conclusion",
 "contradictory_claims", "none", "uncertain"
];
export const REAL_TRACKS = ["natural", "challenge"];

export function validateRealEntry(raw) {
 if (!raw || typeof raw !== "object") throw Error("Invalid annotation");
 const label = raw.label || (
  Array.isArray(raw.expected) && raw.expected.length === 1
   ? raw.expected[0] : Array.isArray(raw.expected) && raw.expected.length === 0
    ? "none" : ""
 );
 const title = String(raw.source_title || "").trim();
 const url = String(raw.source_url || "").trim();
 const text = String(raw.text || "").trim();
 const id = String(raw.id || "").trim();
 const track = String(raw.track || "").trim();
 const rationale = String(raw.rationale || "").trim();
 if (!id || id.length > 128) throw Error("Annotation requires a stable ID");
 if (!title || title.length > 220) throw Error("Provide a source title");
 if (!REAL_TRACKS.includes(track)) throw Error("Choose a sampling strategy");
 if (!REAL_LABELS.includes(label)) throw Error("Choose an independent human label");
 if (text.length < 20 || text.length > 20000)
  throw Error("Passage must be 20–20,000 characters");
 let parsed;
 try { parsed = new URL(url); } catch { throw Error("Provide a valid source URL"); }
 if (!["https:", "http:"].includes(parsed.protocol) || !parsed.hostname ||
     parsed.username || parsed.password)
  throw Error("Source URL must be an ordinary public HTTP(S) link");
 if (rationale.length > 5000) throw Error("Keep the rationale below 5,000 characters");
 return { id, text, source_title: title, source_url: parsed.href,
  track, label, rationale };
}

export function toRealBenchmark(annotations) {
 const verified = annotations.map(validateRealEntry);
 const seen = new Set();
 for (const item of verified) {
  if (seen.has(item.id)) throw Error("Duplicate annotation ID: " + item.id);
  seen.add(item.id);
 }
 const cases = verified.filter(item => item.label !== "uncertain").map(item => ({
  id: item.id, text: item.text,
  expected: item.label === "none" ? [] : [item.label],
  group: "authentic_" + item.track,
  track: item.track,
  source_title: item.source_title,
  source_url: item.source_url,
  rationale: item.rationale
 }));
 return { version: 1, description:
  "Verbatim real-world excerpts with independent human labels assigned before model inference. Preserve provenance; do not interpret this as an external truth guarantee.",
  dataset_type: "authentic_human_labelled", cases };
}

export function tallyRealAnnotations(annotations) {
 const counts = { total: 0, natural: 0, challenge: 0, excluded: 0,
  supported_conclusion: 0, unsupported_conclusion: 0, contradictory_claims: 0, none: 0 };
 for (const raw of annotations) {
  const item = validateRealEntry(raw);
  counts.total++;
  counts[item.track]++;
  if (item.label === "uncertain") counts.excluded++;
  else counts[item.label]++;
 }
 return counts;
}
