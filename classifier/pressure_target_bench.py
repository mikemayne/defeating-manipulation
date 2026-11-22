"""Measure the unchanged and targeted L6 models through the real Edge WASM runtime."""
import json
import threading
from contextlib import ExitStack

import numpy as np
from playwright.sync_api import sync_playwright
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics import average_precision_score, precision_recall_curve

from pressure_collect import OUT
from pressure_target_collect import LABELS, RUN, load_jsonl
from pressure_target_train import MATCHED, MODELS, WEB
from serve import create_server

GOAL = 0.50

def remove_near_duplicates(data, test):
    development = [r["text"] for r in data if r["part"] != "test"]
    development += [r["text"] for r in load_jsonl(OUT / "labels.jsonl")]
    development += [text for _, *pair in MATCHED for text in pair]
    vectorizer = TfidfVectorizer(analyzer="char", ngram_range=(3, 5), min_df=2)
    reference = vectorizer.fit_transform(development)
    test_features = vectorizer.transform([r["text"] for r in test])
    closest = (test_features @ reference.T).max(axis=1).toarray().ravel()
    return [row for row, score in zip(test, closest) if score < 0.88]

def truth(rows):
    return np.array([[label in r["labels"] for label in LABELS] for r in rows])

def choose_cutoff(expected, scores):
    precision, recall, cutoff = precision_recall_curve(expected.ravel(), scores.ravel())
    acceptable = np.flatnonzero((precision[:-1] >= GOAL) & (recall[:-1] > 0))
    if not len(acceptable):
        return None
    best = max(acceptable, key=lambda i: (recall[i], precision[i], cutoff[i]))
    return float(cutoff[best])

def summarize(expected, found, ordinary):
    tp = int((expected & found).sum())
    predicted, actual = int(found.sum()), int(expected.sum())
    return {"true_positive_labels": tp, "predicted_labels": predicted, "expected_labels": actual,
            "precision_pct": round(100 * tp / predicted, 2) if predicted else None,
            "recall_pct": round(100 * tp / actual, 2),
            "f1_pct": round(200 * tp / (predicted + actual), 2),
            "complete_misses": int(sum(expected.any(1) & ~found.any(1))),
            "ordinary_no_pressure_rows": int(sum(ordinary & ~expected.any(1))),
            "ordinary_no_pressure_flagged": int(sum(ordinary & ~expected.any(1) & found.any(1)))}

def evaluate(browser, origin, model, calibration, test):
    page = browser.new_page(service_workers="block")
    blocked = []
    def restrict(route):
        if route.request.url.startswith(origin + "/"):
            route.continue_()
        else:
            blocked.append(route.request.url)
            route.abort()
    page.route("**/*", restrict)
    page.goto(origin)
    page.evaluate("""async name => {
        const api = await import('/inference.js');
        window.detector = await api.loadClassifier(await api.loadManifest(), name);
        await window.detector.analyse('The notice went up on Monday.');
    }""", model)
    outputs = []
    for start in range(0, len(calibration) + len(test), 32):
        rows = (calibration + test)[start:start+32]
        outputs.extend(page.evaluate("""async ({texts, keys}) => {
            const output = [];
            for (const text of texts) {
                const start = performance.now();
                const result = await window.detector.analyse(text);
                const ms = performance.now() - start;
                const entries = keys.map(key => result.scores.find(item => item.id === key));
                output.push({scores: entries.map(x => x.score),
                             hits: entries.map(x => x.detected), ms});
            }
            return output;
        }""", {"texts": [r["text"] for r in rows], "keys": LABELS}))
    page.close()
    if blocked or len(outputs) != len(calibration) + len(test):
        raise RuntimeError("Browser isolation or output check failed.")
    dev, heldout = outputs[:len(calibration)], outputs[len(calibration):]
    expected, scores = truth(test), np.array([row["scores"] for row in heldout])
    ordinary = np.array([r["track"] == "ordinary" for r in test])
    cutoff = choose_cutoff(truth(calibration), np.array([row["scores"] for row in dev]))
    diagnostic_cutoff = choose_cutoff(expected, scores)
    at_cutoff = lambda t: scores >= t if t is not None else np.zeros_like(expected)
    result = {
        "shipped_thresholds": summarize(expected, np.array([row["hits"] for row in heldout]), ordinary),
        "calibration_selected_cutoff": cutoff,
        "at_calibration_cutoff": summarize(expected, at_cutoff(cutoff), ordinary),
        "test_pr_curve_at_50pct_precision": summarize(expected, at_cutoff(diagnostic_cutoff), ordinary),
        "average_precision_pct": {label: round(100 * average_precision_score(expected[:, k], scores[:, k]), 2)
                                  for k, label in enumerate(LABELS)},
        "pooled_average_precision_pct": round(100 * average_precision_score(expected.ravel(), scores.ravel()), 2),
        "warm_p95_ms": round(float(np.quantile([row["ms"] for row in heldout], 0.95)), 2),
    }
    return result, [{"id": row["id"], **prediction} for row, prediction in zip(test, heldout)]

def main():
    data = load_jsonl(RUN / "labels.jsonl")
    calibration = [r for r in data if r["part"] == "calibration"]
    heldout = [r for r in data if r["part"] == "test"]
    test = remove_near_duplicates(data, heldout)
    with (create_server(0, OUT / "web") as original, create_server(0, WEB) as targeted,
          sync_playwright() as playwright, ExitStack() as cleanup):
        for server in (original, targeted):
            threading.Thread(target=server.serve_forever, daemon=True).start()
            cleanup.callback(server.shutdown)
        browser = playwright.chromium.launch(channel="msedge")
        cleanup.callback(browser.close)
        report = {"edge": browser.version, "test_rows": len(test), "removed_near_duplicates": len(heldout)-len(test),
                  "calibration_rows": len(calibration), "target_precision_pct": 100 * GOAL, "models": {}}
        predictions = {}
        for model, server in (("Medium-L6", original), *((model, targeted) for model in MODELS)):
            print(f"Scoring {model} on {len(test)} fresh Reddit excerpts in Edge", flush=True)
            result, outputs = evaluate(browser, f"http://127.0.0.1:{server.server_port}", model, calibration, test)
            report["models"][model] = result
            predictions[model] = outputs
            print(model, result, flush=True)
    (RUN / "browser.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf8")
    (RUN / "browser_predictions.json").write_text(json.dumps(predictions, indent=2) + "\n", encoding="utf8")

if __name__ == "__main__":
    main()
