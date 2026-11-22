"""Local contextual signals for the article/comment pilot."""

import json
import re
import sys

import spacy
import torch
from transformers import AutoModelForMaskedLM, AutoTokenizer, pipeline


DISCOURSE_MODEL = "google-bert/bert-base-uncased"
QA_MODEL = "deepset/minilm-uncased-squad2"
CONNECTIVES = {"reason": "because", "result": "therefore", "contrast": "however",
               "elaboration": "specifically", "addition": "also", "time": "then"}
FUTURE = re.compile(r"\b(?:will|shall|might|may|could|going to|tomorrow|next week)\b|['’]ll\b", re.I)
REPORTING = {"say", "tell", "claim", "write", "report", "argue", "allege", "warn", "state", "announce"}
PRONOUN = {"i", "we", "you", "he", "she", "it", "they"}
LEADING = re.compile(r"^\s*(?:however|therefore|specifically|also|then|nevertheless|meanwhile|instead),\s+", re.I)
OPEN_EVENT = re.compile(r"^(?:(?:you|we|they) (?:will |may )?)?(?:find out|see)\b|\b(?:what happens|what is coming|what comes next)\b", re.I)


def attribution(doc):
    evidence = []
    for token in doc:
        if token.lemma_ in REPORTING and token.pos_ == "VERB":
            evidence.extend(child for child in token.children if child.dep_ in {"nsubj", "nsubjpass"})
        if token.lower_ == "according" and token.i + 1 < len(doc) and doc[token.i + 1].lower_ == "to":
            evidence.extend(child for child in doc[token.i + 1].children if child.dep_ == "pobj")
    def category(source):
        if source.lower_ in PRONOUN:
            return "pronominal"
        if source.ent_type_ in {"PERSON", "ORG", "GPE", "NORP"} or source.pos_ == "PROPN":
            return "named"
        return "described"
    return {f"attribution.{kind}": int(any(category(source) == kind for source in evidence))
            for kind in ("named", "described", "pronominal")}


def discourse(pairs):
    tokenizer = AutoTokenizer.from_pretrained(DISCOURSE_MODEL)
    model = AutoModelForMaskedLM.from_pretrained(DISCOURSE_MODEL).eval()
    candidates = [tokenizer.encode(word, add_special_tokens=False) for word in CONNECTIVES.values()]
    if any(len(ids) != 1 for ids in candidates):
        raise RuntimeError("A discourse connective is not a single model token")
    ids = [row[0] for row in candidates]
    result = []
    for offset in range(0, len(pairs), 16):
        batch = pairs[offset:offset + 16]
        inputs = tokenizer([first for first, _ in batch],
                           [tokenizer.mask_token + ' ' + LEADING.sub('', second) for _, second in batch],
                           padding=True, truncation=True, max_length=256, return_tensors="pt")
        mask = inputs.input_ids.eq(tokenizer.mask_token_id)
        with torch.inference_mode():
            scores = model(**inputs).logits[mask].softmax(dim=-1)[:, ids].tolist()
        for (first, second), values in zip(batch, scores, strict=True):
            total = sum(values)
            result.append({"discourse.connectiveMass": total,
                           "discourse.explicitMarker": int(bool(LEADING.match(second))),
                           **{f"discourse.{key}": value / total for key, value in zip(CONNECTIVES, values)}})
    return result


def answerability(texts, features):
    qa = pipeline("question-answering", model=QA_MODEL, device=-1)
    jobs = []
    indexes = []
    for index, text in enumerate(texts):
        if FUTURE.search(text):
            indexes.append(index)
            jobs.extend({"context": text, "question": question}
                        for question in ("What is going to happen?", "When will it happen?"))
        features[index]["answerability.futureCue"] = int(bool(FUTURE.search(text)))
    if not jobs:
        return
    responses = qa(jobs, handle_impossible_answer=True, top_k=2, max_seq_len=256, batch_size=12)
    for index, event, time in zip(indexes, responses[::2], responses[1::2], strict=True):
        for key, ranks in (("event", event), ("time", time)):
            best = ranks[0]
            answer = best["answer"].strip()
            features[index][f"answerability.{key}Found"] = int(bool(answer) and
                (key != "event" or not OPEN_EVENT.search(answer)))
            features[index][f"answerability.{key}NoAnswerTop"] = int(not answer)


def main(source, output):
    torch.set_num_threads(2)
    with open(source, encoding="utf-8") as file:
        units = json.load(file)
    nlp = spacy.load("en_core_web_sm")
    rows = [attribution(doc) for doc in nlp.pipe(units["texts"], batch_size=32)]
    answerability(units["texts"], rows)
    pairs = [(units["texts"][a], units["texts"][b]) for a, b in units["pairs"]]
    with open(output, "w", encoding="utf-8") as file:
        json.dump({"sentences": rows, "pairs": discourse(pairs)}, file)


if __name__ == "__main__":
    main(*sys.argv[1:])
