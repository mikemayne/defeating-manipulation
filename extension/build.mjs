import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { mkdir, readdir, copyFile, writeFile } from "node:fs/promises";
import britishEnglish from "dictionary-en-gb";

const require = createRequire(import.meta.url);
let entry;
try {
 entry = require.resolve("onnxruntime-web");
} catch {
 entry = require.resolve("onnxruntime-web", {
  paths: [resolve("node_modules/@huggingface/transformers")]
 });
}
const dist = dirname(entry);
const destination = resolve("ort");
await mkdir(destination, { recursive: true });
const files = (await readdir(dist)).filter(name =>
 /^ort-wasm.*\.(?:mjs|wasm)$/.test(name)
);
if (!files.some(name => name.endsWith(".mjs")) ||
    !files.some(name => name.endsWith(".wasm"))) {
 throw new Error(`Could not find ONNX Runtime WASM assets in ${dist}`);
}
for (const file of files) await copyFile(join(dist, file), join(destination, file));
console.log(`Copied ${files.length} ONNX Runtime assets into extension/ort`);

// The browser worker has no access to Node filesystem APIs. Ship only local
// Hunspell data alongside the built worker; it is not fetched from the web.
await writeFile(resolve("spell-en-gb.aff"), britishEnglish.aff);
await writeFile(resolve("spell-en-gb.dic"), britishEnglish.dic);
console.log("Bundled the offline en-GB spelling dictionary");
