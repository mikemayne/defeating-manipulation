const enabledTabs = new Set();

async function refreshBadge(tabId) {
  await browser.browserAction.setBadgeText({tabId, text: enabledTabs.has(tabId) ? "ON" : ""});
  await browser.browserAction.setBadgeBackgroundColor({tabId, color: "#168f9b"});
}

async function enable(tabId) {
  try {
    await browser.tabs.executeScript(tabId, {file: "content.js"});
    enabledTabs.add(tabId);
    await refreshBadge(tabId);
  } catch (error) {
    console.warn("Could not enable highlighting on this page:", error);
    enabledTabs.delete(tabId);
    await refreshBadge(tabId);
  }
}

async function disable(tabId) {
  try {
    await browser.tabs.executeScript(tabId, {code: "if (window.__dmPatternHighlighter) window.__dmPatternHighlighter.disable();"});
  } catch (_) {}
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
