import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const host = "127.0.0.1", port = 4173;
const allowed = new Set([
 "/extension/benchmark.html",
 "/extension/src/benchmark-ui.mjs",
 "/extension/benchmark-worker.js",
 "/extension/techniques.json",
 "/extension/patterns.json",
 "/evaluation/matcher-examples.json",
 "/evaluation/inconsistency-examples.json"
]);
const mime = file => {
 if (file.endsWith(".html")) return "text/html; charset=utf-8";
 if (file.endsWith(".mjs") || file.endsWith(".js")) return "text/javascript; charset=utf-8";
 if (file.endsWith(".json")) return "application/json; charset=utf-8";
 if (file.endsWith(".wasm")) return "application/wasm";
 return "application/octet-stream";
};
const server = http.createServer((request, response) => {
 if (request.method !== "GET") {
  response.writeHead(405); response.end("Method not allowed"); return;
 }
 let pathname;
 try { pathname = decodeURIComponent(new URL(request.url, "http://" + host).pathname); }
 catch { response.writeHead(400); response.end("Invalid path"); return; }
 if (pathname === "/") {
  response.writeHead(302, { Location: "/extension/benchmark.html" });
  response.end(); return;
 }
 if (!allowed.has(pathname) && !/^\/extension\/ort\/ort-wasm[a-zA-Z0-9_.-]*\.(?:mjs|wasm)$/.test(pathname)) {
  response.writeHead(404); response.end("Not found"); return;
 }
 const filename = path.resolve(root, "." + pathname);
 if (!filename.startsWith(root + path.sep)) {
  response.writeHead(403); response.end("Forbidden"); return;
 }
 fs.stat(filename, (error, stat) => {
  if (error || !stat.isFile()) {
   response.writeHead(404); response.end("File not found. Run npm run build first.");
   return;
  }
  response.writeHead(200, {
   "Content-Type": mime(filename),
   "Content-Length": stat.size,
   "Cache-Control": "no-store",
   "X-Content-Type-Options": "nosniff"
  });
  fs.createReadStream(filename).pipe(response);
 });
});
server.listen(port, host, () => {
 console.log("Matcher Test Lab: http://" + host + ":" + port + "/extension/benchmark.html");
 console.log("Press Ctrl+C to stop the local server.");
});
