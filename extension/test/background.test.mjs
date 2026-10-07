// Runs the real background.js against a fake Chrome and a fake API. `node --test test/` from extension/.
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RealDate = Date;
const source = readFileSync(fileURLToPath(new URL("../background.js", import.meta.url)), "utf8");
let loads = 0;

// Node caches a module by URL and ignores "?query" here, so each test loads its own uniquely named copy.
async function loadBackground() {
  const copy = join(tmpdir(), `dt-background-${process.pid}-${++loads}.mjs`);
  writeFileSync(copy, source);
  try {
    await import(pathToFileURL(copy).href);
  } finally {
    rmSync(copy);
  }
}

/** A fresh browser: fake chrome.* APIs, fake server, controllable clock, and the real background.js loaded into it. */
async function createWorld() {
  const clock = { now: RealDate.parse("2026-01-01T10:00:00Z") };
  globalThis.Date = class extends RealDate {
    constructor(...args) {
      args.length ? super(...args) : super(clock.now);
    }
    static now() {
      return clock.now;
    }
  };

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

  globalThis.chrome = {
    storage: { local, session },
    idle: { setDetectionInterval() {}, onStateChanged: event("idle") },
    tabs: {
      onActivated: event("activated"),
      onUpdated: event("updated"),
      onRemoved: event("removed"),
      query: async () => (activeTab ? [activeTab] : []),
      get: async () => activeTab,
    },
    windows: { onFocusChanged: event("focus"), WINDOW_ID_NONE: -1 },
    alarms: { create() {}, onAlarm: event("alarm") },
    runtime: { onMessageExternal: event("external"), getManifest: () => ({ version: "0.1.0" }) },
  };

  const server = { tracking: true, online: true, status: 200, uploads: [], rejected: 0 };
  globalThis.fetch = async (url, options = {}) => {
    if (!server.online) throw new TypeError("Failed to fetch");
    if (url.endsWith("/is-tracking")) {
      return { ok: server.status === 200, status: server.status, json: async () => ({ isTracking: server.tracking }) };
    }
    if (url.endsWith("/intervals")) {
      if (server.status === 200) server.uploads.push(...JSON.parse(options.body).intervals);
      return { ok: server.status === 200, status: server.status, text: async () => "", json: async () => ({ success: true, rejected: server.rejected }) };
    }
    throw new Error(`unexpected request ${url}`);
  };

  await loadBackground();

  const settle = () => new Promise((resolve) => setTimeout(resolve, 25));
  return {
    local,
    session,
    server,
    advance: (seconds) => void (clock.now += seconds * 1000),
    token: (id) => `h.${Buffer.from(JSON.stringify({ id })).toString("base64")}.s`,
    /** Switch to a tab, as if the user clicked it. */
    async goTo(id, url) {
      activeTab = { id, url, title: "T", active: true };
      listeners.activated.forEach((fn) => fn({ tabId: id }));
      await settle();
    },
    async fire(name, ...args) {
      listeners[name].forEach((fn) => fn(...args));
      await settle();
    },
    /** Send a message the way the dashboard does and return the extension's reply. */
    async message(request) {
      const handler = listeners.external[0];
      return new Promise((resolve) => {
        const handled = handler(request, {}, resolve);
        if (!handled) resolve(undefined); // not handled: the listener did not keep the channel open
      });
    },
    async startTracking(userId = 7) {
      await local.set({ token: this.token(userId) });
      await session.set({ tracking: true, checkedAt: clock.now + 3_600_000 });
    },
  };
}

describe("recording visits", () => {
  let world;
  beforeEach(async () => {
    world = await createWorld();
    await world.startTracking();
  });

  it("uploads the visit you leave, with its real length and without the tab id", async () => {
    await world.goTo(1, "https://youtube.com/watch");
    world.advance(90);
    await world.goTo(2, "https://github.com/");
    assert.equal(world.server.uploads.length, 1);
    const [visit] = world.server.uploads;
    assert.equal(visit.domain, "youtube.com");
    assert.equal(Date.parse(visit.endedAt) - Date.parse(visit.startedAt), 90_000);
    assert.ok(!("tabId" in visit));
  });

  it("ignores a visit shorter than a second", async () => {
    await world.goTo(1, "https://a.com/");
    world.advance(0.3);
    await world.goTo(2, "https://b.com/");
    assert.equal(world.server.uploads.length, 0);
  });

  it("never records the dashboard, but does record other localhost pages", async () => {
    await world.goTo(1, "https://youtube.com/");
    world.advance(60);
    await world.goTo(2, "http://localhost:5173/sites");
    assert.deepEqual(world.server.uploads.map((v) => v.domain), ["youtube.com"]);
    assert.equal((await world.session.get("current")).current, undefined);

    world.advance(30);
    await world.goTo(3, "http://localhost:3000/dev-app");
    world.advance(60);
    await world.goTo(4, "https://a.com/");
    assert.ok(world.server.uploads.some((v) => v.url.includes("localhost:3000")));
  });

  it("does not record browser pages", async () => {
    await world.goTo(1, "chrome://extensions");
    assert.equal((await world.session.get("current")).current, undefined);
  });

  it("keeps visits while offline and uploads each exactly once when back online", async () => {
    world.server.online = false;
    await world.goTo(1, "https://a.com/");
    world.advance(60);
    await world.goTo(2, "https://b.com/");
    const queued = (await world.local.get("queue")).queue;
    assert.equal(queued.length, 1);

    world.server.online = true;
    await world.fire("alarm", { name: "poll" });
    await world.fire("alarm", { name: "poll" });
    assert.equal(world.server.uploads.filter((v) => v.clientEventId === queued[0].clientEventId).length, 1);
    assert.equal((await world.local.get("queue")).queue.length, 0);
  });

  it("closes and uploads the open visit when the server says tracking stopped", async () => {
    await world.goTo(1, "https://a.com/");
    world.advance(120);
    world.server.tracking = false;
    await world.fire("alarm", { name: "poll" });
    assert.equal(world.server.uploads.length, 1);
    assert.equal((await world.session.get("current")).current, undefined);
  });

  it("treats a 401 as logged out: forgets the token, keeps the queued visits", async () => {
    await world.goTo(1, "https://a.com/");
    world.advance(60);
    world.server.status = 401;
    await world.goTo(2, "https://b.com/");
    const stored = await world.local.get(["token", "authState", "queue"]);
    assert.equal(stored.token, undefined);
    assert.equal(stored.authState, "logged_out");
    assert.equal(stored.queue.length, 1);
  });
});

describe("one visit is one stay on a site", () => {
  let world;
  beforeEach(async () => {
    world = await createWorld();
    await world.startTracking();
  });

  it("does not start a new visit when the URL changes inside the site (YouTube, X and other single-page apps)", async () => {
    await world.goTo(1, "https://www.youtube.com/");
    world.advance(10);
    await world.goTo(1, "https://www.youtube.com/@someone");
    world.advance(5);
    await world.goTo(1, "https://www.youtube.com/@someone/videos");
    world.advance(5);
    await world.goTo(1, "https://www.youtube.com/watch?v=abc");
    world.advance(30);
    await world.goTo(2, "https://github.com/");
    assert.equal(world.server.uploads.length, 1);
    const [visit] = world.server.uploads;
    assert.equal(visit.domain, "www.youtube.com");
    assert.equal(Date.parse(visit.endedAt) - Date.parse(visit.startedAt), 50_000);
    assert.equal(visit.url, "https://www.youtube.com/"); // keeps the page it started on
  });

  it("treats a page reload or a query-string change as the same visit", async () => {
    await world.goTo(1, "https://x.com/home");
    world.advance(20);
    await world.fire("updated", 1, { status: "complete" }, { id: 1, url: "https://x.com/home?lang=en", title: "T", active: true });
    world.advance(20);
    await world.goTo(2, "https://github.com/");
    assert.equal(world.server.uploads.length, 1);
    assert.equal(world.server.uploads[0].domain, "x.com");
  });

  it("treats www and the bare domain as the same site", async () => {
    await world.goTo(1, "https://youtube.com/");
    world.advance(10);
    await world.goTo(1, "https://www.youtube.com/watch?v=abc");
    world.advance(10);
    await world.goTo(2, "https://github.com/");
    assert.equal(world.server.uploads.length, 1);
  });

  it("carries the visit over to another tab on the same site, and closing the old tab does not end it", async () => {
    await world.goTo(1, "https://youtube.com/");
    world.advance(20);
    await world.goTo(2, "https://youtube.com/watch?v=abc"); // a video opened in a new tab
    world.advance(20);
    await world.fire("removed", 1); // the first tab is closed
    assert.equal(world.server.uploads.length, 0);
    assert.equal((await world.session.get("current")).current.tabId, 2);
    world.advance(20);
    await world.goTo(3, "https://github.com/");
    assert.equal(world.server.uploads.length, 1);
    assert.equal(Date.parse(world.server.uploads[0].endedAt) - Date.parse(world.server.uploads[0].startedAt), 60_000);
  });

  it("still starts a new visit when you move to a different site in the same tab", async () => {
    await world.goTo(1, "https://youtube.com/");
    world.advance(20);
    await world.goTo(1, "https://github.com/");
    world.advance(20);
    await world.goTo(1, "https://reddit.com/");
    assert.deepEqual(world.server.uploads.map((v) => v.domain), ["youtube.com", "github.com"]);
  });

  it("counts leaving a site and coming back as two visits", async () => {
    await world.goTo(1, "https://youtube.com/");
    world.advance(20);
    await world.goTo(2, "https://github.com/");
    world.advance(20);
    await world.goTo(1, "https://youtube.com/");
    world.advance(20);
    await world.goTo(2, "https://github.com/");
    assert.deepEqual(world.server.uploads.map((v) => v.domain), ["youtube.com", "github.com", "youtube.com"]);
  });

  it("keeps different subdomains apart: docs.google.com and mail.google.com are different sites", async () => {
    await world.goTo(1, "https://docs.google.com/document/d/1");
    world.advance(20);
    await world.goTo(1, "https://mail.google.com/mail/u/0");
    world.advance(20);
    await world.goTo(2, "https://github.com/");
    assert.deepEqual(world.server.uploads.map((v) => v.domain), ["docs.google.com", "mail.google.com"]);
  });

  it("still ends the visit when the browser loses focus, however much you navigated before", async () => {
    await world.goTo(1, "https://youtube.com/");
    world.advance(10);
    await world.goTo(1, "https://youtube.com/watch?v=abc");
    world.advance(20);
    await world.fire("focus", -1); // another app takes focus
    assert.equal(world.server.uploads.length, 1);
    assert.equal(Date.parse(world.server.uploads[0].endedAt) - Date.parse(world.server.uploads[0].startedAt), 30_000);
  });

  it("still never records the dashboard, even when it is the same host as nothing else", async () => {
    await world.goTo(1, "https://youtube.com/");
    world.advance(20);
    await world.goTo(2, "http://localhost:5173/");
    assert.equal(world.server.uploads.length, 1);
    assert.equal((await world.session.get("current")).current, undefined);
  });
});

describe("messages from the dashboard", () => {
  let world;
  beforeEach(async () => {
    world = await createWorld();
  });

  it("stores a valid token and marks the account connected", async () => {
    const reply = await world.message({ type: "SET_TOKEN", token: world.token(7) });
    assert.deepEqual(reply, { status: "ok" });
    const stored = await world.local.get(["token", "authState", "lastUserId"]);
    assert.equal(stored.authState, "ok");
    assert.equal(stored.lastUserId, 7);
  });

  it("rejects a token it cannot read, without touching what it has", async () => {
    await world.message({ type: "SET_TOKEN", token: world.token(7) });
    const reply = await world.message({ type: "SET_TOKEN", token: "not-a-jwt" });
    assert.deepEqual(reply, { status: "invalid" });
    assert.equal((await world.local.get("lastUserId")).lastUserId, 7);
  });

  it("drops the previous user's queued visits when a different account connects", async () => {
    await world.message({ type: "SET_TOKEN", token: world.token(7) });
    await world.local.set({ queue: [{ clientEventId: "old" }] });
    await world.message({ type: "SET_TOKEN", token: world.token(99) });
    assert.equal((await world.local.get("queue")).queue, undefined);
  });

  it("keeps the queue when the same account reconnects (it happens on every dashboard load)", async () => {
    await world.message({ type: "SET_TOKEN", token: world.token(7) });
    world.server.online = false;
    await world.local.set({ queue: [{ clientEventId: "mine" }] });
    await world.message({ type: "SET_TOKEN", token: world.token(7) });
    assert.equal((await world.local.get("queue")).queue.length, 1);
  });

  it("answers PING with its state so the dashboard can show it", async () => {
    assert.deepEqual(await world.message({ type: "PING" }), {
      status: "ok",
      version: "0.1.0",
      hasToken: false,
      authState: "none",
      tracking: false,
      queued: 0,
      lastUploadAt: null,
    });

    await world.message({ type: "SET_TOKEN", token: world.token(7) });
    await world.session.set({ tracking: true, checkedAt: Date.now() + 3_600_000 });
    await world.goTo(1, "https://a.com/");
    world.advance(30);
    await world.goTo(2, "https://b.com/");

    const ping = await world.message({ type: "PING" });
    assert.equal(ping.hasToken, true);
    assert.equal(ping.authState, "ok");
    assert.equal(ping.tracking, true);
    assert.equal(ping.queued, 0);
    assert.ok(ping.lastUploadAt, "records when the last upload succeeded");
  });

  it("on LOGOUT uploads the open visit, then forgets the account", async () => {
    await world.startTracking(7);
    await world.goTo(1, "https://a.com/");
    world.advance(60);

    assert.deepEqual(await world.message({ type: "LOGOUT" }), { status: "ok" });
    assert.equal(world.server.uploads.length, 1);
    const stored = await world.local.get(["token", "authState"]);
    assert.equal(stored.token, undefined);
    assert.equal(stored.authState, undefined);
    assert.equal((await world.message({ type: "PING" })).hasToken, false);
  });

  it("on TRACKING_CHANGED after Stop, ends the visit in progress at once, without waiting for the poll", async () => {
    await world.startTracking();
    await world.goTo(1, "https://a.com/");
    world.advance(45);
    world.server.tracking = false; // the dashboard has just pressed Stop
    const reply = await world.message({ type: "TRACKING_CHANGED" });
    assert.deepEqual(reply, { status: "ok", tracking: false });
    assert.equal(world.server.uploads.length, 1);
    assert.equal(Date.parse(world.server.uploads[0].endedAt) - Date.parse(world.server.uploads[0].startedAt), 45_000);
    assert.equal((await world.session.get("current")).current, undefined);
    assert.equal((await world.session.get("tracking")).tracking, false);
  });

  it("on TRACKING_CHANGED after Start, begins following the tab you are on", async () => {
    await world.local.set({ token: world.token(7) });
    world.server.tracking = false;
    await world.fire("alarm", { name: "poll" }); // it knows tracking is off
    await world.goTo(1, "https://a.com/");
    assert.equal((await world.session.get("current")).current, undefined);

    world.server.tracking = true; // the dashboard has just pressed Start
    const reply = await world.message({ type: "TRACKING_CHANGED" });
    assert.deepEqual(reply, { status: "ok", tracking: true });
    assert.equal((await world.session.get("current")).current.domain, "a.com");
  });

  it("on TRACKING_CHANGED keeps its last known state if the server cannot be reached, and still answers", async () => {
    await world.startTracking();
    world.server.online = false;
    const reply = await world.message({ type: "TRACKING_CHANGED" });
    assert.deepEqual(reply, { status: "ok", tracking: true });
  });

  it("on TRACKING_CHANGED with no account connected, answers that nothing is being tracked", async () => {
    const reply = await world.message({ type: "TRACKING_CHANGED" });
    assert.deepEqual(reply, { status: "ok", tracking: false });
  });

  it("on TRACKING_CHANGED uploads anything waiting in the queue", async () => {
    await world.startTracking();
    world.server.online = false;
    await world.goTo(1, "https://a.com/");
    world.advance(30);
    await world.goTo(2, "https://b.com/");
    assert.equal((await world.local.get("queue")).queue.length, 1);
    world.server.online = true;
    await world.message({ type: "TRACKING_CHANGED" });
    assert.equal(world.server.uploads.length, 1);
  });

  it("warns when the server dropped visits recorded outside a session, and still clears the queue", async () => {
    await world.startTracking();
    const warnings = [];
    const realWarn = console.warn;
    console.warn = (...args) => warnings.push(args.join(" "));
    try {
      world.server.rejected = 2;
      await world.goTo(1, "https://a.com/");
      world.advance(30);
      await world.goTo(2, "https://b.com/");
    } finally {
      console.warn = realWarn;
    }
    assert.ok(warnings.some((w) => /dropped 2 visit/.test(w)));
    assert.equal((await world.local.get("queue")).queue.length, 0);
  });

  it("ignores messages it does not know", async () => {
    assert.equal(await world.message({ type: "SOMETHING_ELSE" }), undefined);
    assert.equal(await world.message({ type: "constructor" }), undefined);
    assert.equal(await world.message(undefined), undefined);
  });
});
