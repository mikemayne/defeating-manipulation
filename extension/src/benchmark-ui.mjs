const $ = id => document.getElementById(id);
const mode = $("mode"), source = $("source"), count = $("count"), seed = $("seed");
const file = $("file"), runButton = $("run"), stopButton = $("stop");
const status = $("status"), progress = $("progress"), progressCount = $("progress-count");
const message = $("message"), results = $("results"), copyButton = $("copy");
let runner = null, running = false, lastResult = null, lastMode = "", lastSource = "";
let runId = 0, loadCatalogues;

const number = value => Number(value).toLocaleString("en-GB");
const percent = value => Number(value).toFixed(1) + "%";
const oneDecimal = value => Number(value).toFixed(1);

function setError(text) {
 message.textContent = text;
 message.hidden = !text;
}
function updateSource() {
 const argumentMode = mode.value === "argument_paragraph";
 // One uploaded paragraph test schema, with optional NLI labels.
 source.options[0].disabled = argumentMode;
 if (argumentMode && source.value !== "uploaded") source.value = "uploaded";
 const upload = source.value === "uploaded";
 const consistency = mode.value === "consistency";
 const positive = mode.value.startsWith("positive_");
 const concealed = mode.value.startsWith("concealed_");
 $("count-control").hidden = upload;
 $("seed-control").hidden = upload;
 $("file-control").hidden = !upload;
 count.max = consistency || argumentMode || concealed ? 10000 : 1000000;
 if (!count.dataset.edited) count.value = consistency ? 200 : argumentMode ? 96 : concealed ? 96 : positive ? 72 : 25000;
 $("dataset-note").textContent = upload
  ? argumentMode
   ? 'Upload JSON/JSONL with {id, text, expected_argument: true/false, expected_model_conclusion?: string, expected?: [] or [reasoning label]}. Omit expected for structure-only tests; include it to run the unchanged local NLI model. Nothing leaves this computer.'
   : consistency
   ? 'Upload JSON/JSONL containing {id, text, expected}, where expected is [] or ["argument_inconsistency"]. All analysis stays in this browser.'
   : concealed
   ? "Upload JSON/JSONL with {id, text, expected}, where expected contains a concealed-pattern ID (e.g. choice_with_coercion) or []. No uploads leave this browser."
   : positive
   ? "Upload JSON/JSONL containing {id, text, expected}. Expected IDs must be from the positive-pattern library. All analysis stays in this browser."
   : "Upload JSON/JSONL containing {id, text, expected} using manipulation technique IDs. All analysis stays in this browser."
  : consistency
   ? "200 labelled fictional cases: direct contradictions, paraphrases, consistent claims, different speakers/dates and hypotheticals. Generated variations test robustness, not independent accuracy."
   : concealed
   ? "96 fictional cases: 48 positive openings undermined by targeted pressure and 48 hard negatives. Tests relationships, not just green/blue co-occurrence; no intent inferred."
   : positive
   ? "72 labelled fictional cases: 36 constructive statements and 36 neutral or misleading lookalikes. Generated repetitions test stability, not independent accuracy."
   : "Generates labelled variants for the non-argument matching methods.";
}
count.addEventListener("input", () => { count.dataset.edited = "true"; });
mode.addEventListener("change", updateSource);
source.addEventListener("change", updateSource);
updateSource();

function setupWorker() {
 if (runner) return runner;
 const worker = new Worker(new URL("../benchmark-worker.js", import.meta.url), { type: "module" });
 worker.onmessage = event => {
  const data = event.data;
  if (data.type === "stage") {
   status.textContent = data.message;
  } else if (data.type === "progress" && data.runId === runId) {
   progress.max = data.total;
   progress.value = data.completed;
   progressCount.textContent = number(data.completed) + " / " + number(data.total);
   status.textContent = "Testing…";
  } else if (data.type === "done" && data.runId === runId) {
   lastResult = data.result;
   lastMode = data.mode;
   lastSource = data.source;
   progress.max = Math.max(1, data.result.requested);
   progress.value = data.result.total;
   progressCount.textContent = number(data.result.total) + " / " + number(data.result.requested);
   status.textContent = data.result.stopped ? "Stopped — partial results" : "Complete";
   renderResults(data.result);
   finish();
  } else if (data.type === "error" && data.runId === runId) {
   status.textContent = "Test failed";
   setError(data.message);
   finish();
  }
 };
 worker.onerror = event => {
  status.textContent = "Could not load test engine";
  setError("Check that you ran npm run build and opened the page using the local web server. " + (event.message || ""));
  runner?.terminate();
  runner = null;
  finish();
 };
 runner = worker;
 return worker;
}
function finish() {
 running = false;
 runButton.disabled = false;
 stopButton.disabled = true;
}
function metric(title, value) {
 const div = document.createElement("div");
 div.className = "stat";
 const main = document.createElement("div");
 main.className = "value";
 main.textContent = value;
 const detail = document.createElement("div");
 detail.className = "caption";
 detail.textContent = title;
 div.append(main, detail);
 return div;
}
function tableRows(body, rows, emptyLabel) {
 body.replaceChildren();
 if (!rows.length) {
  const tr = document.createElement("tr"), cell = document.createElement("td");
  cell.colSpan = 4;
  cell.textContent = emptyLabel;
  tr.append(cell);
  body.append(tr);
  return;
 }
 for (const columns of rows) {
  const tr = document.createElement("tr");
  columns.forEach((value, i) => {
   const cell = document.createElement("td");
   cell.textContent = String(value);
   if (i > 0) cell.className = "num";
   tr.append(cell);
  });
  body.append(tr);
 }
}
function renderResults(data) {
 results.hidden = false;
 const grid = $("stats");
 grid.replaceChildren(
  metric("Tests completed", number(data.total)),
  metric(lastMode === "argument_paragraph" ? "Exact combined checks" : "Exact classifications", percent(data.exactRate)),
  metric("Incorrect classifications", number(data.incorrect)),
  metric(lastMode === "argument_paragraph" ? "Combined label precision" : "Label precision", percent(data.precision)),
  metric(lastMode === "argument_paragraph" ? "Combined label recall" : "Label recall", percent(data.recall)),
  metric("False positive rate on negatives", percent(data.negativeFalsePositiveRate)),
  metric("Speed, cases/sec", number(Math.round(data.casesPerSecond))),
  metric("Elapsed time, seconds", oneDecimal(data.elapsedSeconds)),
  ...(data.paragraphStages ? [
   metric("Structure exact", data.paragraphStages.structure.exact+" / "+data.paragraphStages.structure.total),
   metric("Reasoning exact", data.paragraphStages.reasoning.total
    ? data.paragraphStages.reasoning.exact+" / "+data.paragraphStages.reasoning.total
    : "Not labelled")
  ] : [])
 );
 $("real-breakdown").hidden = !data.realTracks?.length;
 if (data.realTracks?.length) {
  const body = $("real-track-results");
  body.replaceChildren();
  for (const item of data.realTracks) {
   const tr = document.createElement("tr");
   for (const text of [
    item.track === "natural" ? "Natural sampling" : "Challenge sampling",
    number(item.total), percent(item.exactRate),
    percent(item.precision), percent(item.recall)
   ]) {
    const cell = document.createElement("td");
    cell.textContent = text;
    tr.append(cell);
   }
   body.append(tr);
  }
 }
 $("summary-note").textContent =
  (lastMode === "argument_paragraph"
   ? "Argument extraction always runs. Rows with the optional expected array also run local NLI and receive a separate reasoning score. The combined score mixes both stages. "
   : "") +
  "Evaluated " + number(data.total) + " cases, including " + number(data.negativeCount) +
  (lastMode === "consistency" ? " cases with no expected inconsistency." :
   lastMode.startsWith("positive_") ? " cases with no expected positive pattern." :
   lastMode.startsWith("concealed_") ? " cases with no expected concealed relationship." :
   lastMode === "argument_paragraph" ? " cases without an expected positive structural or reasoning label." :
   " cases with no expected technique.") +
  " Results describe this test dataset, not accuracy on unseen writing.";
 tableRows($("confusion"), data.confusion.slice(0, 20)
  .map(item => [item.pair, number(item.count)]), "No classification errors.");
 tableRows($("per-technique"), data.perTechnique
  .map(item => [item.id, number(item.detected) + " / " + number(item.expected),
    number(item.missed), number(item.falsePositives)]), "No technique-level results.");
 $("failure-note").textContent = data.incorrect
  ? number(data.incorrect) + " failed cases. Copy includes the confusion summary and the first " +
    number(data.capturedFailures) + " full examples" +
    (data.capturedFailures < data.incorrect ? " (sample capped at 500)." : ".")
  : "No failures in the completed test cases.";
 copyButton.disabled = data.incorrect === 0;
 $("copied").textContent = "";
}
function failureReport(data) {
 const lines = [
  "Defeating Manipulation — Matcher Test Lab",
  "Method: " + lastMode + " | Dataset: " + lastSource,
  "Tested: " + data.total + " / " + data.requested,
  "Exact: " + percent(data.exactRate) + " | Failures: " + data.incorrect,
  "Precision: " + percent(data.precision) + " | Recall: " + percent(data.recall),
  "Negative false positive rate: " + percent(data.negativeFalsePositiveRate),
  "Elapsed (seconds): " + oneDecimal(data.elapsedSeconds),
  ...(data.paragraphStages ? [
   "Structure exact: "+data.paragraphStages.structure.exact+"/"+data.paragraphStages.structure.total,
   "Reasoning exact: "+data.paragraphStages.reasoning.exact+"/"+data.paragraphStages.reasoning.total+" labelled rows"
  ] : []),
  "",
  "CONFUSION SUMMARY"
 ];
 for (const item of data.confusion) lines.push(item.pair + " = " + item.count);
 lines.push("", "PER-TECHNIQUE");
 for (const item of data.perTechnique) lines.push(item.id +
  ": " + item.detected + "/" + item.expected + " detected; " +
  item.missed + " missed; " + item.falsePositives + " false positives");
 lines.push("", "FAILURES (first " + data.capturedFailures + " of " + data.incorrect + ")");
 for (const item of data.failureSamples) {
  lines.push("\n--- " + item.id + " ---",
   "Expected: " + (item.expected.join(", ") || "(none)"),
   "Detected: " + (item.predicted.join(", ") || "(none)"),
   "Missing: " + (item.missing.join(", ") || "(none)"),
   "Extra: " + (item.extra.join(", ") || "(none)"),
   "Text:\n" + item.text);
  if (item.sourceUrl) {
   lines.push("Source: " + (item.sourceTitle || "(untitled)") +
    " | URL: " + item.sourceUrl +
    (item.sampleTrack ? " | Sampling: " + item.sampleTrack : ""));
   if (item.humanRationale) lines.push("Human rationale (assigned before testing): " + item.humanRationale);
  }
  if (item.structureCheck) {
   const c = item.structureCheck;
   lines.push("Argument structure check:",
    "  Expected argument: " + c.expectedArgument,
    "  Extracted arguments: " + c.hypotheses.length,
    "  Expected model hypothesis: " + (c.expectedModelConclusion ?? "(not labelled)"));
   for (const h of c.hypotheses)
    lines.push("  Extracted conclusion: " + h.sourceConclusion +
     " | Model hypothesis: " + h.modelConclusion +
     " | Marker: " + h.marker);
  }
  if (item.detectedPairs?.length) {
   lines.push("Model-flagged passages:");
   for (const pair of item.detectedPairs)
    lines.push("  " + pair.score + " | " + pair.text + " <> " + pair.otherText);
  }
  if (item.concealedLinks?.length) {
   lines.push("Relationship findings:");
   for (const link of item.concealedLinks)
    lines.push("  " + link.pattern + " | Positive: " + link.positive +
     " | Pressure: " + link.pressure +
     (link.relatedNegative ? " | Negative pattern: " + link.relatedNegative : ""));
  }
  if (item.argumentAssessments?.length) {
   lines.push("Premise-to-conclusion assessments:");
   for (const a of item.argumentAssessments)
    lines.push("  " + a.label + " | Score: " + a.score +
     " | Premises: " + a.premise + " | Conclusion: " + a.conclusion +
     (a.decisivePremise ? " | Decisive evidence: " + a.decisivePremise : "") +
     (a.basis ? " | Basis: " + a.basis : "") +
     (a.reason ? " | Decision: " + a.reason : "") +
     (a.inferenceMarker ? " | Marker: " + a.inferenceMarker : ""));
  }
  if (item.argumentDiagnostics?.length) {
   const fmt = n => typeof n === "number" && Number.isFinite(n) ? n.toFixed(3) : "-";
   lines.push("NLI evidence diagnostics (C=contradiction, N=neutral, E=entailment):");
   for (const a of item.argumentDiagnostics) {
    lines.push("  Conclusion: " + a.conclusion +
     (a.modelConclusion ? " | Model hypothesis: " + a.modelConclusion : "") +
     (a.entityNormalization ? " | Normalised entity: " + a.entityNormalization.name +
      " = " + a.entityNormalization.canonical : "") +
     (a.inferenceMarker ? " | Marker: " + a.inferenceMarker : "") +
     (a.inline ? " [inline]" : "") +
     " | Verdict: " + (a.verdict ||
      (a.status === "evidential_support_uncertain"
       ? "(abstained — insufficient evidence to judge; no underline)"
       : "(abstained)")) +
     (a.reason ? " | Decision: " + a.reason : "") +
     (a.proofGraph?.proof ? " | JS verified proof: " + a.proofGraph.proof +
      " (" + a.proofGraph.edges + " graph edges)" : "") +
     (a.proofGraph?.status === "undetermined" && a.proofGraph.missingLinks?.length
      ? " | Missing proof link (unverified, no underline): " +
       a.proofGraph.missingLinks[0].statement : "") +
     (a.proofObligation ? " | Evidence obligation: " +
      a.proofObligation.requires + " | Supplied: " +
      a.proofObligation.observed + " | Gap: " + a.proofObligation.reason : "") +
     (a.reasoningBridge ? " | Verified bridge: " + a.reasoningBridge.reason +
      " (" + a.reasoningBridge.steps + " steps)" : "") +
     (a.propositionNormalization ? " | Structured facts: " +
      a.propositionNormalization.facts + " | Claim type: " +
      a.propositionNormalization.claimKind +
      (a.propositionNormalization.relation ? " | Structured relation: " +
       a.propositionNormalization.relation : "") : ""));
    for (const x of a.comparisons) {
     const f = x.forward || {}, r = x.reverse || {};
     lines.push("    " + x.kind + (x.repeated ? " [exact repetition]" : "") +
      " | C " + fmt(f.contradiction) + " / N " + fmt(f.neutral) +
      " / E " + fmt(f.entailment) +
      (x.reverse ? " | Reverse C " + fmt(r.contradiction) : "") +
      " | Evidence: " + x.premise +
      (x.modelPremise ? " | Model evidence: " + x.modelPremise : ""));
    }
   }
  }
 }
 return lines.join("\n");
}
copyButton.addEventListener("click", async () => {
 if (!lastResult || !lastResult.incorrect) return;
 const text = failureReport(lastResult);
 try {
  await navigator.clipboard.writeText(text);
  $("copied").textContent = "Copied failure details";
 } catch {
  const field = document.createElement("textarea");
  field.value = text;
  field.style.cssText = "position:fixed;left:-9999px;top:0";
  document.body.append(field);
  field.select();
  const copied = document.execCommand("copy");
  field.remove();
  $("copied").textContent = copied ? "Copied failure details" : "Clipboard unavailable";
 }
});
function catalogues() {
 return loadCatalogues ||= Promise.all([
  fetch(new URL("../techniques.json", import.meta.url)).then(response => {
   if (!response.ok) throw Error("Cannot load the extension techniques file");
   return response.json();
  }),
  fetch(new URL("../patterns.json", import.meta.url)).then(response => {
   if (!response.ok) throw Error("Cannot load the extension rules file");
   return response.json();
  }),
  fetch(new URL("../../evaluation/matcher-examples.json", import.meta.url)).then(response => {
   if (!response.ok) throw Error("Cannot load the labelled examples");
   return response.json();
  }),
  fetch(new URL("../../evaluation/inconsistency-examples.json", import.meta.url)).then(response => {
   if (!response.ok) throw Error("Cannot load the inconsistency examples");
   return response.json();
  }),
  fetch(new URL("../../evaluation/positive-matcher-examples.json", import.meta.url)).then(response => {
   if (!response.ok) throw Error("Cannot load the positive-pattern examples");
   return response.json();
  }),
  fetch(new URL("../../evaluation/concealed-pattern-examples.json", import.meta.url)).then(response => {
   if (!response.ok) throw Error("Cannot load the concealed-pattern examples");
   return response.json();
  })
 ]);
}
runButton.addEventListener("click", async () => {
 if (running) return;
 const amount = Number(count.value);
 const maximum = mode.value === "consistency" || mode.value === "argument_paragraph" || mode.value.startsWith("concealed_")
  ? 10000 : 1000000;
 if (source.value === "generated" && (!Number.isSafeInteger(amount) || amount < 1 || amount > maximum)) {
  setError("Choose a test count between 1 and " + number(maximum) + ".");
  return;
 }
 if (source.value === "uploaded" && !file.files?.length) {
  setError("Select a JSON or JSONL file containing labelled examples.");
  return;
 }
 if (location.protocol === "file:") {
  setError("Open through the local server, not as a file:// page. See extension/README.md.");
  return;
 }
 running = true;
 runButton.disabled = true;
 stopButton.disabled = false;
 progress.value = 0;
 progress.max = source.value === "generated" ? amount : 100;
 progressCount.textContent = "0 / " + (source.value === "generated" ? number(amount) : "file");
 status.textContent = "Preparing local test…";
 results.hidden = true;
 setError("");
 try {
  const [catalogue, patterns, manipulationFixture, consistencyFixture,
   positiveFixture, concealedFixture] = await catalogues();
  const fixture = mode.value === "consistency" ? consistencyFixture :
   mode.value === "argument_paragraph" ? {cases:[]} :
   mode.value.startsWith("positive_") ? positiveFixture :
   mode.value.startsWith("concealed_") ? concealedFixture : manipulationFixture;
  runId++;
  setupWorker().postMessage({
   type: "start", runId, mode: mode.value, source: source.value,
   amount, seed: Number(seed.value), catalogue, patterns, fixture,
   file: source.value === "uploaded" ? file.files[0] : null
  });
 } catch (error) {
  status.textContent = "Test could not start";
  setError(String(error?.message || error));
  finish();
 }
});
stopButton.addEventListener("click", () => {
 if (!running || !runner) return;
 runner.postMessage({ type: "stop" });
 status.textContent = "Stopping after the current case…";
 stopButton.disabled = true;
});
if (location.protocol === "file:") {
 setError("Run this page through the local server; file:// blocks JavaScript module loading in Firefox.");
}
