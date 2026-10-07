/**
 * Dev Toolbox — service worker
 * Side panel behavior, palette command, content-script injection helper.
 */

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err) => console.warn("[Dev Toolbox] setPanelBehavior:", err));

async function openSidePanelForActiveWindow() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.windowId != null) {
      await chrome.sidePanel.open({ windowId: tab.windowId });
      return tab;
    }
  } catch (err) {
    console.warn("[Dev Toolbox] sidePanel.open:", err);
  }
  return null;
}

chrome.commands.onCommand.addListener(async (command) => {
  if (command === "open-side-panel") {
    await openSidePanelForActiveWindow();
    return;
  }

  if (command !== "open-palette") return;

  await openSidePanelForActiveWindow();

  setTimeout(() => {
    chrome.runtime.sendMessage({ type: "OPEN_PALETTE" }).catch(() => {});
  }, 120);

  try {
    await chrome.storage.session.set({ openPalettePending: true });
  } catch (_) {
    /* session storage optional */
  }
});

/**
 * Ensure content.js is present in the tab, then optionally forward a message.
 */
async function ensureContentScript(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "DT_PING" });
    return { ok: true };
  } catch (_) {
    /* not injected yet */
  }
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err?.message || String(err),
    };
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return;

  // Forward content → side panel broadcasts (measure/inspect results)
  if (
    msg.type === "DT_MEASURE_RESULT" ||
    msg.type === "DT_MEASURE_STOPPED" ||
    msg.type === "DT_INSPECT_RESULT" ||
    msg.type === "DT_INSPECT_STOPPED" ||
    msg.type === "DT_LIVE_TEXT_EDITING" ||
    msg.type === "DT_LIVE_TEXT_STOPPED" ||
    msg.type === "DT_OUTLINE_STOPPED"
  ) {
    // Side panel also listens via chrome.runtime.onMessage; no extra work needed.
    return;
  }

  if (msg.type === "DT_ENSURE_CS") {
    (async () => {
      let tabId = msg.tabId;
      if (tabId == null) {
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        tabId = tab?.id;
      }
      if (tabId == null) {
        sendResponse({ ok: false, error: "No active tab" });
        return;
      }
      const result = await ensureContentScript(tabId);
      sendResponse({ ...result, tabId });
    })();
    return true;
  }

  if (msg.type === "DT_TAB_MESSAGE") {
    (async () => {
      let tabId = msg.tabId;
      if (tabId == null) {
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        tabId = tab?.id;
      }
      if (tabId == null) {
        sendResponse({ ok: false, error: "No active tab" });
        return;
      }
      const ensure = await ensureContentScript(tabId);
      if (!ensure.ok) {
        sendResponse(ensure);
        return;
      }
      try {
        const response = await chrome.tabs.sendMessage(tabId, msg.payload);
        sendResponse(response ?? { ok: true });
      } catch (err) {
        sendResponse({ ok: false, error: err?.message || String(err) });
      }
    })();
    return true;
  }
});

chrome.runtime.onInstalled.addListener(() => {
  console.log(
    "[Dev Toolbox] v0.3.1 — open via toolbar icon or Ctrl/⌘+Shift+D (set under chrome://extensions/shortcuts if unbound)"
  );
});
