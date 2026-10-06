import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import db from "../db.js";
import { addDays, todayIn } from "../domain/dates.js";
import { getDaySummary } from "../models/summaryModel.js";
import { http, makeUser } from "./helpers.js";

// A day three days ago in UTC: always inside the allowed window, with explicit instants so nothing depends on "now".
const DATE = addDays(todayIn("UTC"), -3);
const at = (hhmm, date = DATE) => new Date(`${date}T${hhmm}:00Z`);

async function visit(userId, domain, start, seconds) {
  const startedAt = start instanceof Date ? start : at(start);
  await db.query(
    `INSERT INTO tab_activity (user_id, client_event_id, url, domain, title, started_at, ended_at, duration)
     VALUES ($1, $2, $3, $4, 't', $5, $6, $7)`,
    [userId, randomUUID(), `https://${domain}/`, domain, startedAt, new Date(startedAt.getTime() + seconds * 1000), seconds]
  );
}
const mark = (userId, ...domains) =>
  Promise.all(domains.map((d) => db.query("INSERT INTO distraction_sites (user_id, domain) VALUES ($1, $2)", [userId, d])));
const session = (userId, start, end) =>
  db.query("INSERT INTO tracking_sessions (user_id, start_time, end_time) VALUES ($1, $2, $3)", [userId, at(start), end ? at(end) : null]);

const get = (user, query = {}) => http().get("/api/summary").query({ date: DATE, tz: "UTC", ...query }).set(user.auth);

describe("GET /api/summary: access and validation", () => {
  it("requires authentication", async () => {
    await http().get("/api/summary").query({ date: DATE }).expect(401);
  });

  it.each([
    ["no date", {}],
    ["a malformed date", { date: "yesterday" }],
    ["an impossible date", { date: "2026-02-30" }],
    ["a date in the future", { date: addDays(todayIn("UTC"), 2) }],
    ["a date older than 90 days", { date: addDays(todayIn("UTC"), -95) }],
  ])("rejects %s with 400", async (_label, query) => {
    const user = await makeUser();
    await http().get("/api/summary").query(query).set(user.auth).expect(400);
  });

  it("accepts today and the oldest day of the window", async () => {
    const user = await makeUser();
    await get(user, { date: todayIn("UTC") }).expect(200);
    await get(user, { date: addDays(todayIn("UTC"), -89) }).expect(200);
  });

  it("falls back to UTC for a time zone it does not know", async () => {
    const user = await makeUser();
    expect((await get(user, { tz: "Not/AZone" }).expect(200)).body.timeZone).toBe("UTC");
  });
});

describe("an empty day", () => {
  it("returns zeros, empty lists, an empty timeline and seven empty days", async () => {
    const user = await makeUser();
    const { body } = await get(user).expect(200);
    expect(body).toMatchObject({
      date: DATE,
      timeZone: "UTC",
      budgetSeconds: 7200,
      totals: { distractedSeconds: 0, otherSeconds: 0, trackedSeconds: 0, visits: 0, avgVisitSeconds: 0, type: null },
      topSites: [],
      toClassify: [],
      recent: [],
      triggers: [],
      focus: { longestStretchSeconds: 0, firstDistractionAfterSeconds: null },
      timeline: { sessions: [], spans: [] },
      usual: { days: 0, distractedSeconds: null, paceSeconds: null },
    });
    expect(body.hourly).toBeUndefined();
    expect(body.recentDays.map((d) => d.date)).toEqual([-6, -5, -4, -3, -2, -1, 0].map((n) => addDays(DATE, n)));
    expect(body.recentDays.every((d) => d.distractedSeconds === 0 && d.trackedSeconds === 0)).toBe(true);
  });
});

describe("a day with activity", () => {
  async function seeded() {
    const user = await makeUser();
    await mark(user.id, "youtube.com", "reddit.com");
    await visit(user.id, "github.com", "09:00", 1800);
    await visit(user.id, "youtube.com", "09:30", 600);
    await visit(user.id, "youtube.com", "10:00", 300);
    await visit(user.id, "reddit.com", "10:10", 60);
    await visit(user.id, "docs.dev", "10:15", 900);
    await session(user.id, "09:00", "12:00");
    return user;
  }

  it("splits tracked time into distraction and other", async () => {
    const { body } = await get(await seeded()).expect(200);
    expect(body.totals).toMatchObject({ distractedSeconds: 960, otherSeconds: 2700, trackedSeconds: 3660, visits: 3, avgVisitSeconds: 320 });
  });

  it("lists distractions, unmarked sites and recent visits", async () => {
    const { body } = await get(await seeded()).expect(200);
    expect(body.topSites.map((s) => [s.domain, s.seconds, s.visits])).toEqual([["youtube.com", 900, 2], ["reddit.com", 60, 1]]);
    expect(body.toClassify.map((s) => s.domain)).toEqual(["github.com", "docs.dev"]);
    expect(body.recent.map((r) => r.domain)).toEqual(["docs.dev", "reddit.com", "youtube.com", "youtube.com", "github.com"]);
    expect(body.recent[0]).toMatchObject({ seconds: 900, marked: false });
  });

  it("reports focus: the longest stretch and the time to the first distraction", async () => {
    const { body } = await get(await seeded()).expect(200);
    expect(body.focus).toEqual({ longestStretchSeconds: 1800, firstDistractionAfterSeconds: 1800 });
  });

  it("uses the user's own budget", async () => {
    const user = await seeded();
    await http().put("/api/settings").set(user.auth).send({ dailyBudgetSeconds: 1800 }).expect(200);
    expect((await get(user).expect(200)).body.budgetSeconds).toBe(1800);
  });

  it("never mixes in another user's data or marks", async () => {
    const user = await seeded();
    const other = await makeUser("other");
    await visit(other.id, "youtube.com", "09:00", 9999);
    expect((await get(other).expect(200)).body.totals.distractedSeconds).toBe(0); // other has not marked it
    expect((await get(user).expect(200)).body.totals.distractedSeconds).toBe(960);
  });

  it("treats a reclassified site as a distraction for the whole day, past visits included", async () => {
    const user = await seeded();
    await mark(user.id, "github.com");
    const { body } = await get(user).expect(200);
    expect(body.totals.distractedSeconds).toBe(960 + 1800);
    expect(body.toClassify.map((s) => s.domain)).toEqual(["docs.dev"]);
  });

  it("only includes visits that started on the requested day", async () => {
    const user = await makeUser();
    await visit(user.id, "a.com", at("23:30", addDays(DATE, -1)), 600); // the day before
    await visit(user.id, "a.com", "00:00", 60);
    await visit(user.id, "a.com", at("00:00", addDays(DATE, 1)), 60); // the day after
    expect((await get(user).expect(200)).body.totals.trackedSeconds).toBe(60);
  });
});

describe("timeline", () => {
  it("lists sessions with the distraction time inside each, and a running session with no end", async () => {
    const user = await makeUser();
    await mark(user.id, "reddit.com");
    await session(user.id, "09:00", "10:00");
    await session(user.id, "14:00", null);
    await visit(user.id, "reddit.com", "09:10", 300);
    await visit(user.id, "a.com", "09:20", 600);
    await visit(user.id, "reddit.com", "14:05", 120);
    const { timeline } = (await get(user).expect(200)).body;
    expect(timeline.sessions).toEqual([
      { start: at("09:00").toISOString(), end: at("10:00").toISOString(), distractedSeconds: 300 },
      { start: at("14:00").toISOString(), end: null, distractedSeconds: 120 },
    ]);
  });

  it("draws visits at their real times: distractions keep their site, other time is anonymous", async () => {
    const user = await makeUser();
    await mark(user.id, "reddit.com");
    await visit(user.id, "a.com", "10:00", 600);
    await visit(user.id, "reddit.com", "10:30", 300);
    const { spans } = (await get(user).expect(200)).body.timeline;
    expect(spans).toEqual([
      { kind: "other", domain: null, start: at("10:00").toISOString(), end: at("10:10").toISOString(), visits: 1, seconds: 600 },
      { kind: "distraction", domain: "reddit.com", start: at("10:30").toISOString(), end: at("10:35").toISOString(), visits: 1, seconds: 300 },
    ]);
  });

  it("follows the user's wall clock around a daylight-saving change without losing time", async () => {
    // New York, 8 March 2026: at 02:00 clocks jump to 03:00. 06:50Z to 07:10Z spans the jump.
    const user = await makeUser();
    await visit(user.id, "a.com", new Date("2026-03-08T06:50:00Z"), 1200);
    const summary = await getDaySummary(user.id, "2026-03-08", "America/New_York");
    expect(summary.timeline.spans).toHaveLength(1);
    expect(summary.timeline.spans[0].seconds).toBe(1200);
    expect(summary.totals.otherSeconds).toBe(1200);
  });
});

describe("time zones decide which day a visit is on", () => {
  it("puts a late-evening UTC visit on the next day in Kolkata", async () => {
    const user = await makeUser();
    await visit(user.id, "a.com", "19:00", 600); // 19:00Z = 00:30 the next day in Kolkata
    expect((await get(user, { tz: "UTC" }).expect(200)).body.totals.otherSeconds).toBe(600);
    expect((await get(user, { tz: "Asia/Kolkata" }).expect(200)).body.totals.otherSeconds).toBe(0);
    expect((await get(user, { tz: "Asia/Kolkata", date: addDays(DATE, 1) }).expect(200)).body.totals.otherSeconds).toBe(600);
  });
});

describe("triggers", () => {
  it("counts what you were on right before each distraction, most common first", async () => {
    const user = await makeUser();
    await mark(user.id, "reddit.com", "twitter.com");
    // github -> reddit, three times, each within a minute
    for (const hhmm of ["09:00", "10:00", "11:00"]) {
      await visit(user.id, "github.com", hhmm, 300);
      await visit(user.id, "reddit.com", new Date(at(hhmm).getTime() + 330_000), 60); // 30 s after github ended
    }
    await visit(user.id, "mail.com", "13:00", 120);
    await visit(user.id, "twitter.com", new Date(at("13:00").getTime() + 150_000), 60); // mail -> twitter, once
    const { triggers } = (await get(user).expect(200)).body;
    expect(triggers).toEqual([
      { from: "github.com", to: "reddit.com", count: 3 },
      { from: "mail.com", to: "twitter.com", count: 1 },
    ]);
  });

  it("ignores a distraction that follows another distraction", async () => {
    const user = await makeUser();
    await mark(user.id, "reddit.com", "youtube.com");
    await visit(user.id, "reddit.com", "10:00", 300);
    await visit(user.id, "youtube.com", at("10:05"), 300);
    expect((await get(user).expect(200)).body.triggers).toEqual([]);
  });

  it("ignores a distraction that came long after the previous visit", async () => {
    const user = await makeUser();
    await mark(user.id, "reddit.com");
    await visit(user.id, "github.com", "10:00", 300); // ends 10:05
    await visit(user.id, "reddit.com", "10:20", 60); // 15 minutes later
    expect((await get(user).expect(200)).body.triggers).toEqual([]);
  });

  it("looks back seven days", async () => {
    const user = await makeUser();
    await mark(user.id, "reddit.com");
    const sixDaysBefore = addDays(DATE, -6);
    const sevenDaysBefore = addDays(DATE, -7);
    await visit(user.id, "github.com", at("10:00", sixDaysBefore), 300);
    await visit(user.id, "reddit.com", at("10:05", sixDaysBefore), 60);
    await visit(user.id, "github.com", at("10:00", sevenDaysBefore), 300);
    await visit(user.id, "reddit.com", at("10:05", sevenDaysBefore), 60);
    const { triggers } = (await get(user).expect(200)).body;
    expect(triggers).toEqual([{ from: "github.com", to: "reddit.com", count: 1 }]);
  });
});

describe("last seven days", () => {
  it("totals each local day, oldest first, with empty days as zeros", async () => {
    const user = await makeUser();
    await mark(user.id, "reddit.com");
    await visit(user.id, "reddit.com", at("10:00", addDays(DATE, -6)), 600);
    await visit(user.id, "a.com", at("11:00", addDays(DATE, -6)), 900);
    await visit(user.id, "reddit.com", at("10:00", DATE), 300);
    await visit(user.id, "reddit.com", at("10:00", addDays(DATE, -7)), 9999); // just outside the window
    await visit(user.id, "reddit.com", at("10:00", addDays(DATE, 1)), 9999); // the day after
    const { recentDays } = (await get(user).expect(200)).body;
    expect(recentDays).toHaveLength(7);
    expect(recentDays[0]).toEqual({ date: addDays(DATE, -6), distractedSeconds: 600, trackedSeconds: 1500 });
    expect(recentDays[6]).toEqual({ date: DATE, distractedSeconds: 300, trackedSeconds: 300 });
    expect(recentDays[1]).toEqual({ date: addDays(DATE, -5), distractedSeconds: 0, trackedSeconds: 0 });
  });

  it("puts a visit on the user's local day", async () => {
    const user = await makeUser();
    await visit(user.id, "a.com", at("19:00", addDays(DATE, -1)), 600); // 00:30 on DATE in Kolkata
    const { recentDays } = (await get(user, { tz: "Asia/Kolkata" }).expect(200)).body;
    expect(recentDays.find((d) => d.date === DATE).trackedSeconds).toBe(600);
    expect(recentDays.find((d) => d.date === addDays(DATE, -1)).trackedSeconds).toBe(0);
  });
});

describe("what is usual", () => {
  async function weeks(user, seconds) {
    // seconds[i] of reddit on the same weekday i+1 weeks earlier; null = a day with nothing tracked
    for (const [i, value] of seconds.entries()) {
      if (value === null) continue;
      const day = addDays(DATE, -7 * (i + 1));
      await visit(user.id, "a.com", at("09:00", day), 60);
      if (value > 0) await visit(user.id, "reddit.com", at("10:00", day), value);
    }
  }

  it("averages the distraction time of the same weekday over the last four weeks", async () => {
    const user = await makeUser();
    await mark(user.id, "reddit.com");
    await weeks(user, [600, 1200, 0, 1800]);
    await visit(user.id, "reddit.com", "10:00", 100);
    const { usual, topSites } = (await get(user).expect(200)).body;
    expect(usual).toEqual({ days: 4, distractedSeconds: 900, paceSeconds: null });
    expect(topSites[0]).toMatchObject({ domain: "reddit.com", usualSeconds: 900 });
  });

  it("skips weekdays with nothing tracked instead of counting them as zero", async () => {
    const user = await makeUser();
    await mark(user.id, "reddit.com");
    await weeks(user, [600, null, null, 1200]);
    expect((await get(user).expect(200)).body.usual).toEqual({ days: 2, distractedSeconds: 900, paceSeconds: null });
  });

  it("ignores other weekdays and anything older than four weeks", async () => {
    const user = await makeUser();
    await mark(user.id, "reddit.com");
    await visit(user.id, "reddit.com", at("10:00", addDays(DATE, -6)), 7777); // wrong weekday
    await visit(user.id, "reddit.com", at("10:00", addDays(DATE, -35)), 7777); // five weeks back
    expect((await get(user).expect(200)).body.usual).toEqual({ days: 0, distractedSeconds: null, paceSeconds: null });
  });

  it("gives a site that was absent on usual days a usual of zero, and null when there is no history", async () => {
    const user = await makeUser();
    await mark(user.id, "reddit.com", "youtube.com");
    await weeks(user, [600]);
    await visit(user.id, "youtube.com", "10:00", 100);
    const { topSites } = (await get(user).expect(200)).body;
    expect(topSites.find((s) => s.domain === "youtube.com").usualSeconds).toBe(0);

    const fresh = await makeUser("fresh");
    await mark(fresh.id, "reddit.com");
    await visit(fresh.id, "reddit.com", "10:00", 100);
    expect((await get(fresh).expect(200)).body.topSites[0].usualSeconds).toBeNull();
  });
});

describe("usual by now (pace)", () => {
  // DATE stands in for "today" at 14:00 UTC; each earlier same weekday has distraction time before and after 14:00.
  const NOW = at("14:00");
  async function history(user) {
    await mark(user.id, "reddit.com");
    for (const n of [7, 14]) {
      const day = addDays(DATE, -n);
      await visit(user.id, "a.com", at("09:00", day), 60);
      await visit(user.id, "reddit.com", at("11:00", day), 600); // before 14:00
      await visit(user.id, "reddit.com", at("13:50", day), 1200); // 13:50 to 14:10: counts up to 14:00 only
      await visit(user.id, "reddit.com", at("15:00", day), 5000); // after 14:00: not yet
    }
    for (const n of [21, 28]) await visit(user.id, "a.com", at("10:00", addDays(DATE, -n)), 60); // tracked, nothing distracting
  }

  it("is how much had usually built up at this time of day, averaged over the days with tracking", async () => {
    const user = await makeUser();
    await history(user);
    const { usual } = await getDaySummary(user.id, DATE, "UTC", NOW);
    expect(usual.days).toBe(4);
    expect(usual.paceSeconds).toBe(Math.round((2 * (600 + 600)) / 4)); // two days with 1200 s by 14:00, two with none
    expect(usual.distractedSeconds).toBe(Math.round((2 * (600 + 1200 + 5000)) / 4)); // the full-day usual is unchanged
  });

  it("follows the time of day, not the day's total", async () => {
    const user = await makeUser();
    await history(user);
    expect((await getDaySummary(user.id, DATE, "UTC", at("10:00"))).usual.paceSeconds).toBe(0);
    expect((await getDaySummary(user.id, DATE, "UTC", at("23:00"))).usual.paceSeconds).toBe(Math.round((2 * 6800) / 4));
  });

  it("uses the user's wall clock", async () => {
    const user = await makeUser();
    await mark(user.id, "reddit.com");
    const day = addDays(DATE, -7);
    await visit(user.id, "reddit.com", at("04:00", day), 600); // 09:30 to 09:40 in Kolkata
    // 14:00Z is 19:30 in Kolkata, by which time that visit had finished
    expect((await getDaySummary(user.id, DATE, "Asia/Kolkata", NOW)).usual.paceSeconds).toBe(600);
    // at 04:05Z (09:35 in Kolkata) that visit was half done: only the first five minutes count
    expect((await getDaySummary(user.id, DATE, "Asia/Kolkata", at("04:05"))).usual.paceSeconds).toBe(300);
  });

  it("is null for a day that is over and when there is no history", async () => {
    const user = await makeUser();
    await history(user);
    expect((await getDaySummary(user.id, DATE, "UTC", at("14:00", addDays(DATE, 1)))).usual.paceSeconds).toBeNull();
    const fresh = await makeUser("fresh");
    expect((await getDaySummary(fresh.id, DATE, "UTC", NOW)).usual.paceSeconds).toBeNull();
  });
});
