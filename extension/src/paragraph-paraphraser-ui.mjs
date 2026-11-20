const $ = id => document.getElementById(id);
let worker = null, activeId = null, outputs = [];
function running(value) {
 $("run").disabled = value;
 $("stop").disabled = !value;
 $("copy").disabled = value || !outputs.length;
}
function show(paragraph) {
 const item = document.createElement("article");
 item.className = paragraph.status;
 const h = document.createElement("h3");
 h.textContent = paragraph.id + " — " + paragraph.status;
 const original = document.createElement("p");
 original.textContent = "Original: " + paragraph.original;
 const paraphrase = document.createElement("p");
 paraphrase.textContent = "Paraphrase: " + (paragraph.paraphrase ?? "(unavailable)");
 const issues = document.createElement("p");
 issues.className = "note";
 issues.textContent = paragraph.issues.length ? paragraph.issues.join(", ") : "No basic checks triggered";
 item.append(h, original, paraphrase, issues);
 $("results").append(item);
}
$("run").addEventListener("click", () => {
 const source = $("source").value.trim();
 if (!source) { $("status").textContent = "Paste at least one paragraph."; return; }
 const paragraphs = source.split(/\n\s*\n+/).map((text, i) => ({
  id: "paragraph-" + i, text: text.trim()
 }));
 if (!worker) {
  worker = new Worker("./paragraph-paraphraser-worker.js", {type:"module"});
  worker.addEventListener("message", event => {
   const data = event.data;
   if (data.id !== activeId) return;
   if (data.type === "stage") $("status").textContent = data.message;
   if (data.type === "progress") {
    outputs.push(data.paragraph);
    show(data.paragraph);
    $("status").textContent = data.completed + " / " + data.total + " paragraphs";
   }
   if (["complete", "error", "cancelled"].includes(data.type)) {
    $("status").textContent = data.type === "error" ? data.error : data.type;
    running(false);
   }
  });
 }
 outputs = [];
 $("results").replaceChildren();
 activeId = crypto.randomUUID();
 running(true);
 $("status").textContent = "Starting local model…";
 worker.postMessage({type:"paraphrase",id:activeId,paragraphs});
});
$("stop").addEventListener("click", () => {
 if (!worker || !activeId) return;
 worker.postMessage({type:"cancel", id:activeId});
 $("stop").disabled = true;
 $("status").textContent = "Stopping after current paragraph…";
});
$("copy").addEventListener("click", async () => {
 await navigator.clipboard.writeText(JSON.stringify({version:1,paragraphs:outputs},null,2));
 $("status").textContent = "Copied paragraph JSON";
});
