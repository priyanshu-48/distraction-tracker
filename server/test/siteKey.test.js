import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import db from "../db.js";
import { addDays, todayIn } from "../domain/dates.js";
import { http, makeUser } from "./helpers.js";

// One site however it is reached: site_key() (migration 007) groups m.youtube.com with youtube.com.

const DATE = addDays(todayIn("UTC"), -2);
const at = (hhmm) => new Date(`${DATE}T${hhmm}:00Z`);

async function visit(userId, domain, hhmm, seconds) {
  const start = at(hhmm);
  await db.query(
    `INSERT INTO tab_activity (user_id, client_event_id, url, domain, title, started_at, ended_at, duration)
     VALUES ($1, $2, $3, $4, 't', $5, $6, $7)`,
    [userId, randomUUID(), `https://${domain}/`, domain, start, new Date(start.getTime() + seconds * 1000), seconds]
  );
}
const key = async (domain) => (await db.query("SELECT site_key($1) AS key", [domain])).rows[0].key;
const summary = (user) => http().get("/api/summary").query({ date: DATE, tz: "UTC" }).set(user.auth).expect(200);
const sites = (user, query = {}) => http().get("/api/sites").query({ tz: "UTC", days: 7, ...query }).set(user.auth).expect(200);
const mark = (user, domain, marked = true) => http().put(`/api/sites/${domain}`).set(user.auth).send({ marked });

describe("site_key()", () => {
  it.each([
    ["youtube.com", "youtube.com"],
    ["m.youtube.com", "youtube.com"],
    ["mobile.twitter.com", "twitter.com"],
    ["old.reddit.com", "reddit.com"],
    ["touch.example.org", "example.org"],
    ["youtu.be", "youtube.com"],
    ["x.com", "twitter.com"],
    ["fb.com", "facebook.com"],
  ])("maps %s to %s", async (domain, expected) => {
    expect(await key(domain)).toBe(expected);
  });

  it.each([
    "docs.google.com", // a different product: must stay apart from mail.google.com
    "mail.google.com",
    "news.ycombinator.com",
    "shop.example.co.uk",
    "m.com", // "m" is the whole name here, not a prefix
    "mobile.io",
    "localhost",
    "192.168.1.10",
    "",
  ])("leaves %j alone", async (domain) => {
    expect(await key(domain)).toBe(domain);
  });
});

describe("grouped sites list", () => {
  it("adds up the visits of every domain in a group", async () => {
    const user = await makeUser();
    await visit(user.id, "youtube.com", "10:00", 600);
    await visit(user.id, "m.youtube.com", "11:00", 300);
    await visit(user.id, "youtu.be", "12:00", 100);
    await visit(user.id, "github.com", "13:00", 50);
    const { body } = await sites(user);
    expect(body.sites.map((s) => [s.domain, s.seconds, s.visits])).toEqual([["youtube.com", 1000, 3], ["github.com", 50, 1]]);
  });

  it("searches by the group's name", async () => {
    const user = await makeUser();
    await visit(user.id, "m.youtube.com", "10:00", 60);
    expect((await sites(user, { q: "youtube" })).body.sites.map((s) => s.domain)).toEqual(["youtube.com"]);
  });
});

describe("marking a group", () => {
  it("marking any member marks the whole group, and says which group", async () => {
    const user = await makeUser();
    await visit(user.id, "youtube.com", "10:00", 600);
    await visit(user.id, "m.youtube.com", "11:00", 300);
    const res = await mark(user, "m.youtube.com").expect(200);
    expect(res.body).toEqual({ domain: "youtube.com", marked: true });
    expect((await sites(user)).body.sites).toMatchObject([{ domain: "youtube.com", marked: true, visits: 2 }]);
    const { totals } = (await summary(user)).body;
    expect(totals).toMatchObject({ distractedSeconds: 900, visits: 2 });
  });

  it("unmarking any member unmarks the group", async () => {
    const user = await makeUser();
    await visit(user.id, "m.youtube.com", "10:00", 60);
    await mark(user, "youtu.be");
    await mark(user, "youtube.com", false).expect(200);
    expect((await sites(user)).body.sites[0].marked).toBe(false);
    expect((await db.query("SELECT COUNT(*) FROM distraction_sites WHERE user_id = $1", [user.id])).rows[0].count).toBe("0");
  });

  it("marking twice is harmless", async () => {
    const user = await makeUser();
    await mark(user, "m.reddit.com").expect(200);
    await mark(user, "old.reddit.com").expect(200);
    expect((await db.query("SELECT domain FROM distraction_sites WHERE user_id = $1", [user.id])).rows).toEqual([{ domain: "reddit.com" }]);
  });
});

describe("Day summary groups sites", () => {
  it("shows one row for a group in top distractions, with the visits and time added up", async () => {
    const user = await makeUser();
    await mark(user, "youtube.com");
    await visit(user.id, "youtube.com", "10:00", 600);
    await visit(user.id, "m.youtube.com", "10:20", 300);
    const { topSites, recent } = (await summary(user)).body;
    expect(topSites).toHaveLength(1);
    expect(topSites[0]).toMatchObject({ domain: "youtube.com", seconds: 900, visits: 2 });
    expect(recent.map((r) => r.domain)).toEqual(["youtube.com", "youtube.com"]);
  });

  it("uses the group for the usual (earlier same weekdays)", async () => {
    const user = await makeUser();
    await mark(user, "youtube.com");
    const lastWeek = addDays(DATE, -7);
    await visit(user.id, "m.youtube.com", "10:00", 600);
    await db.query(
      `INSERT INTO tab_activity (user_id, client_event_id, url, domain, title, started_at, ended_at, duration)
       VALUES ($1, gen_random_uuid(), 'https://x/', 'youtube.com', 't', $2, $3, 1200)`,
      [user.id, new Date(`${lastWeek}T10:00:00Z`), new Date(`${lastWeek}T10:20:00Z`)]
    );
    expect((await summary(user)).body.topSites[0]).toMatchObject({ domain: "youtube.com", usualSeconds: 1200 });
  });

  it("does not call two visits to the same group a trigger for each other", async () => {
    const user = await makeUser();
    await mark(user, "youtube.com");
    await visit(user.id, "m.youtube.com", "10:00", 60); // not marked as a distraction itself? it is: same group
    await visit(user.id, "youtube.com", "10:01", 60);
    expect((await summary(user)).body.triggers).toEqual([]);
  });

  it("counts a visit to a group's other domain as the thing that came before", async () => {
    const user = await makeUser();
    await mark(user, "reddit.com");
    await visit(user.id, "github.com", "10:00", 60);
    await visit(user.id, "old.reddit.com", "10:01", 60);
    expect((await summary(user)).body.triggers).toEqual([{ from: "github.com", to: "reddit.com", count: 1 }]);
  });
});

describe("migration 007 (existing marks follow their group)", () => {
  it("moves a mark on a member domain to the group, without duplicates", async () => {
    const user = await makeUser();
    await db.query(
      "INSERT INTO distraction_sites (user_id, domain) VALUES ($1, 'm.legacy.com'), ($1, 'legacy.com'), ($1, 'old.other.org'), ($1, 'plain.net')",
      [user.id]
    );
    await db.query(readFileSync(new URL("../db/migrations/007_site_key.sql", import.meta.url), "utf8"));
    const marks = await db.query("SELECT domain FROM distraction_sites WHERE user_id = $1 ORDER BY domain", [user.id]);
    expect(marks.rows.map((r) => r.domain)).toEqual(["legacy.com", "other.org", "plain.net"]);
  });
});
