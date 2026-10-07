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

const IDLE_SECONDS = 60;
chrome.idle.setDetectionInterval(IDLE_SECONDS);

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

    if (res.ok) {
      await chrome.storage.local.set({ lastUploadAt: new Date().toISOString() });
      // The server keeps only time inside a tracking session; say so if it dropped something (D-23).
      try {
        const { rejected } = await res.json();
        if (rejected) console.warn(`Server dropped ${rejected} visit(s) recorded outside a tracking session`);
      } catch {
        // an answer we cannot read is not a reason to keep the batch
      }
    }

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

// Budget alerts arrive in the answer to the poll below (the server hands each one over once). Showing one is best effort:
// a failure here must never get in the way of tracking, and the extension still works where notifications are unavailable.
const MAX_ALERTS_SHOWN = 3;
async function showAlerts(alerts) {
  if (!Array.isArray(alerts) || !chrome.notifications) return;
  for (const alert of alerts.slice(0, MAX_ALERTS_SHOWN)) {
    try {
      await chrome.notifications.create(`dt-alert-${alert.id}`, {
        type: "basic",
        iconUrl: chrome.runtime.getURL("assets/ext-icon.png"),
        title: String(alert.title ?? "").slice(0, 100),
        message: String(alert.body ?? "").slice(0, 300),
      });
    } catch (err) {
      console.error("Failed to show an alert:", err);
    }
  }
}

async function refreshTracking() {
  const token = await getToken();
  const was = (await getSession()).tracking;
  let tracking = false;
  if (token) {
    try {
      const res = await fetch(`${API}/is-tracking?alerts=1`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 401) await markLoggedOut();
      else if (res.ok) {
        const answer = await res.json();
        tracking = answer.isTracking;
        await showAlerts(answer.alerts);
      }
    } catch (err) {
      console.error("Failed to fetch tracking status:", err);
      return was; // can't tell; keep the last known state
    }
  }
  await chrome.storage.session.set({ tracking, checkedAt: Date.now() });
  // Start and Stop pressed on the dashboard arrive as TRACKING_CHANGED and are noticed at once. Anywhere else (another
  // browser, the API) it is the next poll, up to 30 s, so the last interval can run long: the server cuts it at the
  // session's end (decisions.md, D-23), which keeps the stored time correct either way.
  if (was && !tracking) await closeCurrent();
  if (!was && tracking) await followActiveTab();
  return tracking;
}

async function isTracking() {
  const { tracking, checkedAt } = await getSession();
  return checkedAt && Date.now() - checkedAt < STATUS_TTL_MS ? tracking : refreshTracking();
}

// The site a URL belongs to, as far as "is this still the same visit" goes: the host without a leading "www.".
// Deliberately not the registrable domain: docs.google.com and mail.google.com are different sites (D-33).
const siteOf = (url) => new URL(url).hostname.replace(/^www\./, "");

function isTrackable(url) {
  return !!url?.startsWith("http") && new URL(url).origin !== DASHBOARD_ORIGIN;
}

// Make `tab` the in-progress interval (closing the previous one).
async function startFor(tab) {
  if (!isTrackable(tab?.url) || !(await isTracking())) return closeCurrent();
  const { current } = await getSession();
  // A visit is a stay on one site. YouTube, X and most modern sites change the URL without ever leaving, and you may
  // open another tab on the same site; neither starts a new visit (that counted one stay as three or four).
  // Leaving the site, the browser or going idle still ends it. The visit keeps the URL and title it started with.
  if (current && siteOf(current.url) === siteOf(tab.url)) {
    if (current.tabId !== tab.id) await chrome.storage.session.set({ current: { ...current, tabId: tab.id } });
    return;
  }
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

// True when the browser is the app in front and nothing has touched the keyboard or mouse for a while.
async function idleInBrowser() {
  const win = await chrome.windows.getLastFocused();
  return !!win?.focused && (await chrome.idle.queryState(IDLE_SECONDS)) === "idle";
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab.active && changeInfo.status === "complete") serial(() => startFor(tab));
  // Watching a video or listening to something without touching the keyboard still counts: while you are idle at the
  // browser, sound in the tab in front keeps the visit going, and when the sound stops the visit ends right then.
  // (While you are active, sound changes mean nothing: activity already counts.)
  if (tab.active && "audible" in changeInfo) {
    serial(async () => {
      if (!(await idleInBrowser())) return;
      return tab.audible ? startFor(tab) : closeCurrent();
    });
  }
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

// Idle means no input for IDLE_SECONDS, which is exactly what watching a video looks like. If the tab in front is
// playing sound the visit carries on; a silent tab, or a locked screen, ends it (the time up to the idle moment counts).
chrome.idle.onStateChanged.addListener((state) =>
  serial(async () => {
    if (state === "active") return followActiveTab();
    if (state === "idle") {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (tab?.audible) return;
    }
    return closeCurrent();
  })
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

  // The dashboard just started or stopped a session: read the state now instead of at the next 30 s poll, so Stop
  // ends the visit in progress at once and Start begins following the tab you are on.
  async TRACKING_CHANGED() {
    const tracking = await refreshTracking();
    await flush();
    return { status: "ok", tracking };
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
