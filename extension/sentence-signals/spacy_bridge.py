import json
import sys

import spacy

nlp = spacy.load("en_core_web_sm")


def is_subject(token):
    while token.dep_ == "conj" and token.head != token:
        token = token.head
    return token.dep_ in {"nsubj", "nsubjpass"}


def parse(text):
    doc = nlp(text)
    spans = {chunk.root.i: chunk.text for chunk in doc.noun_chunks}
    return [
        {
            "index": token.i,
            "offset": token.idx,
            "text": token.text,
            "lower": token.lower_,
            "lemma": token.lemma_,
            "pos": token.pos_,
            "dep": token.dep_,
            "subject": is_subject(token),
            "head": token.head.i,
            "entity": token.ent_type_,
            "number": next(iter(token.morph.get("Number")), ""),
            "span": spans.get(token.i, token.text),
        }
        for token in doc
    ]


for line in sys.stdin:
    documents = json.loads(line)
    print(json.dumps([parse(text) for text in documents]), flush=True)
