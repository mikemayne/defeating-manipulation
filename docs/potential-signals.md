# Potential analyser signals

These are observable cues worth testing in the local analyser. Use them to nominate passages for review. A named pattern still needs evidence from the passage and its surrounding context.

| Signal | What to measure | What to check |
| --- | --- | --- |
| Headline-to-opening emotion shift | Score the headline and first body sentence separately. Keep the signed change for each emotion and the direction of any clear label change. | Read both together. Check whether the first sentence reinforces, softens, or redirects the framing. Distinguish emotion expressed in the wording from emotion attributed to a source. |
| Toploading | Compare cues in the headline and paragraph openings with those in later sentences. Track final sentences separately because they may carry the takeaway. | Test whether cues occur more often in these positions than in matched sentences from the middle. Control for sentence length and article format. |
| Uncertainty gap | Look for a specific question or promised explanation in the headline and check whether the opening answers it, defers it, or leaves it open. | An open question can reflect genuine uncertainty. Compare with examples where the opening answers the question directly or supplies a partial answer. |
| Opening hook and closing takeaway | Identify an opening cue and compare it with the closing claim. Check whether the intervening sentences support the takeaway. | Separate a topic change, an ordinary recap, and an implied conclusion. Track whether the takeaway introduces a target, judgement, or generalisation that the middle does not establish. |
| Threat followed by blame | Look for a threat in the headline or opening, then check whether the next sentence attributes responsibility for that same threat to an actor. | Require a textual link between the threat and the attribution. Test against evidence-backed attribution and quoted accusations. |

## Headline-to-opening emotion shift pilot

A November 2026 pilot used quantised [DistilBERT MNLI](https://huggingface.co/Xenova/distilbert-base-uncased-mnli) as a zero-shot scorer for ten emotions on 100 articles from The Guardian's World archive. A clear label required a score of at least 0.50 and a lead of at least 0.10 over the next label.

- 30 articles had at least one emotion score move by 0.50 or more. Only one changed from one clear label to another, and both passages in that case described the same Polish border policy without a clear shift to sadness on inspection. [Article](https://www.theguardian.com/world/2025/jul/01/poland-to-tighten-border-controls-irregular-crossings)
- In a synthetic control, two phrasings of fear that a dam might collapse produced a 0.984 increase in the anger score. The model also returned unclear labels on both sides of explicit joy-to-sadness and fear-to-anger controls.
- The pilot covered one outlet and section and had no independent reader labels. The score changes are experimental features. Test a dedicated classifier such as [GoEmotions](https://huggingface.co/SamLowe/roberta-base-go_emotions-onnx) on human-labelled headline and opening pairs before using it to drive highlighting.
