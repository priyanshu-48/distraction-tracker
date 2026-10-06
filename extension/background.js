const API = "http://localhost:3000/api";
// The dashboard is the one page we never record (also the only origin allowed in manifest externally_connectable).
const DASHBOARD_ORIGIN = "http://localhost:5173";
const STATUS_TTL_MS = 5000;
const BATCH_SIZE = 50;
const QUEUE_CAP = 1000;

// Design: the extension records each focused-tab visit as one finished interval
// with a client-generated id, queues it in chrome.storage.local, and uploads
// batches. The server ignores ids it has seen, so retries never double-count.
// MV3 service workers are suspended when idle, so nothing lives in JS variables:
//   storage.session -> tracking flag, the in-progress interval
//   storage.local   -> token, auth state, upload queue
// ponytail: an in-progress interval lives only in session storage, so closing the
// browser mid-visit loses that one visit. Add a periodic checkpoint if that matters.

chrome.idle.setDetectionInterval(60);

// Events can fire concurrently; handlers touch shared storage, so run them one at a time.
let chain = Promise.resolve();
const serial = (fn) => (chain = chain.catch(() => {}).then(fn));

const getSession = () => chrome.storage.session.get(["tracking", "checkedAt", "current"]);

function decodeUserId(token) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.id || payload.userId || null;
  } catch {
    return null;
  }
}

async function getToken() {
  return (await chrome.storage.local.get("token")).token || null;
}

// A 401 means the token expired or was revoked: forget it and let the popup say so.
async function markLoggedOut() {
  await chrome.storage.local.remove("token");
  await chrome.storage.local.set({ authState: "logged_out" });
}

async function enqueue(interval) {
  const { queue = [] } = await chrome.storage.local.get("queue");
  queue.push(interval);
  await chrome.storage.local.set({ queue: queue.slice(-QUEUE_CAP) });
}

async function flush() {
  const token = await getToken();
  if (!token) return;

  for (;;) {
    const { queue = [] } = await chrome.storage.local.get("queue");
    const batch = queue.slice(0, BATCH_SIZE);
    if (!batch.length) return;

    let res;
    try {
      res = await fetch(`${API}/intervals`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ intervals: batch })
      });
    } catch (err) {
      return console.warn("Upload failed, will retry:", err.message); // offline/server down: keep queue
    }

    if (res.status === 401) return markLoggedOut();
    if (!res.ok && res.status !== 400) return console.warn(`Upload failed (${res.status}), will retry`);
    if (res.status === 400) console.error("Server rejected batch, dropping it:", await res.text());

    if (res.ok) await chrome.storage.local.set({ lastUploadAt: new Date().toISOString() });

    // Remove only what we sent; new intervals may have been queued meanwhile.
    const sent = new Set(batch.map((i) => i.clientEventId));
    const latest = (await chrome.storage.local.get("queue")).queue || [];
    await chrome.storage.local.set({ queue: latest.filter((i) => !sent.has(i.clientEventId)) });
  }
}

// Finish the in-progress interval (if any), queue it and try to upload.
async function closeCurrent() {
  const { current } = await getSession();
  if (!current) return;
  await chrome.storage.session.remove("current");
  if (Date.now() - Date.parse(current.startedAt) < 1000) return; // ignore sub-second flickers
  const { tabId, ...interval } = current;
  await enqueue({ ...interval, endedAt: new Date().toISOString() });
  await flush();
}

async function refreshTracking() {
  const token = await getToken();
  const was = (await getSession()).tracking;
  let tracking = false;
  if (token) {
    try {
      const res = await fetch(`${API}/is-tracking`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 401) await markLoggedOut();
      else tracking = res.ok && (await res.json()).isTracking;
    } catch (err) {
      console.error("Failed to fetch tracking status:", err);
      return was; // can't tell; keep the last known state
    }
  }
  await chrome.storage.session.set({ tracking, checkedAt: Date.now() });
  // ponytail: stop is noticed on the next poll (<=30s), so the last interval can run a little long.
  if (was && !tracking) await closeCurrent();
  if (!was && tracking) await followActiveTab();
  return tracking;
}

async function isTracking() {
  const { tracking, checkedAt } = await getSession();
  return checkedAt && Date.now() - checkedAt < STATUS_TTL_MS ? tracking : refreshTracking();
}

function isTrackable(url) {
  return !!url?.startsWith("http") && new URL(url).origin !== DASHBOARD_ORIGIN;
}

// Make `tab` the in-progress interval (closing the previous one).
async function startFor(tab) {
  if (!isTrackable(tab?.url) || !(await isTracking())) return closeCurrent();
  const { current } = await getSession();
  if (current?.tabId === tab.id && current.url === tab.url) return;
  await closeCurrent();
  await chrome.storage.session.set({
    current: {
      tabId: tab.id,
      clientEventId: crypto.randomUUID(),
      url: tab.url,
      domain: new URL(tab.url).hostname,
      title: tab.title || "",
      startedAt: new Date().toISOString()
    }
  });
}

async function followActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  await startFor(tab);
}

chrome.tabs.onActivated.addListener(({ tabId }) =>
  serial(async () => startFor(await chrome.tabs.get(tabId)))
);

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab.active && changeInfo.status === "complete") serial(() => startFor(tab));
});

chrome.tabs.onRemoved.addListener((tabId) =>
  serial(async () => {
    if ((await getSession()).current?.tabId === tabId) await closeCurrent();
  })
);

// Only count time when a browser window is focused and the user is not idle.
chrome.windows.onFocusChanged.addListener((windowId) =>
  serial(() => (windowId === chrome.windows.WINDOW_ID_NONE ? closeCurrent() : followActiveTab()))
);

chrome.idle.onStateChanged.addListener((state) =>
  serial(() => (state === "active" ? followActiveTab() : closeCurrent()))
);

// Messages from the dashboard (the only origin allowed by externally_connectable in the manifest).
const dashboardMessages = {
  // Sent on every dashboard load and after login, so the extension never stays without a token.
  async SET_TOKEN({ token }) {
    const userId = typeof token === "string" ? decodeUserId(token) : null;
    if (!userId) return { status: "invalid" };
    const { lastUserId } = await chrome.storage.local.get("lastUserId");
    // A different account must not inherit the previous user's queued visits.
    if (lastUserId && userId !== lastUserId) await chrome.storage.local.remove("queue");
    await chrome.storage.local.set({ token, authState: "ok", lastUserId: userId });
    await refreshTracking();
    await flush();
    return { status: "ok" };
  },

  // Lets the dashboard show whether the extension is installed, connected and working.
  async PING() {
    const { token, authState, queue = [], lastUploadAt = null } = await chrome.storage.local.get([
      "token",
      "authState",
      "queue",
      "lastUploadAt",
    ]);
    const { tracking = false } = await getSession();
    return {
      status: "ok",
      version: chrome.runtime.getManifest().version,
      hasToken: !!token,
      authState: authState ?? "none",
      tracking,
      queued: queue.length,
      lastUploadAt,
    };
  },

  // Dashboard logout: finish and upload the open visit, then forget the account.
  async LOGOUT() {
    await closeCurrent();
    await chrome.storage.local.remove(["token", "authState"]);
    await chrome.storage.session.set({ tracking: false, checkedAt: Date.now() });
    return { status: "ok" };
  },
};

chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
  const handle = Object.hasOwn(dashboardMessages, request?.type) ? dashboardMessages[request.type] : null;
  if (!handle) return;
  serial(async () => sendResponse(await handle(request)));
  return true;
});

chrome.alarms.create("poll", { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "poll") serial(async () => { await refreshTracking(); await flush(); });
});
