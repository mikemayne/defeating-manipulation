"""Run actual Edge/Chromium WASM inference and exercise the offline browser UI."""
import argparse
import json
import platform
import threading
from contextlib import ExitStack
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

from prepare import ARTIFACTS, CANDIDATES
from serve import create_server

BENCHMARK = """
async (name) => {
  const { loadManifest, loadClassifier } = await import('/inference.js');
  const manifest = await loadManifest();
  const inputs = [
    ['The whole office uses it, so you should too.', 'Software'],
    ['The sign says the path to the left is closed for repairs until Friday.', ''],
    ['Maybe that explains those words.', ''],
    ['The pond cleared a day after we replaced the gate. The new gate must have cleaned the water.',
      'The park pond'],
  ];
  const model = manifest.models.find(candidate => candidate.name === name);
  let start = performance.now();
  const classifier = await loadClassifier(manifest, model.name);
  const load = performance.now() - start;
  start = performance.now();
  await classifier.analyse(...inputs[0]);
  const firstMs = performance.now() - start;
  const parity = [];
  for (const probe of model.probes) {
    const observed = await classifier.analyse(probe.text, probe.topic);
    if (observed.tokenIds.some((id, i) => id !== probe.tokenIds[i])) {
      throw new Error('Python/browser token IDs diverged');
    }
    parity.push(...observed.logits.map((value, i) => Math.abs(value - probe.logits[i])));
    if (!observed.scores.every(label => Number.isFinite(label.score) &&
        label.score >= 0 && label.score <= 1)) throw new Error('Invalid confidence scores');
  }
  const samples = [];
  for (let index = 0; index < 40; index++) {
    const input = inputs[index % inputs.length];
    start = performance.now();
    await classifier.analyse(...input);
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  const statuses = [];
  for (const input of inputs) statuses.push((await classifier.analyse(...input)).status);
  if ((await classifier.analyse('   ')).status !== 'insufficient_context') {
    throw new Error('Blank text should abstain');
  }
  await classifier.release();
  return {
    session_load_ms: load, first_statement_ms: firstMs,
    warm_p50_ms: (samples[19] + samples[20]) / 2, warm_p95_ms: samples[37],
    samples: samples.length, max_python_browser_logit_delta: Math.max(...parity), statuses,
  };
}
"""

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--channel", default="msedge")
    args = parser.parse_args()
    with create_server(0) as server, sync_playwright() as playwright, ExitStack() as cleanup:
        threading.Thread(target=server.serve_forever, daemon=True).start()
        cleanup.callback(server.shutdown)
        origin = f"http://127.0.0.1:{server.server_port}"
        browser = playwright.chromium.launch(channel=args.channel)
        cleanup.callback(browser.close)
        blocked = []

        def restrict(route):
            if urlparse(route.request.url)[:2] == urlparse(origin)[:2]:
                route.continue_()
            else:
                blocked.append(route.request.url)
                route.abort()

        results = {}
        for name in CANDIDATES:
            page = browser.new_page(service_workers="block")
            page.route("**/*", restrict)
            page.goto(origin)
            results[name] = page.evaluate(BENCHMARK, name)
            page.close()
        page = browser.new_page(service_workers="block")
        page.route("**/*", restrict)
        page.goto(origin)
        page.locator("#phrase").fill("Every team adopted this tool, so you should adopt it too.")
        page.locator("#topic").fill("Planning")
        page.locator("#analyse").click()
        page.locator("#scores li").first.wait_for()
        report = dict(models=results, backend="WASM, one thread", browser_version=browser.version,
                      platform=platform.platform(), processor=platform.processor(),
                      external_requests=blocked, ui_smoke=True)
        (ARTIFACTS / "browser.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf8")
        print(json.dumps(report, indent=2))
        if blocked or any(model["max_python_browser_logit_delta"] > 0.15
                          for model in report["models"].values()):
            raise RuntimeError("Browser network isolation or Python/WASM logit parity failed.")

if __name__ == "__main__":
    main()
