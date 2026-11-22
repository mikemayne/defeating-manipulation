"""Serve the prepared, offline classifier package on loopback."""
import argparse
import shutil
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

from prepare import ARTIFACTS, ROOT

WEB = ARTIFACTS / "web"

def stage():
    if not (WEB / "manifest.json").is_file():
        raise RuntimeError("Train and export the classifier first.")
    for asset in ("index.html", "style.css", "inference.js", "app.js"):
        shutil.copyfile(ROOT / asset, WEB / asset)

class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map,
                      ".wasm": "application/wasm", ".mjs": "text/javascript",
                      ".js": "text/javascript"}

    def end_headers(self):
        self.send_header("Content-Security-Policy",
                         "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; "
                         "object-src 'none'; frame-ancestors 'none'; connect-src 'self'")
        super().end_headers()

def create_server(port):
    stage()
    return ThreadingHTTPServer(("127.0.0.1", port), partial(Handler, directory=WEB))

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8173)
    with create_server(parser.parse_args().port) as server:
        print(f"Offline classifier at http://127.0.0.1:{server.server_port}", flush=True)
        server.serve_forever()
