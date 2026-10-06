import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import db from "../db.js";
import { addDays, todayIn } from "../domain/dates.js";
import { getRangeSummary } from "../models/rangeModel.js";
import { http, makeUser } from "./helpers.js";

// Fixed dates so nothing depends on today. 2026-03-09 is a Monday: the week under test is 9 to 15 March, the
// previous week 2 to 8 March, and "today" for the model is 20 March.
const NOW = new Date("2026-03-20T12:00:00Z");
const at = (date, hhmm) => new Date(`${date}T${hhmm}:00Z`);

async function visit(userId, domain, date, hhmm, seconds, when = at(date, hhmm)) {
  await db.query(
    `INSERT INTO tab_activity (user_id, client_event_id, url, domain, title, started_at, ended_at, duration)
     VALUES ($1, $2, $3, $4, 't', $5, $6, $7)`,
    [userId, randomUUID(), `https://${domain}/`, domain, when, new Date(when.getTime() + seconds * 1000), seconds]
  );
}
const mark = (userId, ...domains) =>
  Promise.all(domains.map((d) => db.query("INSERT INTO distraction_sites (user_id, domain) VALUES ($1, $2)", [userId, d])));
const session = (userId, date, from, to) =>
  db.query("INSERT INTO tracking_sessions (user_id, start_time, end_time) VALUES ($1, $2, $3)", [userId, at(date, from), at(date, to)]);
const setBudget = (user, seconds) => http().put("/api/settings").set(user.auth).send({ dailyBudgetSeconds: seconds }).expect(200);
const range = (user, view = "week", date = "2026-03-11", tz = "UTC", now = NOW) => getRangeSummary(user.id, view, date, tz, now);

/** The week of 9 to 15 March with something to say, and the week before it. Budget 1000 s. */
async function seeded() {
  const user = await makeUser();
  await setBudget(user, 1000);
  await mark(user.id, "reddit.com", "youtube.com");
  // previous week: Mon 400 s of reddit, Tue 1000 s of youtube
  await visit(user.id, "reddit.com", "2026-03-02", "10:00", 400);
  await visit(user.id, "youtube.com", "2026-03-03", "10:00", 1000);
  // this week
  await visit(user.id, "github.com", "2026-03-09", "09:00", 600);
  await visit(user.id, "reddit.com", "2026-03-09", "10:00", 900);
  await visit(user.id, "reddit.com", "2026-03-10", "11:30", 300);
  await visit(user.id, "youtube.com", "2026-03-10", "11:55", 200);
  await visit(user.id, "reddit.com", "2026-03-12", "10:50", 2000);
  await session(user.id, "2026-03-09", "09:00", "12:00");
  await session(user.id, "2026-03-10", "11:00", "12:00");
  await session(user.id, "2026-03-12", "10:00", "12:00");
  return user;
}

describe("GET /api/range: access and validation", () => {
  const today = todayIn("UTC");
  const get = (user, query) => http().get("/api/range").query(query).set(user.auth);

  it("requires authentication", async () => {
    await http().get("/api/range").query({ view: "week", date: today }).expect(401);
  });

  it.each([
    ["no view", { date: todayIn("UTC") }],
    ["the day view (that is /api/summary)", { view: "day", date: todayIn("UTC") }],
    ["an unknown view", { view: "year", date: todayIn("UTC") }],
    ["no date", { view: "week" }],
    ["a malformed date", { view: "week", date: "yesterday" }],
    ["an impossible date", { view: "week", date: "2026-02-30" }],
    ["a date in the future", { view: "week", date: addDays(todayIn("UTC"), 2) }],
    ["a date older than 90 days", { view: "month", date: addDays(todayIn("UTC"), -95) }],
  ])("rejects %s with 400", async (_label, query) => {
    const user = await makeUser();
    await get(user, query).expect(400);
  });

  it("accepts both views for today and for the oldest day of the window", async () => {
    const user = await makeUser();
    for (const view of ["week", "month"]) {
      await get(user, { view, date: today }).expect(200);
      await get(user, { view, date: addDays(today, -89) }).expect(200);
    }
  });

  it("returns the whole payload over HTTP", async () => {
    const user = await makeUser();
    const { body } = await get(user, { view: "week", date: today, tz: "UTC" }).expect(200);
    expect(body).toMatchObject({ view: "week", timeZone: "UTC", budgetSeconds: 7200 });
    expect(Object.keys(body)).toEqual(
      expect.arrayContaining(["start", "end", "through", "days", "totals", "previous", "streak", "topSites", "movers", "heatmap"])
    );
  });
});

describe("an empty period", () => {
  it("returns a full set of zero days, no sites and an empty heatmap", async () => {
    const user = await makeUser();
    const result = await range(user);
    expect(result.days).toHaveLength(7);
    expect(result.totals).toEqual({ distractedSeconds: 0, trackedSeconds: 0, visits: 0, daysTracked: 0, daysUnderBudget: 0, avgDistractedSeconds: null });
    expect(result.topSites).toEqual([]);
    expect(result.movers).toEqual({ up: [], down: [] });
    expect(result.best).toBeNull();
    expect(result.streak).toEqual({ current: 0, longest: 0 });
    expect(result.heatmap.flat().every((n) => n === 0)).toBe(true);
  });
});

describe("a week with activity", () => {
  it("covers Monday to Sunday and totals each day", async () => {
    const result = await range(await seeded());
    expect([result.start, result.end, result.through]).toEqual(["2026-03-09", "2026-03-15", "2026-03-15"]);
    expect(result.days.map((d) => [d.distractedSeconds, d.trackedSeconds, d.visits])).toEqual([
      [900, 1500, 1], // Mon
      [500, 500, 2], // Tue
      [0, 0, 0], // Wed
      [2000, 2000, 1], // Thu
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ]);
  });

  it("adds up totals and counts tracked days and days under budget", async () => {
    const { totals } = await range(await seeded());
    expect(totals).toEqual({ distractedSeconds: 3400, trackedSeconds: 4000, visits: 4, daysTracked: 3, daysUnderBudget: 2, avgDistractedSeconds: 1133 });
  });

  it("finds the best and worst tracked day", async () => {
    const result = await range(await seeded());
    expect(result.best).toEqual({ date: "2026-03-10", distractedSeconds: 500 });
    expect(result.worst).toEqual({ date: "2026-03-12", distractedSeconds: 2000 });
  });

  it("compares with the previous week", async () => {
    const { previous } = await range(await seeded());
    expect(previous).toMatchObject({ start: "2026-03-02", end: "2026-03-08", distractedSeconds: 1400, trackedSeconds: 1400, visits: 2, daysTracked: 2 });
  });

  it("lists distraction sites only, biggest first, with what they were the week before", async () => {
    const { topSites } = await range(await seeded());
    expect(topSites.map((s) => [s.domain, s.seconds, s.visits, s.previousSeconds])).toEqual([
      ["reddit.com", 3200, 3, 400],
      ["youtube.com", 200, 1, 1000],
    ]); // github.com is not marked
  });

  it("reports the biggest movers up and down", async () => {
    const { movers } = await range(await seeded());
    expect(movers.up).toEqual([{ domain: "reddit.com", seconds: 3200, previousSeconds: 400, change: 2800 }]);
    expect(movers.down).toEqual([{ domain: "youtube.com", seconds: 200, previousSeconds: 1000, change: -800 }]);
  });

  it("builds the weekday by hour heatmap, splitting a visit across the hours it spans", async () => {
    const { heatmap } = await range(await seeded());
    expect(heatmap[0][10]).toBe(900); // Monday 10:00, reddit
    expect(heatmap[1][11]).toBe(500); // Tuesday 11:30 (300 s) and 11:55 (200 s)
    expect(heatmap[3][10]).toBe(600); // Thursday 10:50 for 2000 s: 600 s in hour 10 ...
    expect(heatmap[3][11]).toBe(1400); // ... and 1400 s in hour 11
    expect(heatmap.flat().reduce((a, b) => a + b, 0)).toBe(3400); // the same total as the days
  });

  it("measures how soon after a session started the first distraction came, per day", async () => {
    const { days } = await range(await seeded());
    expect(days[0].firstDistractionAfterSeconds).toBe(3600); // Monday: session 09:00, reddit 10:00
    expect(days[1].firstDistractionAfterSeconds).toBe(1800); // Tuesday: 11:00 and 11:30
    expect(days[3].firstDistractionAfterSeconds).toBe(3000); // Thursday: 10:00 and 10:50
    expect(days[2].firstDistractionAfterSeconds).toBeNull(); // Wednesday: nothing
  });

  it("gives the streak as of today", async () => {
    // history: prev Mon 400, prev Tue 1000, Mon 900, Tue 500 are all within 1000 s; Thursday's 2000 s ends it
    const { streak } = await range(await seeded());
    expect(streak).toEqual({ current: 0, longest: 4 });
  });

  it("never mixes in another user's data or marks", async () => {
    const user = await seeded();
    const other = await makeUser("other");
    await visit(other.id, "reddit.com", "2026-03-09", "10:00", 9999);
    expect((await range(other)).totals.distractedSeconds).toBe(0); // other has not marked it
    expect((await range(user)).totals.distractedSeconds).toBe(3400);
  });

  it("treats a site marked later as a distraction for the whole period, past visits included", async () => {
    const user = await seeded();
    await mark(user.id, "github.com");
    expect((await range(user)).totals.distractedSeconds).toBe(3400 + 600);
  });

  it("groups a site's domains: m.youtube.com counts as youtube.com", async () => {
    const user = await seeded();
    await visit(user.id, "m.youtube.com", "2026-03-11", "10:00", 300);
    const { topSites } = await range(user);
    expect(topSites.find((s) => s.domain === "youtube.com")).toMatchObject({ seconds: 500, visits: 2 });
    expect(topSites.some((s) => s.domain === "m.youtube.com")).toBe(false);
  });
});

describe("a period still in progress", () => {
  it("covers the days so far and compares with the same days of the previous week", async () => {
    const user = await seeded();
    // Tuesday noon: Monday and Tuesday are done, so the comparison is Monday to Tuesday of the week before
    const result = await range(user, "week", "2026-03-10", "UTC", new Date("2026-03-10T12:00:00Z"));
    expect(result.through).toBe("2026-03-10");
    expect(result.totals.distractedSeconds).toBe(1400); // Monday 900 + Tuesday 500; Thursday is still in the future
    expect(result.days).toHaveLength(7);
    expect(result.days[3].distractedSeconds).toBe(0);
    expect(result.previous).toMatchObject({ start: "2026-03-02", end: "2026-03-03", distractedSeconds: 1400 });
  });
});

describe("months", () => {
  async function marchAndFebruary() {
    const user = await makeUser();
    await mark(user.id, "reddit.com");
    await visit(user.id, "reddit.com", "2026-03-03", "10:00", 600);
    await visit(user.id, "reddit.com", "2026-03-10", "10:00", 1800);
    await visit(user.id, "reddit.com", "2026-02-03", "10:00", 300);
    await visit(user.id, "reddit.com", "2026-02-20", "10:00", 9999); // after the 15th: outside the like-for-like window
    return user;
  }

  it("covers the calendar month and compares a month in progress with the same days of the last one", async () => {
    const result = await range(await marchAndFebruary(), "month", "2026-03-15", "UTC", new Date("2026-03-15T12:00:00Z"));
    expect([result.start, result.end, result.through]).toEqual(["2026-03-01", "2026-03-31", "2026-03-15"]);
    expect(result.days).toHaveLength(31);
    expect(result.totals).toMatchObject({ distractedSeconds: 2400, daysTracked: 2 });
    expect(result.previous).toMatchObject({ start: "2026-02-01", end: "2026-02-15", distractedSeconds: 300, daysTracked: 1 });
  });

  it("compares a finished month with the whole previous month, which can be shorter", async () => {
    const result = await range(await marchAndFebruary(), "month", "2026-03-15", "UTC", new Date("2026-04-05T12:00:00Z"));
    expect(result.through).toBe("2026-03-31");
    expect(result.previous).toMatchObject({ start: "2026-02-01", end: "2026-02-28", distractedSeconds: 300 + 9999 });
  });
});

describe("time zones decide which day a visit is on", () => {
  it("puts a late-evening UTC visit on the next day in Kolkata, in the days and in the heatmap", async () => {
    const user = await makeUser();
    await mark(user.id, "reddit.com");
    await visit(user.id, "reddit.com", "2026-03-10", "19:00", 600); // 00:30 on Wednesday 11 March in Kolkata
    const utc = await range(user, "week", "2026-03-11", "UTC");
    expect(utc.days[1].distractedSeconds).toBe(600); // Tuesday
    expect(utc.heatmap[1][19]).toBe(600);
    const kolkata = await range(user, "week", "2026-03-11", "Asia/Kolkata", NOW);
    expect(kolkata.days[1].distractedSeconds).toBe(0);
    expect(kolkata.days[2].distractedSeconds).toBe(600); // Wednesday
    expect(kolkata.heatmap[2][0]).toBe(600);
  });

  it("splits a visit across an hour boundary on the user's own clock, in a half-hour zone", async () => {
    const user = await makeUser();
    await mark(user.id, "reddit.com");
    await visit(user.id, "reddit.com", "2026-03-10", "04:50", 3000); // 04:50Z is 10:20 in Kolkata (UTC+5:30), so 10:20 to 11:10
    const { heatmap } = await range(user, "week", "2026-03-11", "Asia/Kolkata", NOW);
    expect(heatmap[1][10]).toBe(2400); // 10:20 to 11:00
    expect(heatmap[1][11]).toBe(600); // 11:00 to 11:10
  });
});
