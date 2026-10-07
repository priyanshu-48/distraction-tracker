import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import db from "../db.js";
import { http, makeTrackingUser, interval } from "./helpers.js";

const DAY = 1440; // minutes

const visit = (domain, { daysAgo = 0, seconds = 60 } = {}) =>
  interval({ minsAgo: daysAgo * DAY + 30, seconds, domain, url: `https://${domain}/` });

const upload = (user, intervals) => http().post("/api/intervals").set(user.auth).send({ intervals }).expect(200);
const list = (user, query = {}) => http().get("/api/sites").query({ tz: "UTC", ...query }).set(user.auth).expect(200);
const mark = (user, domain, marked = true) => http().put(`/api/sites/${domain}`).set(user.auth).send({ marked });
const domains = (res) => res.body.sites.map((s) => s.domain);

describe("authentication", () => {
  it("is required for both endpoints", async () => {
    await http().get("/api/sites").expect(401);
    await http().put("/api/sites/youtube.com").send({ marked: true }).expect(401);
  });
});

describe("GET /api/sites", () => {
  it("is empty for a user with no data", async () => {
    const user = await makeTrackingUser();
    expect((await list(user)).body).toEqual({ days: 7, total: 0, sites: [] });
  });

  it("totals time and visits per site, most time first", async () => {
    const user = await makeTrackingUser();
    await upload(user, [
      visit("youtube.com", { seconds: 600 }),
      visit("youtube.com", { seconds: 300 }),
      visit("github.com", { seconds: 100 }),
    ]);
    const { sites } = (await list(user)).body;
    expect(sites.map((s) => s.domain)).toEqual(["youtube.com", "github.com"]);
    expect(sites[0]).toMatchObject({ seconds: 900, visits: 2, avgSeconds: 450, marked: false, type: null });
    expect(sites[0].lastSeen).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("only counts the requested window, in days", async () => {
    const user = await makeTrackingUser();
    await upload(user, [visit("recent.com", { daysAgo: 2 }), visit("old.com", { daysAgo: 10 })]);
    expect(domains(await list(user, { days: 7 }))).toEqual(["recent.com"]);
    expect(domains(await list(user, { days: 30 })).sort()).toEqual(["old.com", "recent.com"]);
  });

  it("labels checking habits and binges from the visit pattern", async () => {
    const user = await makeTrackingUser();
    await upload(user, [
      ...Array.from({ length: 10 }, () => visit("glance.com", { seconds: 20 })),
      visit("long.com", { seconds: 2000 }),
      visit("middle.com", { seconds: 300 }),
    ]);
    const byDomain = Object.fromEntries((await list(user)).body.sites.map((s) => [s.domain, s.type]));
    expect(byDomain).toEqual({ "glance.com": "checking", "long.com": "binge", "middle.com": null });
  });

  it("keeps each user's data and marks separate", async () => {
    const a = await makeTrackingUser("a");
    const b = await makeTrackingUser("b");
    await upload(a, [visit("youtube.com")]);
    await mark(a, "youtube.com").expect(200);
    expect((await list(b)).body.sites).toEqual([]);

    await upload(b, [visit("youtube.com")]);
    expect((await list(b)).body.sites[0].marked).toBe(false);
    expect((await list(a)).body.sites[0].marked).toBe(true);
  });
});

describe("marking sites", () => {
  it("marks and unmarks, and repeating either is harmless", async () => {
    const user = await makeTrackingUser();
    await upload(user, [visit("youtube.com")]);

    expect((await mark(user, "youtube.com").expect(200)).body).toEqual({ domain: "youtube.com", marked: true });
    await mark(user, "youtube.com").expect(200);
    expect((await list(user)).body.sites[0].marked).toBe(true);
    const { rows } = await db.query("SELECT COUNT(*) FROM distraction_sites WHERE user_id = $1", [user.id]);
    expect(Number(rows[0].count)).toBe(1);

    await mark(user, "youtube.com", false).expect(200);
    await mark(user, "youtube.com", false).expect(200);
    expect((await list(user)).body.sites[0].marked).toBe(false);
  });

  it("lists a marked site even when it has no visits in the window", async () => {
    const user = await makeTrackingUser();
    await mark(user, "never-visited.com").expect(200);
    const res = await list(user, { filter: "distractions" });
    expect(res.body.sites).toEqual([
      expect.objectContaining({ domain: "never-visited.com", marked: true, seconds: 0, visits: 0, avgSeconds: 0, lastSeen: null, type: null }),
    ]);
  });

  it("treats www and capitalisation as the same site", async () => {
    const user = await makeTrackingUser();
    await upload(user, [visit("WWW.Reddit.com", { seconds: 100 }), visit("reddit.com", { seconds: 50 })]);
    await mark(user, "WWW.REDDIT.com").expect(200);

    const { sites } = (await list(user)).body;
    expect(sites).toHaveLength(1);
    expect(sites[0]).toMatchObject({ domain: "reddit.com", seconds: 150, visits: 2, marked: true });
  });

  it.each([
    ["a b"],
    ["-bad.com"],
    ["bad-.com"],
    ["www."],
    ["a".repeat(254)],
  ])("rejects the domain %j", async (domain) => {
    const user = await makeTrackingUser();
    await http().put(`/api/sites/${encodeURIComponent(domain)}`).set(user.auth).send({ marked: true }).expect(400);
  });

  it("rejects a body without a boolean `marked`", async () => {
    const user = await makeTrackingUser();
    await http().put("/api/sites/youtube.com").set(user.auth).send({}).expect(400);
    await http().put("/api/sites/youtube.com").set(user.auth).send({ marked: "yes" }).expect(400);
  });

  it("no longer serves the old POST /api/distraction-sites", async () => {
    const user = await makeTrackingUser();
    await http().post("/api/distraction-sites").set(user.auth).send({ domain: "youtube.com" }).expect(404);
  });
});

describe("filtering, searching, sorting and paging", () => {
  async function seeded() {
    const user = await makeTrackingUser();
    await upload(user, [
      visit("youtube.com", { seconds: 900 }),
      visit("youtube.com", { seconds: 900 }),
      visit("reddit.com", { seconds: 600 }),
      visit("github.com", { seconds: 300 }),
    ]);
    await mark(user, "youtube.com");
    await mark(user, "reddit.com");
    return user;
  }

  it("filters by marked or unmarked", async () => {
    const user = await seeded();
    expect(domains(await list(user, { filter: "distractions" }))).toEqual(["youtube.com", "reddit.com"]);
    expect(domains(await list(user, { filter: "unmarked" }))).toEqual(["github.com"]);
    expect((await list(user, { filter: "all" })).body.total).toBe(3);
  });

  it("searches by part of the name, case-insensitively", async () => {
    const user = await seeded();
    expect(domains(await list(user, { q: "TUB" }))).toEqual(["youtube.com"]);
  });

  it("treats % and _ in the search as plain characters", async () => {
    const user = await seeded();
    expect((await list(user, { q: "%" })).body.sites).toEqual([]);
    expect((await list(user, { q: "_" })).body.sites).toEqual([]);
  });

  it("sorts by time, visits or name", async () => {
    const user = await seeded();
    expect(domains(await list(user, { sort: "time" }))).toEqual(["youtube.com", "reddit.com", "github.com"]);
    expect(domains(await list(user, { sort: "visits" }))[0]).toBe("youtube.com");
    expect(domains(await list(user, { sort: "name" }))).toEqual(["github.com", "reddit.com", "youtube.com"]);
  });

  it("pages through results and reports the full total", async () => {
    const user = await seeded();
    const first = (await list(user, { sort: "name", limit: 2, offset: 0 })).body;
    const second = (await list(user, { sort: "name", limit: 2, offset: 2 })).body;
    expect(first.total).toBe(3);
    expect(first.sites.map((s) => s.domain)).toEqual(["github.com", "reddit.com"]);
    expect(second.sites.map((s) => s.domain)).toEqual(["youtube.com"]);
  });

  it.each([
    ["days=5", { days: 5 }],
    ["an unknown filter", { filter: "all-of-them" }],
    ["an unknown sort", { sort: "random" }],
    ["limit=0", { limit: 0 }],
    ["limit=1000", { limit: 1000 }],
    ["a negative offset", { offset: -1 }],
    ["a very long search", { q: "x".repeat(101) }],
  ])("rejects %s with 400", async (_label, query) => {
    const user = await makeTrackingUser();
    await http().get("/api/sites").query(query).set(user.auth).expect(400);
  });
});

describe("time zones", () => {
  it("starts the window at the user's local midnight", async () => {
    const user = await makeTrackingUser();
    // 1 day ago in UTC is 'yesterday' for UTC, so a 1-day window excludes it everywhere it is clearly before local midnight.
    await upload(user, [visit("today.com", { daysAgo: 0 }), visit("twodays.com", { daysAgo: 2 })]);
    expect(domains(await list(user, { days: 7, tz: "Asia/Kolkata" })).sort()).toEqual(["today.com", "twodays.com"]);
    expect(domains(await list(user, { days: 7, tz: "Not/AZone" })).sort()).toEqual(["today.com", "twodays.com"]);
  });
});

describe("migration 005 (normalise existing domains)", () => {
  it("lower-cases and strips www, merging duplicate marks", async () => {
    const user = await makeTrackingUser();
    // Insert un-normalised rows directly, the way data created before this change looks.
    await db.query(
      `INSERT INTO tab_activity (user_id, client_event_id, url, domain, title, started_at, ended_at, duration)
       VALUES ($1, gen_random_uuid(), 'https://x/', 'WWW.Legacy.com', 't', NOW(), NOW(), 1),
              ($1, gen_random_uuid(), 'https://x/', 'm.legacy.com', 't', NOW(), NOW(), 1)`,
      [user.id]
    );
    await db.query(
      "INSERT INTO distraction_sites (user_id, domain) VALUES ($1, 'www.legacy.com'), ($1, 'legacy.com'), ($1, 'Other.com')",
      [user.id]
    );

    await db.query(readFileSync(new URL("../db/migrations/005_normalize_domains.sql", import.meta.url), "utf8"));

    const activity = await db.query("SELECT domain FROM tab_activity WHERE user_id = $1 ORDER BY domain", [user.id]);
    expect(activity.rows.map((r) => r.domain)).toEqual(["legacy.com", "m.legacy.com"]);
    const marks = await db.query("SELECT domain FROM distraction_sites WHERE user_id = $1 ORDER BY domain", [user.id]);
    expect(marks.rows.map((r) => r.domain)).toEqual(["legacy.com", "other.com"]);
  });
});
