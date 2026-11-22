"""Score the locked distillation holdout through the actual Edge WASM classifier."""
import json
import threading
from contextlib import ExitStack

import numpy as np
from playwright.sync_api import sync_playwright

from distill import EXPERIMENT, MODELS, OUTPUT, load_rows
from prepare import ARTIFACTS
from qwen_bench import KEYS, metrics
from serve import create_server
from train import read, save

INFER = """
async texts => {
  const output = [];
  for (const text of texts) {
    const start = performance.now();
    const result = await window.heldoutModel.analyse(text);
    output.push({
      elapsed: performance.now() - start,
      keys: result.status === 'insufficient_context' ? ['insufficient_context']
        : result.scores.filter(item => item.detected).map(item => item.id),
    });
  }
  return output;
}
"""

def score_in_browser(test, web, model_names, keys, latency_budget):
    results = {"candidates": {}, "budget_warm_p95_ms": latency_budget}
    traces = {}
    with (create_server(0, web) as server,
          sync_playwright() as playwright, ExitStack() as cleanup):
        threading.Thread(target=server.serve_forever, daemon=True).start()
        cleanup.callback(server.shutdown)
        browser = playwright.chromium.launch(channel="msedge")
        cleanup.callback(browser.close)
        results["browser_version"] = browser.version
        origin = f"http://127.0.0.1:{server.server_port}"
        blocked = []
        def restrict(route):
            if route.request.url.startswith(origin + "/"):
                route.continue_()
            else:
                blocked.append(route.request.url)
                route.abort()
        models = {model["name"]: model for model in read(web / "manifest.json")["models"]}
        for name in model_names:
            print(f"Scoring {name} on {len(test)} held-out excerpts in Edge", flush=True)
            page = browser.new_page(service_workers="block")
            page.route("**/*", restrict)
            page.goto(origin)
            load_ms = page.evaluate("""async name => {
              const api = await import('/inference.js');
              const manifest = await api.loadManifest();
              const start = performance.now();
              window.heldoutModel = await api.loadClassifier(manifest, name);
              return performance.now() - start;
            }""", name)
            warm = page.evaluate(INFER, ["The vote took place on Friday."] * 5)
            predictions = []
            for start in range(0, len(test), 24):
                predictions.extend(page.evaluate(INFER, [r["text"] for r in test[start:start + 24]]))
            page.close()
            if len(predictions) != len(test):
                raise RuntimeError("Browser predictions are incomplete.")
            elapsed = [pred["elapsed"] for pred in predictions]
            rows = [{**{k: row[k] for k in ("qwen", "id", "track")},
                     "browser": [keys.index(key) for key in pred["keys"]]}
                    for row, pred in zip(test, predictions)]
            p50, p95 = np.quantile(elapsed, [0.5, 0.95]).tolist()
            results["candidates"][name] = {
                "model_bytes": models[name]["int8_bytes"], "session_load_ms": load_ms,
                "first_result_ms": warm[0]["elapsed"], "warm_p50_ms": p50, "warm_p95_ms": p95,
                "within_budget": p95 <= latency_budget, "overall": metrics(rows, keys),
                "tracks": {track: metrics([row for row in rows if row["track"] == track], keys)
                           for track in sorted({row["track"] for row in rows})},
            }
            traces[name] = rows
            print(f"{name}: F1 {results['candidates'][name]['overall']['micro_f1_pct']}%, "
                  f"warm p95 {p95:.1f} ms", flush=True)
        results["external_browser_requests"] = len(blocked)
        if blocked:
            raise RuntimeError("Browser attempted to contact non-loopback URLs.")
    return results, traces

def main():
    partition = read(EXPERIMENT / "split.json")
    by_hash = {r["id"]: r for r in load_rows()}
    test = [by_hash[identifier] for identifier in partition["splits"]["test"]]
    latency_budget = 2 * read(ARTIFACTS / "browser.json")["models"]["MiniLM-L6"]["warm_p95_ms"]
    results, traces = score_in_browser(test, OUTPUT, MODELS, KEYS, latency_budget)
    results.update(split_sizes={name: len(ids) for name, ids in partition["splits"].items()},
                   label_support=partition["support"], original_browser=partition["baseline"])
    save(EXPERIMENT / "browser.json", results)
    save(EXPERIMENT / "predictions.json", traces)
    print(json.dumps({"original": results["original_browser"]["micro_f1_pct"],
                      "distilled": {k: v["overall"]["micro_f1_pct"]
                                    for k, v in results["candidates"].items()}}))

if __name__ == "__main__":
    main()
