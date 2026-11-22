import { validateRealEntry, toRealBenchmark,
 tallyRealAnnotations } from "../../evaluation/real-corpus.mjs";

const $ = id => document.getElementById(id);
const STORAGE_KEY = "defeating-manipulation/real-world-annotations/v1";
let annotations = [], editing = null, storageAvailable = true;
const labelNames = {
 supported_conclusion: "Supported",
 none: "No assessable argument",
 uncertain: "Uncertain / excluded"
};
const activeAnnotations = () => annotations.filter(item => Object.hasOwn(labelNames, item.label));
function notice(message, error = false) {
 $("message").textContent = message;
 $("message").style.color = error ? "#b91c1c" : "";
}
function save() {
 try { localStorage.setItem(STORAGE_KEY, JSON.stringify(annotations)); }
 catch {
  storageAvailable = false;
  notice("Browser storage unavailable; export a backup before closing this tab.", true);
 }
}
function load() {
 try {
  const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  if (!Array.isArray(stored)) throw Error("Invalid saved collection");
  annotations = stored.map(validateRealEntry);
 } catch {
  annotations = [];
  storageAvailable = false;
  notice("Could not read saved annotations. Import a backup file if available.", true);
 }
 render();
}
function make(tag, text, className) {
 const node = document.createElement(tag);
 node.textContent = text;
 if (className) node.className = className;
 return node;
}
function entryFromForm() {
 return validateRealEntry({
  id: editing || crypto.randomUUID(),
  source_title: $("source-title").value,
  source_url: $("source-url").value,
  text: $("passage").value,
  label: $("label").value,
  track: $("track").value,
  rationale: $("rationale").value
 });
}
function resetForm() {
 editing = null;
 $("annotation-form").reset();
 $("save").textContent = "Save labelled passage";
 $("cancel").hidden = true;
}
function fingerprint(text) {
 return text.replace(/\s+/g, " ").trim().toLowerCase();
}
$("annotation-form").addEventListener("submit", event => {
 event.preventDefault();
 try {
  const item = entryFromForm();
  const duplicated = annotations.some(entry => entry.id !== item.id &&
   fingerprint(entry.text) === fingerprint(item.text));
  if (duplicated) throw Error("This passage is already in the collection");
  const index = annotations.findIndex(entry => entry.id === item.id);
  if (index < 0) annotations.push(item);
  else annotations[index] = item;
  resetForm();
  save();
  render();
  notice("Saved locally. The analyser has not seen this label.");
 } catch (error) { notice(error.message, true); }
});
$("cancel").addEventListener("click", () => { resetForm(); notice("Edit cancelled."); });
function edit(item) {
 editing = item.id;
 $("source-title").value = item.source_title;
 $("source-url").value = item.source_url;
 $("track").value = item.track;
 $("label").value = item.label;
 $("passage").value = item.text;
 $("rationale").value = item.rationale;
 $("save").textContent = "Update labelled passage";
 $("cancel").hidden = false;
 $("annotation-form").scrollIntoView({ behavior: "smooth", block: "start" });
}
function remove(item) {
 if (!confirm("Delete this locally saved annotation?")) return;
 annotations = annotations.filter(entry => entry.id !== item.id);
 if (editing === item.id) resetForm();
 save();
 render();
 notice("Annotation deleted.");
}
function render() {
 const records = activeAnnotations();
 const counts = tallyRealAnnotations(records);
 $("counts").replaceChildren();
 for (const [label,number] of [
  ["Collected",counts.total],["Natural",counts.natural],
  ["Challenge",counts.challenge],["Uncertain/excluded",counts.excluded],
  ["Scored",counts.total - counts.excluded]
 ]) {
  $("counts").append(make("span", label + ": " + number, "stat"));
 }
 $("export").disabled = counts.total === counts.excluded;
 const list = $("case-list");
 list.replaceChildren();
 if (!records.length) {
  list.append(make("p", "No passages added yet. Choose genuine source text, label it, and save above."));
  return;
 }
 for (const item of records.reverse()) {
  const wrap = document.createElement("article");
  wrap.className = "case";
  const head = make("strong", labelNames[item.label] + " · " + item.track);
  const link = make("a", item.source_title);
  link.href = item.source_url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  const about = make("p", "", "details");
  about.append(link, document.createTextNode(" · " + item.text.length + " characters"));
  const quote = make("p", item.text.length > 500 ?
   item.text.slice(0,500) + "…" : item.text);
  const actions = document.createElement("div");
  actions.className = "actions";
  const editButton = make("button", "Edit", "secondary");
  editButton.type = "button";
  editButton.addEventListener("click", () => edit(item));
  const removeButton = make("button", "Delete", "secondary");
  removeButton.type = "button";
  removeButton.addEventListener("click", () => remove(item));
  actions.append(editButton, removeButton);
  wrap.append(head, about, quote);
  if (item.rationale) wrap.append(make("p", "Human rationale: " + item.rationale, "details"));
  wrap.append(actions);
  list.append(wrap);
 }
}
function download(filename, data) {
 const contents = JSON.stringify(data, null, 2) + "\n";
 const url = URL.createObjectURL(new Blob([contents], {type:"application/json"}));
 const a = document.createElement("a");
 a.href = url; a.download = filename;
 document.body.append(a);
 a.click();
 a.remove();
 setTimeout(() => URL.revokeObjectURL(url), 1500);
}
$("export").addEventListener("click", () => {
 try {
  const data = toRealBenchmark(activeAnnotations());
  if (!data.cases.length) throw Error("No independently labelled cases to export");
  download("real-argument-benchmark.json", data);
  notice("Exported " + data.cases.length + " scored cases. Upload this file in the Matcher Test Lab.");
 } catch (error) { notice(error.message, true); }
});
$("backup").addEventListener("click", () => {
 try {
  if (!annotations.length) throw Error("No annotations to back up");
  download("real-argument-annotations-backup.json", {
   version: 1,
   description: "All locally annotated real passages, including uncertain cases.",
   annotations
  });
  notice("Saved a backup of all " + annotations.length + " annotations.");
 } catch (error) { notice(error.message, true); }
});
$("import").addEventListener("click", () => $("import-file").click());
$("import-file").addEventListener("change", async event => {
 const file = event.target.files?.[0];
 if (!file) return;
 try {
  const parsed = JSON.parse(await file.text());
  const list = Array.isArray(parsed) ? parsed :
   Array.isArray(parsed.annotations) ? parsed.annotations : parsed.cases;
  if (!Array.isArray(list)) throw Error("Expected an annotations or cases array");
  const incoming = list.map(validateRealEntry);
  const byId = new Map(annotations.map(item => [item.id,item]));
  let added = 0;
  for (const entry of incoming) {
   if (byId.has(entry.id)) continue;
   if ([...byId.values()].some(existing => fingerprint(existing.text) === fingerprint(entry.text)))
    continue;
   byId.set(entry.id,entry);
   added++;
  }
  annotations = [...byId.values()];
  save();
  render();
  notice("Imported " + added + " additional annotations.");
 } catch (error) { notice("Import failed: " + error.message,true); }
 event.target.value = "";
});
async function sourceLinks() {
 const root = $("source-list");
 try {
  const response = await fetch(new URL("../../evaluation/real-source-shortlist.json",import.meta.url));
  if (!response.ok) throw Error("Source list unavailable");
  const catalogue = await response.json();
  root.replaceChildren();
  for (const source of catalogue.sources) {
   const item = document.createElement("li");
   const link = make("a",source.title);
   link.href = source.url;
   link.target = "_blank"; link.rel = "noopener noreferrer";
   const genre = make("span",source.provider + " · " + source.genre);
   const use = make("button","Use source","secondary");
   use.type = "button";
   use.style.cssText = "font-size:.78rem;padding:3px 7px;margin-top:3px";
   use.addEventListener("click", () => {
    $("source-title").value = source.title;
    $("source-url").value = source.url;
    $("passage").focus();
   });
   item.append(link,genre,use);
   root.append(item);
  }
 } catch { root.replaceChildren(make("li","Could not load suggested sources; any source URL can be entered manually.")); }
}
load();
void sourceLinks();
if (!storageAvailable) notice("Local browser storage unavailable; export regularly.",true);
