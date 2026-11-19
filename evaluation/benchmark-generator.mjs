// Deterministic, lazy generation of test passages from human-labelled seeds.
// This is a stress/regression generator, NOT a source of independent ground truth.
const INTRO = [
 "The committee reviewed the agenda before discussing the next item.",
 "The newspaper also reported a routine change to the timetable.",
 "A short introduction described the background to the discussion.",
 "The chair confirmed the date of the next public meeting.",
 "The document was circulated to everyone earlier that morning.",
 "The report gave the location and date of the public consultation."
];
const OUTRO = [
 "The meeting ended with an ordinary administrative announcement.",
 "A separate paragraph explained how to obtain a copy of the report.",
 "The next section gave a factual update on the timetable.",
 "The final note recorded the contact details for the enquiries team.",
 "The article concluded with a neutral description of the event.",
 "The minutes were approved and filed for reference."
];

function hash(value) {
 let x = value >>> 0;
 x ^= x >>> 16;
 x = Math.imul(x, 0x7feb352d);
 x ^= x >>> 15;
 x = Math.imul(x, 0x846ca68b);
 return (x ^ (x >>> 16)) >>> 0;
}
export function wrapLines(text) {
 return text.replace(/,\s+/g, ",\n").replace(/\s+or\s+/gi, "\nor\n")
  .replace(/\s+so\s+/gi, "\nso\n").replace(/\s+because\s+/gi, "\nbecause\n");
}
export function generatedCase(seeds, index, seed = 2026) {
 if (!seeds.length) throw Error("No labelled seeds supplied");
 const item = seeds[index % seeds.length];
 const h = hash(index + (seed >>> 0));
 const variant = (Math.floor(index / seeds.length) + h % 8) % 8;
 const intro = INTRO[h % INTRO.length], outro = OUTRO[(h >>> 4) % OUTRO.length];
 let text = item.text;
 let expected = [...new Set(item.expected || [])];
 switch (variant) {
  case 0: break;
  case 1: text = intro + "\n" + text; break;
  case 2: text += "\n" + outro; break;
  case 3: text = intro + "\n" + text + "\n" + outro; break;
  case 4: text = wrapLines(text); break;
  case 5: text = intro + "\n\n" + wrapLines(text) + "\n\n" + outro; break;
  case 6: {
   const padding = Array.from({ length: 8 + h % 8 },
    (_, i) => INTRO[(h + i) % INTRO.length]).join("\n");
   text = padding + "\n" + text + "\n" + padding;
   break;
  }
  case 7: {
   // Multiple independently-labelled techniques in the same selection.
   const other = seeds[(index + 1 + (h % (seeds.length - 1 || 1))) % seeds.length];
   text = text + "\n" + other.text;
   expected = [...new Set([...expected, ...(other.expected || [])])];
   break;
  }
 }
 return { id: item.id + "/generated-" + index, text, expected, variant };
}
export function validateSeeds(seeds, techniqueIds) {
 if (!Array.isArray(seeds) || !seeds.length) throw Error("The dataset has no examples");
 const ids = new Set(techniqueIds);
 const seen = new Set();
 for (const [index, item] of seeds.entries()) {
  if (!item || typeof item.id !== "string" || !item.id ||
      typeof item.text !== "string" || !item.text.trim() ||
      !Array.isArray(item.expected) || item.expected.some(id => !ids.has(id))) {
   throw Error("Invalid text or labels in example " + (index + 1));
  }
  if (seen.has(item.id)) throw Error("Duplicate example ID " + item.id);
  seen.add(item.id);
 }
 return seeds;
}
