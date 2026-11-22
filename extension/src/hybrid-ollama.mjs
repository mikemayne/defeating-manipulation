export const stockModel = {
 checkpoint: "qwen3.6:27b", digest: "a50eda8ed977", quantization: "Q4_K_M",
 options: { temperature: 0, seed: 42, num_ctx: 4096, num_predict: 220 }
};

const answerSchema = {
 type: "object", additionalProperties: false,
 required: ["question_id", "answer", "evidence"],
 properties: {
  question_id: { type: "string" },
  answer: { type: "string", enum: ["yes", "no", "unknown", "not_applicable"] },
  evidence: { type: "array", items: { type: "string" }, maxItems: 3 }
 }
};

export function createOllamaClassifier() {
 return async (messages, { signal } = {}) => {
  const timeout = AbortSignal.timeout(30000);
  const response = await fetch("http://127.0.0.1:11434/api/chat", {
   method: "POST", redirect: "error", signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
   headers: { "Content-Type": "application/json" },
   body: JSON.stringify({ model: stockModel.checkpoint, messages, stream: false,
    think: false, format: answerSchema, options: stockModel.options })
  });
  if (!response.ok || !response.body) throw Error("Local inference failed");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let body = "", bytes = 0;
  try {
   while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 16384) throw Error("Response exceeds size limit");
    body += decoder.decode(value, { stream: true });
   }
  } finally {
   await reader.cancel();
  }
  const output = JSON.parse(body + decoder.decode());
  if (output.done_reason === "length") {
   const error = Error("Local inference reached its output limit");
   error.name = "OutputLimitError";
   throw error;
  }
  return output.message?.content;
 };
}
