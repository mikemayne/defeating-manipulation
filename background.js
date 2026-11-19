const enabledTabs = new Set();
let matcherWorker;
let workerReady;
function getWorker() {
  if (!matcherWorker) {
    matcherWorker = new Worker(browser.runtime.getURL("matcher-worker.js"), { type: "module" });
    workerReady = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Local model initialisation timed out")), 180000);
      matcherWorker.addEventListener("message", event => {
        if (event.data.type === "ready") { clearTimeout(timer); resolve(); }
        if (event.data.type === "fatal") { clearTimeout(timer); reject(new Error(event.data.error)); }
      });
    });
  }
  return workerReady.then(() => matcherWorker);
}
browser.runtime.onMessage.addListener(async message => {
  if (message.type !== "DM_MATCH") return undefined;
  const worker = await getWorker();
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const listener = event => {
      if (event.data.id !== id) return;
      worker.removeEventListener("message", listener);
      if (event.data.error) reject(new Error(event.data.error));
      else resolve(event.data.matches);
    };
    worker.addEventListener("message", listener);
    worker.postMessage({ type: "match", id, text: message.text });
  });
});
async function refreshBadge(tabId) {
  await browser.browserAction.setBadgeText({ tabId, text: enabledTabs.has(tabId) ? "ON" : "" });
  await browser.browserAction.setBadgeBackgroundColor({ tabId, color: "#168f9b" });
}
async function enable(tabId) {
  try {
    await browser.tabs.executeScript(tabId, { file: "content.js" });
    enabledTabs.add(tabId);
    await refreshBadge(tabId);
  } catch (error) {
    console.warn("Could not enable highlighting:", error);
    enabledTabs.delete(tabId);
    await refreshBadge(tabId);
  }
}
async function disable(tabId) {
  try { await browser.tabs.executeScript(tabId, { code: "if (window.__dmPatternHighlighter) window.__dmPatternHighlighter.disable();" }); } catch (_) {}
  enabledTabs.delete(tabId);
  await refreshBadge(tabId);
}
browser.browserAction.onClicked.addListener(async tab => {
  if (enabledTabs.has(tab.id)) await disable(tab.id);
  else await enable(tab.id);
});
browser.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.status === "complete" && enabledTabs.has(tabId)) {
    enabledTabs.delete(tabId);
    await enable(tabId);
  }
});
browser.tabs.onRemoved.addListener(tabId => enabledTabs.delete(tabId));
