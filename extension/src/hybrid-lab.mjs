const form = document.querySelector("form");
const run = document.querySelector("#run");
const cancel = document.querySelector("#cancel");
const status = document.querySelector("#status");
const trace = document.querySelector("#trace");
const findings = document.querySelector("#findings");
let worker;

function finish(message) {
 worker?.terminate();
 worker = undefined;
 run.disabled = false;
 cancel.disabled = true;
 status.textContent = message;
}

cancel.addEventListener("click", () => finish("Analysis cancelled."));
form.addEventListener("submit", event => {
 event.preventDefault();
 if (worker) return;
 trace.textContent = "";
 findings.replaceChildren();
 run.disabled = true;
 cancel.disabled = false;
 status.textContent = "Analysing locally…";
 worker = new Worker(new URL("./hybrid-lab-worker.mjs", import.meta.url), { type: "module" });
 worker.addEventListener("error", () => finish("Analysis worker failed."));
 worker.addEventListener("message", ({ data }) => {
  if (data.error) return finish(data.error);
  if (data.stage) {
   status.textContent = data.stage;
   return;
  }
  const result = data.result;
  const supported = result.scopes.flatMap(scope => scope.patterns.filter(pattern => pattern.state === "supported"));
  supported.sort((a, b) => b.supportScore - a.supportScore);
  for (const item of supported) {
   const entry = document.createElement("li");
   entry.textContent = item.id + " — " + item.evidence.map(span =>
    span.activity ? "Prior activity implied: " + span.activity.quote :
     (span.kind === "examined_scope" ? "Examined passage: " : "") + span.quote).join(" / ");
   findings.append(entry);
  }
  trace.textContent = JSON.stringify(result, null, 2);
  const unresolved = result.scopes.reduce((count, scope) => count +
   scope.trace.filter(item => item.status !== "not_asked" &&
    !["yes", "no", "not_applicable"].includes(scope.answers[item.id].answer)).length, 0);
  finish((supported.length ? "Provisional findings shown." : "No supported match in this run.") +
   " Model calls: " + result.calls + ". Elapsed: " + (data.milliseconds / 1000).toFixed(1) + " s." +
   (unresolved ? " Unresolved questions attempted: " + unresolved + "." : "") +
   (result.truncated ? " Input was truncated." : ""));
 });
 worker.postMessage({
  text: document.querySelector("#passage").value,
  model: document.querySelector("#model").value,
  complete: document.querySelector("#complete").checked
 });
});
