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

  const server = { tracking: true, online: true, status: 200, uploads: [] };
  globalThis.fetch = async (url, options = {}) => {
    if (!server.online) throw new TypeError("Failed to fetch");
    if (url.endsWith("/is-tracking")) {
      return { ok: server.status === 200, status: server.status, json: async () => ({ isTracking: server.tracking }) };
    }
    if (url.endsWith("/intervals")) {
      if (server.status === 200) server.uploads.push(...JSON.parse(options.body).intervals);
      return { ok: server.status === 200, status: server.status, text: async () => "" };
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

  it("ignores messages it does not know", async () => {
    assert.equal(await world.message({ type: "SOMETHING_ELSE" }), undefined);
    assert.equal(await world.message({ type: "constructor" }), undefined);
    assert.equal(await world.message(undefined), undefined);
  });
});
