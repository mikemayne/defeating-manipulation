// Variations preserve the tested relationship. Unlike the generic manipulation
// generator, never concatenate two unrelated test cases into one argument.
const INTRO = [
 "The newsletter reported a routine administrative update.",
 "The meeting began with a review of last month's figures.",
 "A brief notice gave the venue and publication date.",
 "The article mentioned an unrelated change in the timetable."
];
const OUTRO = [
 "The minutes were later approved and filed.",
 "A separate note described the next public meeting.",
 "The final paragraph contained ordinary contact details.",
 "The calendar listed the following week's opening times."
];
export function generatedConcealedCase(cases, index, seed = 2026) {
 if (!cases.length) throw Error("No concealed-pattern test cases");
 const item = cases[index % cases.length];
 const variant = Math.floor(index / cases.length) % 5;
 const h = Math.abs((Math.imul(index + 1, 1664525) + (seed >>> 0)) | 0);
 const intro = INTRO[h % INTRO.length], outro = OUTRO[(h >>> 4) % OUTRO.length];
 let text = item.text;
 if (variant === 1) text = intro + "\n\n" + text;
 else if (variant === 2) text += "\n\n" + outro;
 else if (variant === 3) text = intro + "\n\n" + text + "\n\n" + outro;
 else if (variant === 4) text = text.replace(/\.\s+(?=[A-Z])/g, ".\n");
 return { ...item, id: item.id + "/generated-" + index, text, variant };
}
