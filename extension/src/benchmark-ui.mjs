const $ = id => document.getElementById(id);
const mode = $("mode"), source = $("source"), count = $("count"), seed = $("seed");
const file = $("file"), runButton = $("run"), stopButton = $("stop");
const status = $("status"), progress = $("progress"), progressCount = $("progress-count");
const message = $("message"), results = $("results"), copyButton = $("copy");
const downloadButton = $("download-predictions");
const minScoreControl=$("join-min-score"),minMarginControl=$("join-min-margin");
const applyFittedButton=$("apply-fitted-thresholds");
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
 const implicitMode = mode.value === "implicit_conclusion";
 const readerMode = mode.value === "reader_inference";
 const boundaryMode = mode.value === "reader_boundary";
 const compareMode = mode.value === "reader_compare";
 // One uploaded paragraph test schema, with optional NLI labels.
 source.options[0].disabled = implicitMode || argumentMode || readerMode || boundaryMode || compareMode;
 if ((implicitMode || argumentMode || readerMode || boundaryMode || compareMode) && source.value !== "uploaded") source.value = "uploaded";
 const upload = source.value === "uploaded";
 const consistency = mode.value === "consistency";
 const positive = mode.value.startsWith("positive_");
 const concealed = mode.value.startsWith("concealed_");
 $("count-control").hidden = upload;
 $("seed-control").hidden = upload;
 $("file-control").hidden = !upload;
 $("join-score-control").hidden=!(boundaryMode||compareMode);
 $("join-margin-control").hidden=!(boundaryMode||compareMode);
 count.max = consistency || argumentMode || readerMode || boundaryMode || compareMode || concealed ? 10000 : 1000000;
 if (!count.dataset.edited) count.value = consistency ? 200 : argumentMode ? 96 : concealed ? 96 : positive ? 72 : 25000;
 $("dataset-note").textContent = upload
  ? implicitMode
   ? 'Upload JSON/JSONL with {id,text}, optionally expected_implicit:true/false and expected_conclusion. Uses the local FLAN-T5 generator; review each reconstructed conclusion and rejected output. Only annotated presence gets precision/recall; wording quality requires manual review. Maximum 2,000 cases.'
   : compareMode
   ? 'Upload the same 1,000 real-world {id,text} examples to compare progressive joins against original-context joins, using only AND and BUT plus default KEEP. Both methods share thresholds; scores can be fitted to labels without more model calls. Accuracy is only shown if a case includes expected_boundaries:[{offset,choice}], labelled by a reviewer; otherwise accuracy is unknown.'
   : boundaryMode
   ? 'Upload the same 1,000-example JSON/JSONL with {id, text}. Two neural language-model scores: AND and BUT, with KEEP as the JavaScript fallback. Thresholds can be fitted on labelled cases. One-time model download; scores indicate linguistic plausibility, not human reader percentages. Original text is never modified.'
   : readerMode
   ? 'Upload the same 1,000-example JSON/JSONL with {id, text}. This runs an experimental local NLI probe for seven possible reader interpretations, including no implied connection; all model scores are uncalibrated, not percentages of readers or accuracy.'
   : argumentMode
   ? 'Upload JSON/JSONL with {id, text}. For unlabelled real-world scans, add analyse_reasoning:true to run local NLI; these runs report predictions, never accuracy. To score a labelled benchmark, provide expected_argument:true/false and optional expected:[reasoning label]. No text leaves this computer.'
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
function renderThresholdFit(data){
 const fit=data.joinThresholdFit;
 const show=!!(data.boundaryMode||data.compareMode);
 const p=$("threshold-fit-note");
 p.hidden=!show;applyFittedButton.hidden=!show;
 if(!show)return;
 const t=data.joinThresholds||{minScore:-3.5,minMargin:.2};
 if(fit?.available){
  p.textContent="Applied thresholds: min score "+t.minScore+", margin "+t.minMargin+
   ". Fit (training only, no neural reruns): score "+fit.fitted.minScore+
   ", margin "+fit.fitted.minMargin+
   ". Held-out balanced recall "+percent(100*fit.holdout.balancedAccuracy)+
   " vs default "+percent(100*fit.defaultHoldout.balancedAccuracy)+
   " across "+fit.holdout.cases+" labelled boundaries. "+
   "Synthetic labels are not human reader judgements.";
  applyFittedButton.disabled=false;
 }else{
  p.textContent="Applied thresholds: score "+t.minScore+
   ", margin "+t.minMargin+
   ". No tuning: "+(fit?.reason||"no reference labels")+
   ". Add expected_boundaries labels to estimate correctness.";
  applyFittedButton.disabled=true;
 }
}
applyFittedButton.addEventListener("click",()=>{
 const fit=lastResult?.joinThresholdFit;
 if(!fit?.available)return;
 minScoreControl.value=String(fit.fitted.minScore);
 minMarginControl.value=String(fit.fitted.minMargin);
 $("copied").textContent="Fitted thresholds selected. Run tests to apply.";
});
function implicitCorpusWarning(data){
 return data?.total>0&&data?.summary?.eligibleQuestions===0
  ? "No eligible rhetorical questions in this dataset. The local LLM was not run. "+
    "This mode does not evaluate explicit conclusions such as therefore/so; "+
    "choose Arguments — single paragraph (structure + optional NLI) for those examples. "
  : "";
}
function renderImplicitResults(data){
 const s=data.summary;
 $("stats").replaceChildren(
  metric("Examples scanned",number(data.total)),
  metric("Eligible questions",number(s.eligibleQuestions)),
  metric("Accepted conclusions",number(s.accepted)),
  metric("Rejected outputs",number(s.rejected)),
  metric("Model returned NONE",number(s.returnedNone)),
  metric("Model errors",number(s.errors)),
  metric("Labelled cases",number(s.labelled)),
  metric("Elapsed, seconds",oneDecimal(data.elapsedSeconds))
 );
 $("real-breakdown").hidden=true;
 const score=s.labelled?
  " Reviewer-labelled presence: TP "+s.tp+", FP "+s.fp+
  ", FN "+s.fn+", TN "+s.tn+
  "; precision "+(s.precision===null?"undefined":percent(100*s.precision))+
  ", recall "+(s.recall===null?"undefined":percent(100*s.recall))+
  ", accuracy "+percent(100*s.accuracy)+".":" No reviewer presence labels: accuracy is not measured.";
 const mismatch=implicitCorpusWarning(data);
 $("summary-note").textContent=
  mismatch+
  "Experimental implied-conclusion reconstruction from rhetorical questions. "+
  "A proposed interpretation is not evidence of bad reasoning or author intent. "+
  "Source wording is unchanged; generated conclusions must be reviewed manually."+
  score;
 const body=$("implicit-rows");
 body.replaceChildren();
 for(const item of data.predictions.slice(0,100)){
  const tr=document.createElement("tr");
  const status=item.attempts.length?
   item.attempts.map(a=>a.status+
    (a.status==="model_error"?": "+(a.error||"unknown error"):
     a.status==="rejected"?": "+(a.rawOutput||"no output"):"")).join(" | "):
   "No eligible rhetorical question";
  const columns=[
   item.id,
   item.text.length>450?item.text.slice(0,447)+"…":item.text,
   item.conclusions.map(c=>c.impliedConclusion+
    " (support: "+c.supportStatus+")").join("\n")||"—",
   status,
   item.expected_implicit===null?"Unlabelled":
    (item.expected_implicit?"Yes":"No")+
    (item.expected_conclusion?" — "+item.expected_conclusion:"")
  ];
  for(let i=0;i<columns.length;i++){
   const td=document.createElement("td");
   td.className="example";
   td.textContent=columns[i];
   tr.append(td);
  }
  body.append(tr);
 }
 $("failure-note").textContent="Showing "+number(Math.min(100,data.total))+
  " of "+number(data.total)+" cases. Copy the full report or export every raw "+
  "LLM response, accepted proposal, source offset and reference label.";
 copyButton.disabled=false;
 copyButton.textContent="Copy all implied-conclusion results";
 downloadButton.hidden=false;
 downloadButton.disabled=false;
 $("copied").textContent="";
}
function renderResults(data) {
 results.hidden = false;
 renderThresholdFit(data);
 $("implicit-results").hidden=!data.implicitMode;
 $("standard-tables").hidden=!!data.implicitMode;
 if(data.implicitMode){renderImplicitResults(data);return;}
 if(data.compareMode){
  const m=data.strategyComparison||{};
  const accuracy=m.labelled?(
   " | Context accuracy: "+percent(100*m.correctContext/m.labelled)+
   " | Progressive accuracy: "+percent(100*m.correctProgressive/m.labelled)
  ):" | Accuracy not measured: no reference labels";
  $("stats").replaceChildren(
   metric("Cases scanned",number(data.total)),
   metric("Cases with boundaries",number(m.casesWithBoundaries||0)),
   metric("Joins compared",number(m.pairs||0)),
   metric("Approaches disagree",number(m.disagree||0)),
   metric("Cumulative context changed",number(m.changedContext||0)),
   metric("Neural comparisons",number(m.modelCalls||0)),
   metric("Elapsed, seconds",oneDecimal(data.elapsedSeconds))
  );
  $("real-breakdown").hidden=true;
  $("summary-note").textContent=
   "Explicit connecting words are classified in JavaScript without changing punctuation. For implicit boundaries, two strategies score AND and BUT with KEEP as a fallback. Agreement is not accuracy."+
   accuracy+
   (m.unmatchedLabels?" | Unmatched gold offsets: "+m.unmatchedLabels:"");
  const values=new Set([...Object.keys(m.byContext||{}),...Object.keys(m.byProgressive||{})]);
  tableRows($("confusion"),[...values].sort().map(key=>[
   key,number(m.byContext?.[key]||0)+" / "+number(m.byProgressive?.[key]||0)
  ]),"No scorable boundaries");
  tableRows($("per-technique"),m.labelled?[
   ["Original-context",m.correctContext+" / "+m.labelled,
    m.labelled-m.correctContext,percent(100*m.correctContext/m.labelled)],
   ["Progressive",m.correctProgressive+" / "+m.labelled,
    m.labelled-m.correctProgressive,percent(100*m.correctProgressive/m.labelled)]
  ]:[],"No reference labels: upload expected_boundaries offsets to score agreement.");
  $("confusion-title").textContent="Replacement selections: context / progressive";
  $("confusion-column").textContent="Choice";
  $("per-technique-title").textContent="Reference-label comparison (if provided)";
  $("failure-note").textContent="Export includes every original offset, both rankings, reconstruction, matched labels, and differences.";
  copyButton.disabled=false;copyButton.textContent="Copy comparison";
  downloadButton.hidden=false;downloadButton.disabled=false;
  $("copied").textContent="";
  return;
 }
 if(data.boundaryMode){
  $("stats").replaceChildren(
   metric("Cases scanned",number(data.total)),
   metric("Cases with tested punctuation",number(data.boundaryCasesWithPairs)),
   metric("Boundaries scored",number(data.boundaryPairs)),
   metric("Uncertain (kept original)",number(data.boundaryCounts?.["uncertain (kept original)"]||0)),
   metric("Elapsed time, seconds",oneDecimal(data.elapsedSeconds))
  );
  $("real-breakdown").hidden=true;
  $("summary-note").textContent="Two alternatives (AND and BUT) scored locally. KEEP is the fallback when neither score and margin meet the configured thresholds. Scores are not reader percentages; input text is unchanged.";
  tableRows($("confusion"),Object.entries(data.boundaryCounts||{})
   .sort((a,b)=>b[1]-a[1]).map(([label,count])=>[label,number(count)]),
   "No candidate punctuation boundary.");
  tableRows($("per-technique"),[],"Human-reader accuracy has not been measured.");
  $("confusion-title").textContent="Preferred replacement (provisional)";
  $("confusion-column").textContent="Replacement";
  $("per-technique-title").textContent="Reader validation (not yet measured)";
  $("failure-note").textContent="Download predictions for all candidate scores, original source offsets and analysis-only reconstructions.";
  copyButton.disabled=false;copyButton.textContent="Copy results";
  downloadButton.hidden=false;downloadButton.disabled=false;
  $("copied").textContent="";
  return;
 }
 if(data.readerMode){
  const grid=$("stats");
  grid.replaceChildren(
   metric("Cases scanned",number(data.total)),
   metric("Cases with readable boundaries",number(data.readerCasesWithPairs)),
   metric("Cases with existing rule-extracted arguments",number(data.readerExistingParserCases)),
   metric("Relationships scored",number(data.readerPairs)),
   metric("Uncertain relationships",number(data.readerCounts?.uncertain||0)),
   metric("Elapsed time, seconds",oneDecimal(data.elapsedSeconds))
  );
  $("real-breakdown").hidden=true;
  $("summary-note").textContent="Experimental interpretation ranking using local NLI. These are not human reader percentages, validation scores or factual claims. The original input is unchanged. Review the complete per-option scores in the local JSON download.";
  tableRows($("confusion"),Object.entries(data.readerCounts||{})
   .sort((a,b)=>b[1]-a[1]).map(([label,count])=>[label,number(count)]),
   "No scorable statement boundaries.");
  tableRows($("per-technique"),[],
   "Reader agreement cannot be measured without human annotations.");
  $("confusion-title").textContent="Most likely interpretations (provisional)";
  $("confusion-column").textContent="Relation / uncertain";
  $("per-technique-title").textContent="Human-reader validation (not yet measured)";
  $("failure-note").textContent="Results are prediction-only. Unscored single-statement excerpts remain in the export.";
  copyButton.disabled=false;
  copyButton.textContent="Copy results";
  downloadButton.hidden=false;
  downloadButton.disabled=false;
  $("copied").textContent="";
  return;
 }
 if(data.unlabelledScan){
  const grid=$("stats");
  grid.replaceChildren(
   metric("Real-world cases scanned",number(data.total)),
   metric("Arguments extracted",number(data.predictions.filter(x=>x.extracted_arguments.length).length)),
   metric("AI candidate passages (provisional)",number(data.predictions.filter(x=>
    x.extracted_arguments.some(h=>h.reconstructionMethod==="model_nli_directional_entailment")).length)),
   metric("Cases with reasoning verdicts",number(data.predictions.filter(x=>x.predicted_labels.length).length)),
   metric("Speed, cases/sec",number(Math.round(data.casesPerSecond))),
   metric("Elapsed time, seconds",oneDecimal(data.elapsedSeconds))
  );
  $("real-breakdown").hidden=true;
  $("summary-note").textContent="Prediction-only scan: no gold labels provided, so exact, precision, recall and false-positive rates are deliberately NOT calculated. Download predictions to review them locally. Existing source labels are metadata, not truth.";
  tableRows($("confusion"),Object.entries(data.predictionCounts||{})
   .sort((a,b)=>b[1]-a[1]).slice(0,20).map(([label,count])=>[label,number(count)]),
   "No predictions.");
  tableRows($("per-technique"),[],"Unlabelled: accuracy and per-technique failures are not defined.");
  $("failure-note").textContent="Prediction-only run — download all " + number(data.predictions.length) + " results for review.";
  copyButton.disabled=false;
  copyButton.textContent="Copy results";
  downloadButton.hidden=false;
  downloadButton.disabled=false;
  $("confusion-title").textContent="Most frequent predictions";
  $("confusion-column").textContent="Predicted label";
  $("per-technique-title").textContent="Per-technique performance (requires labels)";
  $("copied").textContent="";
  return;
 }
 copyButton.textContent="Copy failures";
 downloadButton.hidden=true;
 downloadButton.disabled=true;
 $("confusion-title").textContent="Most frequent classification errors";
 $("confusion-column").textContent="Expected → Detected";
 $("per-technique-title").textContent="Per-technique performance";
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
function comparisonReport(data){
 const m=data.strategyComparison||{};
 const lines=[
  "Defeating Manipulation — Context vs Progressive Reconstruction",
  "Model: local causal LM; AND/BUT scores with default KEEP",
  "Applied thresholds: "+JSON.stringify(data.joinThresholds),
  "Offline threshold fit: "+JSON.stringify(data.joinThresholdFit),
  "Real-world predictions are UNLABELLED unless expected_boundaries supplied",
  "Cases: "+data.total+" / "+data.requested,
  "Cases with joins: "+m.casesWithBoundaries,
  "Joins compared: "+m.pairs,
  "Agree: "+m.agree+" | Disagree: "+m.disagree,
  "Progressive context modified by previous joins: "+m.changedContext,
  "Actual model calls (reused candidates cached): "+m.modelCalls,
  "Elapsed seconds: "+oneDecimal(data.elapsedSeconds),
  "Reference labels scored: "+m.labelled,
  ...(m.labelled?[
   "Context correct: "+m.correctContext+" / "+m.labelled,
   "Progressive correct: "+m.correctProgressive+" / "+m.labelled
  ]:["Accuracy cannot be calculated without human reference labels"]),
  "","ALL CASES"
 ];
 for(const item of data.predictions){
  lines.push("","--- "+item.id+" ---","Text: "+item.text);
  if(!item.boundaries.length)lines.push("(no eligible boundary)");
  for(const p of item.boundaries){
   const gold=item.expected_boundaries?.find(x=>x.offset===p.punctuationStart);
   lines.push("Offset: "+p.punctuationStart+
    " | Boundary: "+p.boundaryKind+
    " | Gold: "+(gold?.choice??"(unlabelled)"),
    "Context: "+p.context.choice+
    (p.context.uncertain?" (uncertain)":"")+
    (p.decisionSource==="explicit_connector"?" | Explicit marker: "+p.explicitConnector:
    " | Scores: "+p.context.candidates.map(x=>
     x.id+"="+(x.score===null?"N/A":x.score.toFixed(3))).join(", ")),
    "Progressive: "+p.progressive.choice+
    (p.progressive.uncertain?" (uncertain)":"")+
    (p.decisionSource==="explicit_connector"?" | Original punctuation kept":
    " | Scores: "+p.progressive.candidates.map(x=>
     x.id+"="+(x.score===null?"N/A":x.score.toFixed(3))).join(", ")),
    "Earlier joins affected context: "+p.contextChangedByEarlierJoins+
    " | Disagree: "+(!p.sameChoice),
    "Cumulative reconstruction: "+p.progressiveReconstructionThroughSecond
   );
  }
 }
 return lines.join("\n");
}
function boundaryReport(data){
 const lines=[
  "Defeating Manipulation — Two-score Punctuation Experiment",
  "Applied thresholds: "+JSON.stringify(data.joinThresholds),
  "Offline threshold fit: "+JSON.stringify(data.joinThresholdFit),
  "Model: local distilgpt2 causal LM, quantized q8",
  "Scores: mean conditional token log probability, NOT reader agreement",
  "Scanned: "+data.total+" / "+data.requested,
  "Cases with boundaries: "+data.boundaryCasesWithPairs,
  "Boundaries tested: "+data.boundaryPairs,
  "Elapsed (seconds): "+oneDecimal(data.elapsedSeconds),
  "","RELATIONSHIP SUMMARY (source punctuation unchanged)"
 ];
 for(const [label,count] of Object.entries(data.boundaryCounts||{})
  .sort((a,b)=>b[1]-a[1]))lines.push(label+": "+count);
 lines.push("","ALL CASES");
 for(const item of data.predictions){
  lines.push("","--- "+item.id+" ---","Text: "+item.text);
  if(!item.boundaries.length)lines.push("No candidate punctuation boundary");
  for(const b of item.boundaries){
   lines.push("Punctuation: "+b.punctuation+
    " | Original offset: "+b.punctuationStart+
    " | Boundary type: "+b.boundaryKind,
    "Relationship: "+(b.relationship??"uncertain")+
      " | Connector: "+b.choice+
      " | Decision: "+(b.decisionSource==="explicit_connector"?
       "explicit marker '"+b.explicitConnector+"'":"model score thresholds"),
    "Before: "+b.first.text,"After: "+b.second.text,
    "Punctuation: "+(b.punctuationAction==="keep"?"original retained":"only analysis reconstruction changes"),
    "Analysis-only reconstruction: "+b.analysisText,
    b.decisionSource==="explicit_connector"?
      "Scores: not needed (explicit marker)": "Scores (higher is better): "+b.candidates.map(c=>
       c.id+"="+(c.score===null?"N/A":c.score.toFixed(3))).join(" | "));
  }
 }
 return lines.join("\n");
}
function readerReport(data) {
 const lines=[
  "Defeating Manipulation — Reader Interpretation Probe",
  "Model: local NLI zero-shot hypotheses (uncalibrated; no human reader labels)",
  "Cases: "+data.total+" / "+data.requested,
  "Cases with statement boundaries: "+data.readerCasesWithPairs,
  "Existing rule-extracted argument passages: "+data.readerExistingParserCases,
  "Scored relationships: "+data.readerPairs,
  "Elapsed (seconds): "+oneDecimal(data.elapsedSeconds),
  "",
  "INTERPRETATIONS"
 ];
 for(const [label,count] of Object.entries(data.readerCounts||{})
  .sort((a,b)=>b[1]-a[1]))lines.push(label+": "+count);
 for(const item of data.predictions){
  lines.push("","--- "+item.id+" ---","Text: "+item.text,
   "Existing rule-extracted arguments: "+item.existing_rule_arguments.length);
  if(!item.interpretations.length)lines.push("No scorable boundary");
  for(const relation of item.interpretations){
   lines.push("First: "+relation.first.text,
    "Second: "+relation.second.text,
    "Likely interpretation (provisional): "+relation.interpretation,
    "Proposed connector: "+(relation.proposedConnector??"(none)"),
    "Boundary: "+relation.boundaryKind,
    "Scores (uncalibrated NLI entailment): "+relation.options.map(x=>
     x.relation+"="+(x.score===null?"unavailable":x.score.toFixed(3))).join(" | "));
  }
 }
 return lines.join("\n");
}
function unlabelledReport(data) {
 const lines = [
  "Defeating Manipulation — Real-world Argument Scan",
  "Mode: prediction-only (unlabelled; no accuracy metrics)",
  "Scanned: " + data.total + " / " + data.requested,
  "Arguments extracted: " + data.predictions.filter(x => x.extracted_arguments.length).length,
  "AI candidate passages (provisional): " + data.predictions.filter(x =>
   x.extracted_arguments.some(h => h.reconstructionMethod==="model_nli_directional_entailment")).length,
  "Cases with reasoning verdicts: " + data.predictions.filter(x => x.predicted_labels.length).length,
  "Elapsed (seconds): " + oneDecimal(data.elapsedSeconds),
  "",
  "PREDICTION SUMMARY"
 ];
 for (const [label, count] of Object.entries(data.predictionCounts || {})
  .sort((a,b) => b[1]-a[1]))
  lines.push(label + ": " + count);
 lines.push("", "ALL CASES (" + data.predictions.length + ")");
 for (const item of data.predictions) {
  lines.push("", "--- " + item.id + " ---",
   "Text: " + item.text,
   "Predicted labels: " + (item.predicted_labels.join(", ") || "(none)"),
   "Extracted arguments: " + item.extracted_arguments.length);
  if (item.source_url) lines.push("Source: " + item.source_url);
  if (item.source_annotation)
   lines.push("Source annotation (not gold): " +
    (item.source_annotation.label || "(none)"));
  for (const a of item.assessments || [])
   lines.push("Assessment: " + a.label +
    " | Premise: " + a.premise +
    " | Conclusion: " + a.conclusion +
    (a.reason ? " | Reason: " + a.reason : ""));
  for (const h of item.extracted_arguments)
   lines.push("Extracted conclusion: " + h.sourceConclusion +
    " | Model hypothesis: " + h.modelConclusion +
    (h.inferred ? " | Inferred connector: " + h.inferredConnector +
     " | Analysis-only reconstruction: " + h.analysisText +
     (h.reconstructionMethod ? " | Method: " + h.reconstructionMethod : "") +
     (Number.isFinite(h.relationScore) ?
      " | Model directional entailment: " + h.relationScore.toFixed(3) : "") : ""));
 }
 return lines.join("\n");
}
async function copyTextToClipboard(text, successMessage) {
 try {
  await navigator.clipboard.writeText(text);
  $("copied").textContent = successMessage;
 } catch {
  const field = document.createElement("textarea");
  field.value = text;
  field.style.cssText = "position:fixed;left:-9999px;top:0";
  document.body.append(field);
  field.select();
  const copied = document.execCommand("copy");
  field.remove();
  $("copied").textContent = copied ? successMessage : "Clipboard unavailable";
 }
}
function implicitConclusionReport(data){
 const s=data.summary;
 const lines=[
  "Defeating Manipulation — Implicit Conclusions (local FLAN-T5)",
  "Tested: "+data.total+" / "+data.requested+(data.stopped?" (stopped early)":""),
  "Eligible rhetorical questions: "+s.eligibleQuestions,
  "Accepted: "+s.accepted+" | Rejected: "+s.rejected+
   " | NONE: "+s.returnedNone+" | Model errors: "+s.errors,
  "Reviewer-labelled presence cases: "+s.labelled,
  ...(s.labelled?[
   "TP: "+s.tp+" FP: "+s.fp+" FN: "+s.fn+" TN: "+s.tn,
   "Precision: "+(s.precision===null?"undefined":percent(100*s.precision))+
    " | Recall: "+(s.recall===null?"undefined":percent(100*s.recall))
  ]:[]),
  "Scores measure the presence of a validated candidate, not semantic correctness.",
  "Interpretations are provisional; assess conclusion wording manually."
 ];
 for(const item of data.predictions){
  lines.push("","ID: "+item.id,
   "Source: "+(item.source_url||"(not supplied)"),
   "Text: "+item.text,
   "Detected: "+(item.predicted_implicit?"yes":"no")+
    " | Reference: "+(item.expected_implicit===null?
      "(unlabelled)":item.expected_implicit?"yes":"no"),
   "Expected conclusion: "+(item.expected_conclusion||"(unlabelled)"));
  for(const candidate of item.candidates)
   lines.push("Candidate @"+candidate.start+".."+candidate.end+
    ": "+candidate.question,
    "Previous premise: "+(candidate.context||"(none)"));
  for(const attempt of item.attempts)
   lines.push("LLM "+attempt.status+" @"+attempt.start+".."+attempt.end+
    ": "+(attempt.rawOutput??attempt.error??"(none)"));
  for(const conclusion of item.conclusions)
   lines.push("Suggested: "+conclusion.impliedConclusion+
    " | Evidence check: "+conclusion.supportStatus);
  if(!item.candidates.length)lines.push("No eligible question.");
 }
 return lines.join("\n");
}
copyButton.addEventListener("click", async () => {
 if (!lastResult) return;
 if (lastResult.implicitMode) {
  await copyTextToClipboard(implicitConclusionReport(lastResult),
   "Copied all implied-conclusion results");
  return;
 }
 if(lastResult.compareMode){
  await copyTextToClipboard(comparisonReport(lastResult),"Copied A/B comparison");
  return;
 }
 if(lastResult.boundaryMode){
  await copyTextToClipboard(boundaryReport(lastResult),"Copied punctuation rankings");
  return;
 }
 if (lastResult.readerMode) {
  await copyTextToClipboard(readerReport(lastResult), "Copied reader interpretations");
  return;
 }
 if (lastResult.unlabelledScan) {
  await copyTextToClipboard(unlabelledReport(lastResult), "Copied scan results");
  return;
 }
 if (!lastResult.incorrect) return;
 await copyTextToClipboard(failureReport(lastResult), "Copied failure details");
});
downloadButton.addEventListener("click", () => {
 if (!lastResult?.implicitMode && !lastResult?.unlabelledScan && !lastResult?.readerMode && !lastResult?.boundaryMode && !lastResult?.compareMode) return;
 const payload=lastResult.implicitMode ? JSON.stringify({
   schema_version:1,mode:"implicit_conclusion_real_world",
   total:lastResult.total,requested:lastResult.requested,stopped:lastResult.stopped,
   summary:lastResult.summary,predictions:lastResult.predictions,
   generated_conclusions_are_verified:false
  },null,2)+"\n" : lastResult.compareMode ? JSON.stringify({
  schema_version:1,mode:"reader_context_vs_progressive",
  total:lastResult.total,summary:lastResult.strategyComparison,
  thresholds:lastResult.joinThresholds,offline_fit:lastResult.joinThresholdFit,
  predictions:lastResult.predictions,
  score_type:"mean_conditional_token_log_probability",
  scores_are_human_percentages:false
 },null,2)+"\n" : lastResult.boundaryMode ? JSON.stringify({
  schema_version:1,mode:"reader_boundary_reconstruction",
  total:lastResult.total,counts:lastResult.boundaryCounts,
  thresholds:lastResult.joinThresholds,offline_fit:lastResult.joinThresholdFit,
  boundaries:lastResult.boundaryPairs,predictions:lastResult.predictions,
  scores_are_human_percentages:false
 },null,2)+"\n" : lastResult.readerMode ? JSON.stringify({
  schema_version:1,mode:"reader_inference_unlabelled",
  total:lastResult.total,reader_counts:lastResult.readerCounts,
  reader_pairs:lastResult.readerPairs,predictions:lastResult.predictions,
  model_scores_are_human_percentages:false
 },null,2)+"\n" : JSON.stringify({
  schema_version:1,mode:"prediction_only_unlabelled",total:lastResult.total,
  counts:lastResult.predictionCounts,predictions:lastResult.predictions
 },null,2)+"\n";
 const blob=new Blob([payload],{type:"application/json"});
 const url=URL.createObjectURL(blob);
 const anchor=document.createElement("a");
 anchor.href=url;anchor.download=lastResult.implicitMode?
   "implicit-conclusion-predictions.json":lastResult.compareMode?
  "reader-strategies-context-vs-progressive.json":lastResult.boundaryMode?
  "reader-boundary-replacements.json":lastResult.readerMode?
  "reader-interpretation-predictions.json":"real-world-argument-predictions.json";
 document.body.append(anchor);anchor.click();anchor.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
 $("copied").textContent="Predictions downloaded locally";
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
 const joinThresholds={
  minScore:Number(minScoreControl.value),
  minMargin:Number(minMarginControl.value)
 };
 if((mode.value==="reader_boundary"||mode.value==="reader_compare")&&(
   !minScoreControl.value||!minMarginControl.value||
   !Number.isFinite(joinThresholds.minScore)||joinThresholds.minScore>0||
   joinThresholds.minScore< -20||!Number.isFinite(joinThresholds.minMargin)||
   joinThresholds.minMargin<0||joinThresholds.minMargin>5)){
  setError("Minimum score must be between -20 and 0; margin between 0 and 5.");
  return;
 }
 const maximum = mode.value === "consistency" || mode.value === "argument_paragraph" || mode.value === "reader_inference" || mode.value === "reader_boundary" || mode.value === "reader_compare" || mode.value.startsWith("concealed_")
  ? 10000 : 1000000;
 if (source.value === "generated" && (!Number.isSafeInteger(amount) || amount < 1 || amount > maximum)) {
  setError("Choose a test count between 1 and " + number(maximum) + ".");
  return;
 }
 if (source.value === "uploaded" && !file.files?.length) {
  setError("Select a JSON or JSONL file containing examples.");
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
   (mode.value === "implicit_conclusion" || mode.value === "argument_paragraph" || mode.value === "reader_inference" || mode.value === "reader_boundary" || mode.value === "reader_compare") ? {cases:[]} :
   mode.value.startsWith("positive_") ? positiveFixture :
   mode.value.startsWith("concealed_") ? concealedFixture : manipulationFixture;
  runId++;
  setupWorker().postMessage({
   type: "start", runId, mode: mode.value, source: source.value,
   amount, seed: Number(seed.value), catalogue, patterns, fixture, joinThresholds,
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
