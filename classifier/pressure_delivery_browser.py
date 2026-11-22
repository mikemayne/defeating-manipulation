"""Test the browser pressure classifier on the matched delivery and emotion controls."""
import json
import threading
from contextlib import ExitStack

from playwright.sync_api import sync_playwright

from pressure_delivery_bench import CASES, EMOTIONS, MODES
from pressure_collect import KEYS, OUT
from qwen_bench import metrics
from serve import create_server

DELIVERY = {
    "directed": "The speaker addressed Jordan directly.",
    "overheard_known": "The speaker addressed Taylor and knew Jordan could hear.",
    "overheard_unknown": "The speaker addressed Taylor and did not know Jordan could hear.",
}

def summarize(rows):
    result = metrics(rows, KEYS)
    result["exact"] = sum(r["qwen"] == r["browser"] for r in rows)
    return result

def main():
    cases = []
    for i, (labels, text) in enumerate(CASES):
        cases.append(dict(id=i, qwen=labels, text=text, topic="", mode="wording_only"))
        for mode in MODES:
            cases.append(dict(id=i, qwen=labels, text=text, topic=DELIVERY[mode], mode=mode))
            if i in EMOTIONS:
                cases.append(dict(id=i, qwen=labels, text=text, mode=mode + "_emotion",
                                  topic=f"{DELIVERY[mode]} Jordan reports: {EMOTIONS[i]}"))
    with create_server(0, OUT / "web") as server, sync_playwright() as playwright, ExitStack() as cleanup:
        threading.Thread(target=server.serve_forever, daemon=True).start()
        cleanup.callback(server.shutdown)
        browser = playwright.chromium.launch(channel="msedge")
        cleanup.callback(browser.close)
        page = browser.new_page(service_workers="block")
        origin = f"http://127.0.0.1:{server.server_port}"
        blocked = []

        def restrict(route):
            if route.request.url.startswith(origin + "/"):
                route.continue_()
            else:
                blocked.append(route.request.url)
                route.abort()

        page.route("**/*", restrict)
        page.goto(origin)
        result = page.evaluate("""async cases => {
            const api = await import('/inference.js');
            const classifier = await api.loadClassifier(await api.loadManifest(), 'Medium-L6');
            const rows = [];
            for (const {id, qwen, text, topic, mode} of cases) {
                const result = await classifier.analyse(text, topic);
                rows.push({id, qwen, mode, keys: result.status === 'insufficient_context'
                    ? ['insufficient_context'] : result.scores.filter(s => s.detected).map(s => s.id)});
            }
            return rows;
        }""", cases)
        if blocked or len(result) != len(cases):
            raise RuntimeError("Browser isolation or prediction count check failed.")
        version = browser.version
    rows = [{**r, "browser": sorted(KEYS.index(key) for key in r.pop("keys"))} for r in result]
    report = {
        "model": "Medium-L6", "edge_version": version, "source": "matched fictional controls",
        "delivery": {mode: summarize([r for r in rows if r["mode"] == mode])
                     for mode in ("wording_only", *MODES)},
        "emotion": {
            name: summarize([r for r in rows if r["id"] in EMOTIONS and r["mode"] in variants])
            for name, variants in (("no_disclosure", MODES),
                                   ("disclosed", tuple(f"{m}_emotion" for m in MODES)))
        },
        "ratings": rows,
    }
    path = OUT / "delivery_browser.json"
    path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf8")
    print({section: {name: (values["exact"], values["rows"], values["micro_recall_pct"],
                            values["micro_precision_pct"]) for name, values in report[section].items()}
           for section in ("delivery", "emotion")}, flush=True)

if __name__ == "__main__":
    main()
