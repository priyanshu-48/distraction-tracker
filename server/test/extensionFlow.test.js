import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import app from "../app.js";
import db from "../db.js";
import { http, makeUser } from "./helpers.js";

// The real extension (extension/background.js) running in a minimal fake Chrome, talking over real HTTP to the real
// API and the real test database. The unit tests on each side use fakes for the other side; this checks that the two
// agree: the token the dashboard hands over, the routes the extension calls, the upload format and its retries.
//
// It runs in real time (no fake clock) because the server compares the visit with the session's real start and end.
// The extension ignores visits under one second, so each visit below lasts about 1.1 s.

const source = readFileSync(fileURLToPath(new URL("../../extension/background.js", import.meta.url)), "utf8");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const VISIT_MS = 1100;

let server;
let baseUrl;
beforeAll(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
afterAll(() => new Promise((resolve) => server.close(resolve)));

let browser;
afterEach(() => browser?.uninstall());

/** A fresh browser with the real background.js loaded into it. Its requests go to the test server. */
function installBrowser() {
  const area = () => {
    const data = {};
    return {
      data,
      get: async (keys) => {
        const list = keys == null ? Object.keys(data) : [].concat(keys);
        return Object.fromEntries(list.filter((k) => k in data).map((k) => [k, structuredClone(data[k])]));
      },
      set: async (values) => void Object.assign(data, structuredClone(values)),
      remove: async (keys) => void [].concat(keys).forEach((k) => delete data[k]),
    };
  };
  const local = area();
  const session = area();
  const listeners = {};
  const event = (name) => ({ addListener: (fn) => (listeners[name] ??= []).push(fn) });
  let activeTab;

  const calls = []; // every request the extension made: { method, path, status }
  const faults = { loseUploadAnswers: 0 }; // how many upload answers to lose on their way back

  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const target = String(url).replace("http://localhost:3000", baseUrl); // the extension has the address built in
    const res = await realFetch(target, init); // the server really receives and handles the request
    const path = new URL(target).pathname;
    calls.push({ method: init?.method ?? "GET", path, status: res.status });
    if (path === "/api/intervals" && faults.loseUploadAnswers > 0) {
      faults.loseUploadAnswers--;
      throw new TypeError("Failed to fetch"); // the server answered, but the browser never got it
    }
    return res;
  };

  globalThis.chrome = {
    storage: { local, session },
    idle: { setDetectionInterval() {}, onStateChanged: event("idle"), queryState: async () => "active" },
    tabs: {
      onActivated: event("activated"),
      onUpdated: event("updated"),
      onRemoved: event("removed"),
      query: async () => (activeTab ? [activeTab] : []),
      get: async () => activeTab,
    },
    windows: { onFocusChanged: event("focus"), WINDOW_ID_NONE: -1, getLastFocused: async () => ({ focused: true }) },
    alarms: { create() {}, onAlarm: event("alarm") },
    runtime: { onMessageExternal: event("external"), getManifest: () => ({ version: "test" }), getURL: (path) => path },
  };
  new Function(source)(); // runs background.js against the fake chrome above

  return {
    local,
    calls,
    faults,
    queue: () => local.data.queue ?? [],
    uninstall() {
      globalThis.fetch = realFetch;
      delete globalThis.chrome;
    },
    /** The user switches to a tab. Resolves when the extension has finished with it, including any upload it triggered. */
    async goTo(id, url) {
      activeTab = { id, url, title: "Page", active: true };
      await Promise.all(listeners.activated.map((fn) => fn({ tabId: id })));
    },
    /** A message from the dashboard, answered the way the browser would hand it back. */
    message(request) {
      return new Promise((resolve) => listeners.external[0](request, {}, resolve));
    },
    /** The 30-second alarm. The extension does not return a promise for it, so callers wait for the effect. */
    pollAlarm: () => listeners.alarm.forEach((fn) => fn({ name: "poll" })),
  };
}

/** The limited token the dashboard gives the extension (POST /auth/extension-token), as the real dashboard fetches it. */
async function extensionTokenFor(auth) {
  return (await http().post("/api/auth/extension-token").set(auth).expect(200)).body.token;
}

/** Signs in, connects the browser and starts a session on the server, like the dashboard does. */
async function connectedUser() {
  const user = await makeUser();
  browser = installBrowser();
  expect(await browser.message({ type: "SET_TOKEN", token: await extensionTokenFor(user.auth) })).toEqual({ status: "ok" });
  await http().post("/api/start-tracking").set(user.auth).expect(200);
  expect(await browser.message({ type: "TRACKING_CHANGED" })).toMatchObject({ status: "ok", tracking: true });
  return user;
}

const visits = async (userId) =>
  (await db.query("SELECT client_event_id, url, domain, title, started_at, ended_at, duration FROM tab_activity WHERE user_id = $1 ORDER BY started_at", [userId])).rows;
const uploads = () => browser.calls.filter((call) => call.method === "POST" && call.path === "/api/intervals");

/** Browse one site for about a second, then move to another, which is what finishes (and uploads) the first visit. */
async function visitThenLeave(url = "https://youtube.com/watch?v=abc", next = "https://github.com/") {
  await browser.goTo(1, url);
  await sleep(VISIT_MS);
  await browser.goTo(2, next);
}

describe("the extension and the API together", () => {
  it("carries a visit from the browser into the database, and the dashboard's summary shows it", async () => {
    const user = await connectedUser();
    await visitThenLeave();

    const rows = await visits(user.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ domain: "youtube.com", url: "https://youtube.com/watch?v=abc", title: "Page" });
    expect(Number(rows[0].duration)).toBeGreaterThanOrEqual(1);
    expect(new Date(rows[0].ended_at) > new Date(rows[0].started_at)).toBe(true);

    expect(browser.queue()).toHaveLength(0);
    expect(await browser.message({ type: "PING" })).toMatchObject({ authState: "ok", tracking: true, queued: 0 });
    expect((await browser.message({ type: "PING" })).lastUploadAt).toBeTruthy();

    // The summary counts time on the sites the user has marked as distractions, so mark the one that was visited.
    await http().put("/api/sites/youtube.com").set(user.auth).send({ marked: true }).expect(200);
    const today = new Date().toISOString().slice(0, 10);
    const summary = (await http().get(`/api/summary?date=${today}&tz=UTC`).set(user.auth).expect(200)).body;
    expect(summary.totals.visits).toBe(1);
    expect(JSON.stringify(summary.topSites)).toContain("youtube.com");
  });

  it("uses only the limited token: the extension never holds the dashboard's login", async () => {
    await connectedUser();
    const stored = browser.local.data.token;
    const payload = JSON.parse(Buffer.from(stored.split(".")[1], "base64url").toString());
    expect(payload.scope).toBe("ingest");
    const statuses = browser.calls.map((call) => call.status);
    expect(statuses.every((status) => status === 200)).toBe(true); // the two routes it is allowed to call, all accepted
  });

  it("sends a visit again when the answer was lost, and the server counts it once", async () => {
    const user = await connectedUser();
    browser.faults.loseUploadAnswers = 1; // the server stores the visit, but the extension never hears back

    await visitThenLeave();
    expect(uploads()).toHaveLength(1);
    expect(await visits(user.id)).toHaveLength(1); // stored...
    expect(browser.queue()).toHaveLength(1); // ...but the extension believes it was not, so it keeps it

    browser.pollAlarm(); // the next poll retries the same visit with the same id
    await expect.poll(() => browser.queue().length, { timeout: 4000 }).toBe(0);
    expect(uploads()).toHaveLength(2);
    expect(await visits(user.id)).toHaveLength(1); // still exactly one
    const { rows } = await db.query("SELECT COUNT(*)::int AS n, SUM(duration) AS seconds FROM tab_activity WHERE user_id = $1", [user.id]);
    expect(rows[0].n).toBe(1);
    expect(Number(rows[0].seconds)).toBeLessThan(5); // not doubled
  });

  it("keeps a visit through a sign-out and delivers it when the dashboard reconnects", async () => {
    const user = await connectedUser();
    await browser.goTo(1, "https://youtube.com/watch?v=abc");
    await sleep(VISIT_MS);

    await http().post("/api/auth/logout").set(user.auth).expect(204); // ends every login, the extension's included
    await browser.goTo(2, "https://github.com/"); // finishing the visit tries to upload it
    expect(uploads().at(-1).status).toBe(401);
    expect(browser.local.data.token).toBeUndefined(); // the extension gave up the revoked token
    expect(browser.local.data.authState).toBe("logged_out");
    expect(browser.queue()).toHaveLength(1); // but did not throw the visit away
    expect(await visits(user.id)).toHaveLength(0);

    // The user signs in on the dashboard again, which gives the extension a new token.
    const login = await http().post("/api/auth/login").send({ email: user.email, password: user.password }).expect(200);
    const fresh = await extensionTokenFor({ Authorization: `Bearer ${login.body.token}` });
    expect(await browser.message({ type: "SET_TOKEN", token: fresh })).toEqual({ status: "ok" });

    expect(browser.queue()).toHaveLength(0);
    const rows = await visits(user.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].domain).toBe("youtube.com");
  });

  it("stops at once when the session is stopped, and the server keeps only the time inside the session", async () => {
    const user = await connectedUser();
    await browser.goTo(1, "https://youtube.com/watch?v=abc");
    await sleep(VISIT_MS);

    await http().post("/api/stop-tracking").set(user.auth).expect(200);
    expect(await browser.message({ type: "TRACKING_CHANGED" })).toMatchObject({ tracking: false }); // closes and uploads the visit

    const rows = await visits(user.id);
    expect(rows).toHaveLength(1);
    const { rows: sessions } = await db.query("SELECT start_time, end_time FROM tracking_sessions WHERE user_id = $1", [user.id]);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].end_time).not.toBeNull();
    expect(new Date(rows[0].started_at) >= new Date(sessions[0].start_time)).toBe(true);
    expect(new Date(rows[0].ended_at) <= new Date(sessions[0].end_time)).toBe(true); // never beyond the session's end
    expect(browser.queue()).toHaveLength(0);
  });
});
