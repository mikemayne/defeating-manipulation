const enabledTabs = new Set();
let worker, ready;

function getWorker() {
 if (!worker) {
  worker = new Worker(browser.runtime.getURL("matcher-worker.js"), { type: "module" });
  ready = new Promise((resolve, reject) => {
   const timer = setTimeout(() => reject(Error("Model initialisation timed out")), 180000);
   worker.addEventListener("message", e => {
    if (e.data.type === "ready") { clearTimeout(timer); resolve(); }
    if (e.data.type === "fatal") { clearTimeout(timer); reject(Error(e.data.error)); }
   });
  });
  Promise.all([
   fetch(browser.runtime.getURL("techniques.json")).then(r => r.json()),
   fetch(browser.runtime.getURL("patterns.json")).then(r => r.json())
  ]).then(([catalogue, patterns]) => worker.postMessage({ type: "init", catalogue, patterns }))
   .catch(e => worker.postMessage({ type: "fatal", error: String(e) }));
 }
 return ready.then(() => worker);
}

browser.runtime.onMessage.addListener(async (m, sender) => {
 if (m.type !== "DM_MATCH") return;
 const w = await getWorker();
 return new Promise((resolve, reject) => {
  const id = crypto.randomUUID();
  const listener = e => {
   if (e.data.id !== id) return;
   if (e.data.type === "stage") {
    // Update an unobtrusive, non-blocking badge in the tab. No percentages
    // are invented: NLI inference has variable cost per argument.
    if (sender.tab?.id != null) void browser.tabs.sendMessage(sender.tab.id, {
     type: "DM_PROGRESS", message: e.data.message
    }).catch(() => {});
    return;
   }
   w.removeEventListener("message", listener);
   e.data.error ? reject(Error(e.data.error)) : resolve(e.data.matches);
  };
  w.addEventListener("message", listener);
  w.postMessage({ type: "match", id, text: m.text });
 });
});

// Clicking the toolbar button analyses only the current selection.
browser.browserAction.onClicked.addListener(async tab => {
 try {
   await browser.tabs.executeScript(tab.id, { file: "content.js" });
 } catch (error) { console.warn("Defeating Manipulation selection:", error); }
});
