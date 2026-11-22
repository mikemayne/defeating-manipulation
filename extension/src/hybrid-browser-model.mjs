import { env, pipeline } from "@huggingface/transformers";
import { browserModel } from "./hybrid-browser-config.mjs";

export async function createBrowserClassifier() {
 env.allowRemoteModels = false;
 env.allowLocalModels = true;
 env.localModelPath = new URL("../models/", self.location.href).href;
 env.backends.onnx.wasm.wasmPaths = new URL("../ort/", self.location.href).href;
 env.backends.onnx.wasm.numThreads = 1;
 const generate = await pipeline("text-generation", browserModel.id, { device: "wasm", dtype: browserModel.dtype });
 return async messages => {
  const result = await generate(messages, { max_new_tokens: 112, do_sample: false });
  const answer = result[0]?.generated_text?.at(-1);
  return answer?.role === "assistant" ? answer.content : undefined;
 };
}
