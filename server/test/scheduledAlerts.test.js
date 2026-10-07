import { describe, it, expect, beforeEach, vi } from "vitest";
import { randomUUID } from "node:crypto";
import db from "../db.js";
import { http, makeUser } from "./helpers.js";
import { createNotifier } from "../notifications/notifier.js";
import { resetScheduler, runScheduledNotifications, startScheduler } from "../notifications/scheduler.js";

// 2026-03-09 is a Monday. "Last week" is then Mon 2026-03-02 to Sun 2026-03-08; the week before is 2026-02-23 to 2026-03-01.
const fakeNotifier = () => ({ enabled: true, send: vi.fn().mockResolvedValue({ id: "n" }) });
const quiet = { warn: vi.fn(), info: vi.fn() };
const at = (iso) => new Date(iso);

beforeEach(() => resetScheduler());

async function enable(user, timeZone = "UTC") {
  await http().put("/api/notifications/settings").set(user.auth).send({ enabled: true, timeZone }).expect(200);
}
const setBudget = (user, dailyBudgetSeconds) => http().put("/api/settings").set(user.auth).send({ dailyBudgetSeconds }).expect(200);
const mark = (user, domain) => http().put(`/api/sites/${domain}`).set(user.auth).send({ marked: true }).expect(200);
async function visit(user, { domain = "youtube.com", start, seconds }) {
  await db.query(
    `INSERT INTO tab_activity (user_id, client_event_id, url, domain, title, started_at, ended_at, duration)
     VALUES ($1, $2, $3, $4, '', $5, $5::timestamptz + make_interval(secs => $6), $6)`,
    [user.id, randomUUID(), `https://${domain}/`, domain, start, seconds]
  );
}
/** One visit of `seconds` at noon UTC on each listed date. */
const visitsOn = async (user, dates, seconds, domain = "youtube.com") => {
  for (const date of dates) await visit(user, { domain, start: `${date}T12:00:00Z`, seconds });
};
const keys = async (user) => (await db.query("SELECT dedupe_key FROM alerts WHERE user_id = $1 ORDER BY id", [user.id])).rows.map((r) => r.dedupe_key);
const streakKeys = async (user) => (await keys(user)).filter((key) => key.startsWith("streak:"));
const streakMessages = (notifier, user) => sentTo(notifier, user).filter((message) => message.type === "streak");
const sentTo = (notifier, user) => notifier.send.mock.calls.filter(([recipient]) => recipient.id === user.id).map(([, message]) => message);

async function ready(budget = 3600) {
  const user = await makeUser();
  await enable(user);
  await setBudget(user, budget);
  await mark(user, "youtube.com");
  return user;
}

describe("the weekly summary", () => {
  // Last week: 5 weekdays of 30 minutes. The week before: 3 days of an hour. So 2h 30m, down 17% from 3h.
  async function withTwoWeeks() {
    const user = await ready();
    await visitsOn(user, ["2026-02-23", "2026-02-24", "2026-02-25"], 3600);
    await visitsOn(user, ["2026-03-02", "2026-03-03", "2026-03-04", "2026-03-05", "2026-03-06"], 1800);
    return user;
  }

  it("is sent on Monday morning with the week's time, the change, the days under budget and the biggest site", async () => {
    const user = await withTwoWeeks();
    const notifier = fakeNotifier();
    expect(await runScheduledNotifications({ now: at("2026-03-09T09:30:00Z"), notifier, log: quiet })).toBe(1);
    expect(await keys(user)).toEqual(["weekly:2026-03-02"]);
    const [message] = sentTo(notifier, user);
    expect(message).toMatchObject({
      type: "weekly-summary",
      idempotencyKey: `tracker:${user.id}:weekly:2026-03-02`,
      title: "Your week: 2h 30m on distraction sites",
      body: "17% less than the week before. 5 of 5 tracked days under your daily budget of 1h. Biggest: youtube.com (2h 30m).",
      channels: ["in_app", "email"],
    });
  });

  it("is sent once: not again in the same run, after a restart, or on the days after", async () => {
    const user = await withTwoWeeks();
    const notifier = fakeNotifier();
    await runScheduledNotifications({ now: at("2026-03-09T09:30:00Z"), notifier, log: quiet });
    await runScheduledNotifications({ now: at("2026-03-09T09:45:00Z"), notifier, log: quiet });
    resetScheduler(); // a restart forgets what it looked at; the alert row remembers
    await runScheduledNotifications({ now: at("2026-03-09T10:00:00Z"), notifier, log: quiet });
    await runScheduledNotifications({ now: at("2026-03-10T10:00:00Z"), notifier, log: quiet });
    expect(sentTo(notifier, user)).toHaveLength(1);
    expect(await keys(user)).toEqual(["weekly:2026-03-02"]);
  });

  it.each([
    ["on Monday before 09:00", "2026-03-09T08:59:00Z", 0],
    ["on Tuesday (catching up after a server that was down)", "2026-03-10T10:00:00Z", 1],
    ["on Wednesday night (the last chance)", "2026-03-11T23:00:00Z", 1],
    ["on Thursday (too late: a stale summary is not sent)", "2026-03-12T10:00:00Z", 0],
    ["on a Saturday", "2026-03-14T10:00:00Z", 0],
  ])("%s", async (_label, now, expected) => {
    await withTwoWeeks();
    expect(await runScheduledNotifications({ now: at(now), notifier: fakeNotifier(), log: quiet })).toBe(expected);
  });

  it("follows the user's own Monday morning, not UTC's", async () => {
    const user = await makeUser();
    await enable(user, "Asia/Kolkata");
    await setBudget(user, 3600);
    await mark(user, "youtube.com");
    for (const date of ["2026-03-02", "2026-03-03", "2026-03-04"]) await visit(user, { start: `${date}T06:30:00Z`, seconds: 1200 }); // noon in India
    const notifier = fakeNotifier();
    // 03:00 UTC on Monday is 08:30 in India: not yet. 03:45 UTC is 09:15 there.
    expect(await runScheduledNotifications({ now: at("2026-03-09T03:00:00Z"), notifier, log: quiet })).toBe(0);
    expect(await runScheduledNotifications({ now: at("2026-03-09T03:45:00Z"), notifier, log: quiet })).toBe(1);
  });

  it("says nothing for a week in which nothing was tracked", async () => {
    const user = await ready();
    await visitsOn(user, ["2026-02-23"], 3600); // only the week before
    expect(await runScheduledNotifications({ now: at("2026-03-09T09:30:00Z"), notifier: fakeNotifier(), log: quiet })).toBe(0);
    expect(await keys(user)).toEqual([]);
  });

  it("reports a week with no time on distraction sites, without naming one and without a comparison to a zero", async () => {
    const user = await ready();
    await visitsOn(user, ["2026-03-02", "2026-03-03"], 1800, "docs.example.com"); // tracked, but not a marked site
    const notifier = fakeNotifier();
    await runScheduledNotifications({ now: at("2026-03-09T09:30:00Z"), notifier, log: quiet });
    const [message] = sentTo(notifier, user);
    expect(message.title).toBe("Your week: no time on distraction sites");
    expect(message.body).toBe("2 of 2 tracked days under your daily budget of 1h.");
  });

  it("is only for users who switched notifications on, and only for their own data", async () => {
    const off = await makeUser();
    await mark(off, "youtube.com");
    await visitsOn(off, ["2026-03-02"], 1800);
    const on = await ready();
    await visitsOn(on, ["2026-03-02"], 600);
    const notifier = fakeNotifier();
    await runScheduledNotifications({ now: at("2026-03-09T09:30:00Z"), notifier, log: quiet });
    expect(sentTo(notifier, off)).toEqual([]);
    expect(sentTo(notifier, on)).toHaveLength(1);
    expect(sentTo(notifier, on)[0].title).toBe("Your week: 10m on distraction sites");
  });

  it("does nothing when the server is not connected to a notification service", async () => {
    const user = await withTwoWeeks();
    expect(await runScheduledNotifications({ now: at("2026-03-09T09:30:00Z"), notifier: createNotifier({ env: {} }), log: quiet })).toBe(0);
    expect(await keys(user)).toEqual([]);
  });

  it("goes on to the next user when one fails", async () => {
    const first = await ready();
    const second = await ready();
    await visitsOn(first, ["2026-03-02"], 600);
    await visitsOn(second, ["2026-03-02"], 600);
    const notifier = { enabled: true, send: vi.fn(async (recipient) => { if (recipient.id === first.id) throw new Error("boom"); return { id: "n" }; }) };
    const log = { warn: vi.fn(), info: vi.fn() };
    await runScheduledNotifications({ now: at("2026-03-09T09:30:00Z"), notifier, log });
    expect(log.warn).toHaveBeenCalledOnce();
    expect(await keys(second)).toEqual(["weekly:2026-03-02"]);
  });
});

describe("streak milestones", () => {
  const dates = (from, count) => Array.from({ length: count }, (_, i) => new Date(Date.parse(`${from}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10));

  it("announces 3 days under budget on the morning after the third, once", async () => {
    const user = await ready();
    await visitsOn(user, dates("2026-03-01", 3), 600);
    const notifier = fakeNotifier();
    await runScheduledNotifications({ now: at("2026-03-04T09:30:00Z"), notifier, log: quiet });
    expect(await streakKeys(user)).toEqual(["streak:3:2026-03-03"]);
    expect(streakMessages(notifier, user)[0]).toMatchObject({
      type: "streak",
      title: "3 days in a row under your budget",
      body: "Every tracked day stayed within 1h of distraction time. Keep it going.",
      idempotencyKey: `tracker:${user.id}:streak:3:2026-03-03`,
    });
    resetScheduler();
    await runScheduledNotifications({ now: at("2026-03-04T11:00:00Z"), notifier, log: quiet });
    expect(streakMessages(notifier, user)).toHaveLength(1);
  });

  it("announces each milestone on the day it is reached and nothing in between", async () => {
    const user = await ready();
    await visitsOn(user, dates("2026-03-01", 14), 600);
    const notifier = fakeNotifier();
    for (const day of dates("2026-03-02", 15)) {
      resetScheduler();
      await runScheduledNotifications({ now: at(`${day}T09:30:00Z`), notifier, log: quiet });
    }
    expect(await streakKeys(user)).toEqual(["streak:3:2026-03-03", "streak:7:2026-03-07", "streak:14:2026-03-14"]);
  });

  it("does not count a day over budget, and a new run can earn the milestone again", async () => {
    const user = await ready();
    await visitsOn(user, ["2026-03-01", "2026-03-02"], 600);
    await visitsOn(user, ["2026-03-03"], 9000); // over the 1 h budget: breaks the run
    await visitsOn(user, ["2026-03-04", "2026-03-05", "2026-03-06"], 600);
    const notifier = fakeNotifier();
    await runScheduledNotifications({ now: at("2026-03-04T09:30:00Z"), notifier, log: quiet }); // 2 days, then a break
    expect(await streakKeys(user)).toEqual([]);
    resetScheduler();
    await runScheduledNotifications({ now: at("2026-03-07T09:30:00Z"), notifier, log: quiet }); // a fresh run of 3
    expect(await streakKeys(user)).toEqual(["streak:3:2026-03-06"]);
  });

  it("skips a day with nothing tracked instead of breaking the run, and does not announce it twice", async () => {
    const user = await ready();
    await visitsOn(user, ["2026-03-01", "2026-03-03", "2026-03-04"], 600); // nothing on the 2nd
    const notifier = fakeNotifier();
    await runScheduledNotifications({ now: at("2026-03-05T09:30:00Z"), notifier, log: quiet });
    expect(await streakKeys(user)).toEqual(["streak:3:2026-03-04"]);
    resetScheduler();
    await runScheduledNotifications({ now: at("2026-03-06T09:30:00Z"), notifier, log: quiet }); // the 5th was untracked
    expect(streakMessages(notifier, user)).toHaveLength(1);
  });

  it("ignores today, which is not finished", async () => {
    const user = await ready();
    await visitsOn(user, ["2026-03-01", "2026-03-02", "2026-03-03"], 600); // the 3rd is "today" below
    const notifier = fakeNotifier();
    await runScheduledNotifications({ now: at("2026-03-03T09:30:00Z"), notifier, log: quiet });
    expect(streakMessages(notifier, user)).toEqual([]);
  });

  it("waits until 09:00 in the user's own time", async () => {
    const user = await ready();
    await visitsOn(user, dates("2026-03-01", 3), 600);
    const notifier = fakeNotifier();
    await runScheduledNotifications({ now: at("2026-03-04T08:59:00Z"), notifier, log: quiet });
    expect(streakMessages(notifier, user)).toEqual([]);
    await runScheduledNotifications({ now: at("2026-03-04T09:00:00Z"), notifier, log: quiet });
    expect(streakMessages(notifier, user)).toHaveLength(1);
  });

  it("is only for users who switched notifications on", async () => {
    const off = await makeUser();
    await mark(off, "youtube.com");
    await visitsOn(off, dates("2026-03-01", 3), 600);
    const notifier = fakeNotifier();
    expect(await runScheduledNotifications({ now: at("2026-03-04T09:30:00Z"), notifier, log: quiet })).toBe(0);
    expect(notifier.send).not.toHaveBeenCalled();
  });
});

describe("the schedule", () => {
  it("does not start without a notification service", () => {
    expect(startScheduler({ notifier: createNotifier({ env: {} }) })).toBeNull();
  });

  it("checks at once when it starts, so a restart does not wait 15 minutes, then keeps checking", async () => {
    const user = await ready();
    await visitsOn(user, ["2026-03-02"], 600);
    // The real clock is used when it starts, so this only proves it runs and survives; the due-time rules are tested above.
    const notifier = fakeNotifier();
    const timer = startScheduler({ notifier, intervalMs: 3_600_000, log: quiet });
    try {
      expect(timer).not.toBeNull();
      await new Promise((resolve) => setTimeout(resolve, 150));
    } finally {
      clearInterval(timer);
    }
  });
});
