// Independent, paragraph-by-paragraph input preparation for the second analyser.
// Do not feed sentence-level matches or other classifier output into this module.
export const MAX_PARAGRAPH_CHARS = 1200;

export function normaliseParagraphInputs(paragraphs) {
 if (!Array.isArray(paragraphs)) throw TypeError("Expected an array of paragraphs");
 const ids = new Set();
 return paragraphs.map((paragraph, index) => {
  const object = typeof paragraph === "string" ? { text: paragraph } : paragraph;
  if (!object || typeof object.text !== "string")
   throw TypeError("Paragraph " + (index + 1) + " needs a text string");
  const id = object.id == null ? "paragraph-" + index : String(object.id);
  if (ids.has(id)) throw Error("Duplicate paragraph ID: " + id);
  ids.add(id);
  return { id, index, original: object.text.replace(/\s+/g, " ").trim() };
 });
}

// Preserve the communicated point, not merely the factual subject. In
// particular, a neutralised summary ("the author discusses X") destroys the
// persuasive implication that the *same analyser* must inspect in pass two.
export function paraphrasePrompt(paragraph) {
 return "Rewrite the paragraph in clearer, simpler language without changing " +
  "what it communicates to the reader. FIRST identify the sentence or phrase " +
  "that carries the paragraph's strongest persuasive or potentially misleading " +
  "point. Give that point PRIMARY WEIGHT in the rewrite: keep its actual " +
  "assertion and implication clear and prominent, even if it occupies only " +
  "a few words in the original. Preserve implied accusations, suggested " +
  "causal links, social pressure, implied consequences and insinuations. " +
  "Make the communicated implication explicit when the wording strongly " +
  "supports it, while distinguishing it from a stated fact (e.g. 'suggests " +
  "that' rather than 'proves that'). Preserve every separate claim, " +
  "qualification, negation, attribution, number and stated reason. " +
  "Do NOT bury the key persuasive point under background facts or " +
  "neutralise it into a vague topic summary; do NOT " +
  "add a new accusation or inference that is not supported by the text. " +
  "Do NOT label any manipulation pattern or judge whether the point is true. " +
  "Output only the rewritten paragraph.\n\n" +
  "Paragraph: " + paragraph + "\n\nParaphrase:";
}

function numericTokens(text) {
 return [...text.matchAll(/\b\d+(?:[.,]\d+)*(?:%|\b)/g)]
  .map(match => match[0]).sort();
}
function negationCount(text) {
 return (text.match(/\b(?:not|never|no|none|neither|without|cannot|can't|won't|don't|doesn't|didn't|isn't|aren't|wasn't|weren't|shouldn't|couldn't|wouldn't|mustn't)\b/gi) || []).length;
}

export function assessParaphrase(original, paraphrase) {
 const issues = [];
 if (!paraphrase) return ["empty_output"];
 if (paraphrase.toLowerCase() === original.toLowerCase()) issues.push("unchanged");
 if (paraphrase.length < Math.max(22, original.length * 0.28))
  issues.push("possible_omission");
 if (paraphrase.length > Math.max(300, original.length * 2.5))
  issues.push("possible_addition");
 if (JSON.stringify(numericTokens(original)) !== JSON.stringify(numericTokens(paraphrase)))
  issues.push("number_mismatch");
 if (negationCount(original) !== negationCount(paraphrase))
  issues.push("negation_mismatch");
 return issues;
}

function generatedText(response) {
 if (typeof response === "string") return response.trim();
 if (Array.isArray(response) && typeof response[0]?.generated_text === "string")
  return response[0].generated_text.trim();
 if (typeof response?.generated_text === "string") return response.generated_text.trim();
 throw Error("Text generator returned no paraphrase");
}

// Each output preserves the source ID for attaching the later paragraph marker.
// status=ready is the only status suitable for automatic second-pass analysis;
// review requires inspection, while skipped/error cannot be analysed.
// The deterministic checks are *not* a guarantee of semantic fidelity.
export async function paraphraseParagraphs(paragraphs, generate, {
 onProgress = () => {}, isCancelled = () => false, maxParagraphChars = MAX_PARAGRAPH_CHARS
} = {}) {
 if (typeof generate !== "function") throw TypeError("A text generator is required");
 const inputs = normaliseParagraphInputs(paragraphs), results = [];
 for (const paragraph of inputs) {
  if (isCancelled()) throw Error("Paraphrasing cancelled");
  let result = { ...paragraph, paraphrase: null, status: "skipped", issues: [] };
  if (!paragraph.original) {
   result.issues = ["empty_paragraph"];
  } else if (paragraph.original.length > maxParagraphChars) {
   // Never silently truncate an argument; that can reverse its meaning.
   result.issues = ["paragraph_too_long"];
  } else {
   try {
    const tokens = Math.min(256, Math.max(72,
     Math.ceil(paragraph.original.split(/\s+/).length * 1.9)));
    const raw = await generate(paraphrasePrompt(paragraph.original), {
     max_new_tokens: tokens, do_sample: false, num_beams: 1
    });
    const paraphrase = generatedText(raw).replace(/^Paraphrase:\s*/i, "");
    const issues = assessParaphrase(paragraph.original, paraphrase);
    result = { ...result, paraphrase, status: issues.length ? "review" : "ready", issues };
   } catch (error) {
    result = { ...result, status: "error",
     issues: ["generation_failed"], error: String(error?.message || error) };
   }
  }
  results.push(result);
  onProgress({ completed: results.length, total: inputs.length, paragraph: result });
  // Yield between paragraphs so a Worker can handle stop messages.
  await new Promise(resolve => setTimeout(resolve, 0));
 }
 return results;
}
