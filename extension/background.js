const API = "http://localhost:3000/api";
const STATUS_TTL_MS = 5000;

// MV3 service workers are suspended when idle, so in-memory variables and
// setInterval don't survive. State lives in chrome.storage.session and the
// periodic refresh runs from chrome.alarms.
const getState = () => chrome.storage.session.get(["tracking", "checkedAt", "lastTab"]);

function getTokenAndUserId() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["token"], (result) => {
      const token = result.token || null;
      if (!token) return resolve({ token: null, userId: null });

      try {
        const payload = JSON.parse(atob(token.split(".")[1]));
        resolve({ token, userId: payload.id || payload.userId });
      } catch (err) {
        console.error("Failed to decode token:", err);
        resolve({ token, userId: null });
      }
    });
  });
}

async function post(path, token, body) {
  const response = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
}

async function refreshTracking() {
  const { token } = await getTokenAndUserId();
  let tracking = false;
  if (token) {
    try {
      const res = await fetch(`${API}/is-tracking`, { headers: { Authorization: `Bearer ${token}` } });
      tracking = res.ok && (await res.json()).isTracking;
    } catch (err) {
      console.error("Failed to fetch tracking status:", err);
    }
  }
  // When tracking stops the server closes open rows itself, so drop our copy.
  await chrome.storage.session.set(tracking ? { tracking, checkedAt: Date.now() } : { tracking, checkedAt: Date.now(), lastTab: null });
  return tracking;
}

async function isTracking() {
  const { tracking, checkedAt } = await getState();
  return checkedAt && Date.now() - checkedAt < STATUS_TTL_MS ? tracking : refreshTracking();
}

async function sendEndData() {
  const { lastTab } = await getState();
  const { token } = await getTokenAndUserId();
  if (!token || !lastTab) return;

  await chrome.storage.session.set({ lastTab: null });
  try {
    await post("/end-tab", token, { endedAt: new Date().toISOString() });
  } catch (err) {
    console.error("Failed to end tab:", err);
  }
}

async function sendStartData(tab) {
  const { token } = await getTokenAndUserId();
  if (!token) return console.warn("No token; log in on the dashboard first");

  try {
    await post("/start-tab", token, {
      url: tab.url,
      domain: new URL(tab.url).hostname,
      title: tab.title || "",
      startTime: new Date().toISOString()
    });
    await chrome.storage.session.set({ lastTab: { id: tab.id, url: tab.url } });
  } catch (err) {
    console.error("Failed to send tab data:", err);
  }
}

// Close the previous tab's interval, then open one for the new tab.
async function switchTo(tab) {
  if (!tab.url?.startsWith("http") || !(await isTracking())) return;
  const { lastTab } = await getState();
  if (lastTab?.id === tab.id && lastTab.url === tab.url) return;
  await sendEndData();
  await sendStartData(tab);
}

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    await switchTo(await chrome.tabs.get(tabId));
  } catch (err) {
    console.error("Failed to read activated tab:", err);
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (tab.active && changeInfo.status === "complete") await switchTo(tab);
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const { lastTab } = await getState();
  if (lastTab?.id === tabId) await sendEndData();
});

chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
  if (request.type === "SET_TOKEN") {
    chrome.storage.local.set({ token: request.token }, () => {
      console.log("Token saved in chrome.storage.local");
      sendResponse({ status: "ok" });
    });
    return true;
  }
});

chrome.alarms.create("poll-tracking", { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "poll-tracking") refreshTracking();
});
