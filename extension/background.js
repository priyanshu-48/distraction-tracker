let activeTabId = null;

function extractHostname(url) {
  try {
    const { hostname } = new URL(url);
    let cleanHost = hostname.replace("www.", ""); // optional: remove 'www.'
    cleanHost = cleanHost.replace(".com","");
    return cleanHost.charAt(0).toUpperCase() + cleanHost.slice(1);
  } catch (e) {
    return "unknown";
  }
}

chrome.tabs.onActivated.addListener((activeInfo) => {
  activeTabId = activeInfo.tabId;
});

// Triggered when a tab updates (like finishes loading)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Only act on the current active tab and once it's fully loaded
  if (tabId === activeTabId && changeInfo.status === "complete") {
    const timestamp = new Date().toISOString();
    const websiteName = extractHostname(tab.url);

    if (tab.url && tab.url.startsWith("http")) {
      console.log(`✅ Tab activated at ${timestamp}`);
      console.log("Tab Title:", websiteName);
      console.log("Tab URL:", tab.url);

      chrome.tabs.sendMessage(tabId, {
        type: "NEW",
        website: websiteName,
        switchTime: timestamp,
      });

      activeTabId = null; // reset after handling
    }
  }
});
