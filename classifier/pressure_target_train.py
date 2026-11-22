"""Train the same browser L6 with and without a matched-pair ranking loss."""
import json
import random
import shutil
from collections import Counter

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer

import train
from distill import calibrate
from prepare import ARTIFACTS
from pressure_collect import KEYS, LABELS as TITLES, OUT
from pressure_target_collect import LABELS, RUN, SEED, load_jsonl, rate

ALL = (*LABELS, "insufficient_context")
WEB = RUN / "web"
SOURCE = ARTIFACTS / "encoders" / "MiniLM-L6"
MODELS = ("Targeted-L6", "Contrastive-L6")
# These fictional contrasts are training material only.
MATCHED = (
    (0, "Use the other entrance or I will revoke your building pass.",
     "Use the other entrance because the stairs are icy."),
    (0, "If you report the fault, I'll take your name off the shifts next week.",
     "If you report the fault, the service desk can schedule a repair next week."),
    (0, "Sign my version or I will make sure you lose your place on the team.",
     "Sign the version you checked or leave it unsigned while the dates are reviewed."),
    (0, "Remove the post tonight or I will publish your private messages.",
     "You can remove the post tonight. The public archive keeps a copy for a week."),
    (0, "Drop the appeal or I'll have your permit cancelled myself.",
     "The appeal deadline is Friday. After that, the permit automatically expires."),
    (0, "Change your vote or I'll stop paying the invoice I already owe you.",
     "Changing your vote will not affect how the invoice is paid."),
    (0, "If you tell the manager what happened, I'll put you on the midnight shift.",
     "The employee said the supervisor threatened a midnight shift. The report records the allegation."),
    (0, "Take my offer now or I will tell every shop to stop dealing with you.",
     "This offer expires next week. Other providers may have different dates."),
    (0, "Go against me at the meeting and I'll see to it that you never get another booking.",
     "If the venue is sold out after the meeting, you won't get a booking that week."),
    (0, "Agree to the change or I'll take away your access to the files.",
     "The new software update will temporarily remove access to the files."),
    (1, "You imagined that alarm. Your memory keeps inventing things, so trust my account.",
     "The alarm log shows a test at eight. You may be remembering the test."),
    (1, "You didn't see the screen turn red. You always think you see things that aren't there.",
     "I didn't see the screen turn red. Let's look at the recording."),
    (1, "You can't possibly remember that conversation right. Your memory makes up details again.",
     "I remember that conversation differently. I've kept my notes if we want to compare."),
    (1, "You think there was a noise, but it's all in your head. Don't trust what you heard.",
     "There was a noise from the vent. It's easy to mistake the sound for a door closing."),
    (1, "Your perception is wrong as usual. You should stop relying on anything you saw.",
     "The glare may have blocked part of the sign. Here is a photograph from both angles."),
    (1, "Nothing happened at the door. You're imagining things again, like you always do.",
     "The door camera shows no movement between three and four. Was it later?"),
    (1, "Your brain keeps playing tricks on you. Ignore everything you remember about the room.",
     "The room looked different after we replaced the lights. I have pictures from both days."),
    (1, "You misunderstood again. You can never trust your own reading, so take my version.",
     "You may have read the first draft. The new wording appears in section two."),
    (1, "You didn't hear that. You're too confused to know what anybody actually said.",
     "I didn't hear that part either. The written minutes might have it."),
    (1, "You made that memory up. You do it so often that your recollection means nothing.",
     "I think we remembered different dates. The booking confirmation says Tuesday."),
)

def original_scores(rows):
    web = OUT / "web"
    model = web / "Medium-L6"
    cfg = next(x["calibration"] for x in train.read(web / "manifest.json")["models"]
               if x["name"] == model.name)
    tokenizer = train.AutoTokenizer.from_pretrained(model, local_files_only=True)
    scores = train.probabilities(train.logits(train.session(model / "model-int8.onnx"), tokenizer, rows), cfg)
    return scores, np.array([item["threshold"] for item in cfg])

def review(training):
    path = RUN / "reviews.json"
    if path.exists():
        return train.read(path)
    scores, thresholds = original_scores(training)
    positives = train.targets(training, KEYS).astype(bool)
    chosen = set()
    for label in LABELS:
        k = KEYS.index(label)
        above = scores[:, k] >= thresholds[k]
        false_alarms = np.flatnonzero(above & ~positives[:, k])
        misses = np.flatnonzero(~above & positives[:, k])
        for items in (false_alarms, misses):
            ordered = sorted(items, key=lambda i: abs(scores[i, k] - thresholds[k]), reverse=True)
            chosen.update(ordered[:15])
    selected = [training[i] for i in sorted(chosen)]
    evidence = []
    for i in range(0, len(selected), 12):
        evidence.extend(rate(selected[i:i+12], review=True))
    checked = {r["id"]: result for r, result in zip(selected, evidence)}
    train.save(path, checked)
    return checked

def train_rows(fresh):
    # Reuse earlier labels as background while keeping every new thread out of that dataset.
    historical = load_jsonl(OUT / "labels.jsonl")
    rng = random.Random(SEED)
    positives = [r for r in historical if set(r["labels"]) & set(LABELS)]
    background = [r for r in historical if not set(r["labels"]) & set(LABELS)]
    rng.shuffle(background)
    checked = review(fresh)
    training = [r for r in fresh if r["id"] not in checked or (
        checked[r["id"]] is not None and sorted(r["labels"]) ==
        sorted(LABELS[e["k"]] for e in checked[r["id"]]))]
    rows = [*training, *positives, *background[:len(positives)]]
    rows = [{**r, "labels": [label for label in r["labels"] if label in LABELS]} for r in rows]
    pairs = []
    for k, positive, negative in MATCHED:
        pairs.append((len(rows), len(rows) + 1, k))
        rows.extend([{"text": positive, "labels": [LABELS[k]]}, {"text": negative, "labels": []}])
    features = TfidfVectorizer(ngram_range=(1, 2)).fit_transform([r["text"] for r in training])
    # Match reviewed positives to lexically similar Reddit negatives within the fresh training split.
    for k, label in enumerate(LABELS):
        yes = [i for i, row in enumerate(training) if label in row["labels"]]
        no = [i for i, row in enumerate(training) if label not in row["labels"]]
        similarity = (features[yes] @ features[no].T).toarray()
        pairs.extend((i, no[j], k) for i, j in zip(yes, similarity.argmax(axis=1)))
    return rows, pairs, {"reviewed": len(checked), "excluded_after_review": len(fresh)-len(training),
                         "historical_positives": len(positives), "authored_pairs": len(MATCHED)}

def main():
    gpu = train.verify_gpu()
    data = load_jsonl(RUN / "labels.jsonl")
    parts = {p: [r for r in data if r["part"] == p] for p in ("train", "calibration", "test")}
    support = {p: dict(Counter(label for r in rows for label in r["labels"])) for p, rows in parts.items()}
    print("Fresh data", {p: len(rows) for p, rows in parts.items()}, support, flush=True)
    if any(support[p].get(label, 0) < 3 for p in parts for label in LABELS):
        raise ValueError("Insufficient support for a targeted mechanism.")
    rows, pairs, review_stats = train_rows(parts["train"])
    WEB.mkdir(parents=True, exist_ok=True)
    shutil.copytree(OUT / "web" / "vendor", WEB / "vendor", dirs_exist_ok=True)
    calibration = parts["calibration"]
    truth = train.targets(calibration, ALL)
    variants = []
    for name in MODELS:
        print(f"Training {name}: {len(rows)} examples and {len(pairs) if name == MODELS[1] else 0} pairs", flush=True)
        model, tokenizer = train.fit(SOURCE, rows, ALL, pairs=pairs if name == MODELS[1] else None)
        target = WEB / name
        _, int8 = train.export(model, tokenizer, target)
        shutil.copyfile(SOURCE / "README.md", target / "MODEL-CARD.md")
        raw = train.logits(train.session(int8), tokenizer, calibration)
        variants.append({"name": name, "calibration": calibrate(raw, truth), "int8_bytes": int8.stat().st_size})
    train.save(WEB / "manifest.json", {
        "maxLength": train.LENGTH, "topicLimit": train.TOPIC_LIMIT, "defaultModel": MODELS[0],
        "models": variants, "labels": [{"id": k, "title": TITLES[k][0], "summary": TITLES[k][1]} for k in ALL],
    })
    train.save(RUN / "training.json", {
        "gpu": gpu, "teacher": train.read(RUN / "teacher.json"),
        "fresh_split_sizes": {p: len(rows) for p, rows in parts.items()}, "support": support,
        "training_rows": len(rows), "matched_pairs": len(pairs), "review": review_stats,
    })

if __name__ == "__main__":
    main()
