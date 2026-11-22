import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { browserModel } from "../extension/src/hybrid-browser-config.mjs";

const files = [
 "config.json", "generation_config.json", "tokenizer.json",
 "tokenizer_config.json", "onnx/model_q4.onnx"
];
const target = new URL("../extension/models/" + browserModel.id + "/", import.meta.url);
const origin = "https://huggingface.co/" + browserModel.id + "/resolve/" + browserModel.revision + "/";

async function verify(file, path) {
 if (path.endsWith(".onnx")) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex") === browserModel.weightsSha256;
 }
 return (await stat(file)).size > 0;
}

for (const path of files) {
 const output = new URL(path, target);
 if (await verify(output, path).catch(error => error.code === "ENOENT" ? false : Promise.reject(error))) continue;
 await mkdir(new URL(".", output), { recursive: true });
 const temporary = new URL(path + "." + process.pid + ".part", target);
 console.log("Downloading " + path);
 try {
  const response = await fetch(origin + path, { signal: AbortSignal.timeout(180000) });
  if (!response.ok || !response.body) throw Error("Model download returned HTTP " + response.status);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary, { flags: "wx" }));
  if (!await verify(temporary, path)) throw Error("Model integrity check failed");
  await rename(temporary, output);
 } finally {
  await rm(temporary, { force: true });
 }
}
console.log("Browser model installed locally.");
