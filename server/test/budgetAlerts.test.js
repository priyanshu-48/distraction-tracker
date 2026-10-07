import { describe, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import db from "../db.js";
import { http, makeUser } from "./helpers.js";
import { checkBudgetAlerts } from "../notifications/budgetAlerts.js";
import { createNotifier } from "../notifications/notifier.js";

// A fixed "now" (noon UTC on a Tuesday) makes "today" the same for every run; visits are placed relative to it.
const NOW = new Date("2026-03-10T12:00:00Z");
const DAY = "2026-03-10";

const fakeNotifier = () => ({ enabled: true, send: vi.fn().mockResolvedValue({ id: "n1", status: "queued", replayed: false }) });

async function enable(user, timeZone = "UTC") {
  await http().put("/api/notifications/settings").set(user.auth).send({ enabled: true, timeZone }).expect(200);
}
const setBudget = (user, dailyBudgetSeconds) => http().put("/api/settings").set(user.auth).send({ dailyBudgetSeconds }).expect(200);
const mark = (user, domain) => http().put(`/api/sites/${domain}`).set(user.auth).send({ marked: true }).expect(200);

/** A finished visit stored directly, so the test controls exactly when it happened. */
async function visit(user, { domain = "youtube.com", start = "2026-03-10T09:00:00Z", seconds }) {
  await db.query(
    `INSERT INTO tab_activity (user_id, client_event_id, url, domain, title, started_at, ended_at, duration)
     VALUES ($1, $2, $3, $4, '', $5, $5::timestamptz + make_interval(secs => $6), $6)`,
    [user.id, randomUUID(), `https://${domain}/`, domain, start, seconds]
  );
}
const alertKeys = async (user) => (await db.query("SELECT dedupe_key FROM alerts WHERE user_id = $1 ORDER BY id", [user.id])).rows.map((r) => r.dedupe_key);

// 1 hour budget; 2900 s is just past 80%, 3700 s just past the budget.
async function setup() {
  const user = await makeUser();
  await enable(user);
  await setBudget(user, 3600);
  await mark(user, "youtube.com");
  return user;
}

describe("raising a budget alert", () => {
  it("does nothing while the user is under 80%", async () => {
    const user = await setup();
    await visit(user, { seconds: 2400 });
    const notifier = fakeNotifier();
    expect(await checkBudgetAlerts(user.id, { now: NOW, notifier })).toBeNull();
    expect(await alertKeys(user)).toEqual([]);
    expect(notifier.send).not.toHaveBeenCalled();
  });

  it("raises one alert when 80% is passed, naming the site, and sends it once with a stable key", async () => {
    const user = await setup();
    await visit(user, { seconds: 2900 });
    const notifier = fakeNotifier();
    const alert = await checkBudgetAlerts(user.id, { now: NOW, notifier });
    expect(alert).toMatchObject({ kind: "budget-warning", title: "80% of today's distraction budget used" });
    expect(await alertKeys(user)).toEqual([`budget:${DAY}:80`]);
    expect(notifier.send).toHaveBeenCalledOnce();
    const [recipient, message] = notifier.send.mock.calls[0];
    expect(recipient).toEqual({ id: user.id, email: user.email });
    expect(message).toMatchObject({ idempotencyKey: `tracker:${user.id}:budget:${DAY}:80`, type: "budget-warning" });
    expect(message.body).toContain("youtube.com");
  });

  it("raises each level once a day, however many times it is checked", async () => {
    const user = await setup();
    await visit(user, { seconds: 2900 });
    const notifier = fakeNotifier();
    await checkBudgetAlerts(user.id, { now: NOW, notifier });
    await checkBudgetAlerts(user.id, { now: NOW, notifier });
    await checkBudgetAlerts(user.id, { now: NOW, notifier });
    expect(notifier.send).toHaveBeenCalledOnce();

    await visit(user, { seconds: 800, start: "2026-03-10T10:00:00Z" }); // 3700 s total: over the budget
    expect(await checkBudgetAlerts(user.id, { now: NOW, notifier })).toMatchObject({ kind: "budget-over" });
    expect(await checkBudgetAlerts(user.id, { now: NOW, notifier })).toBeNull();
    expect(await alertKeys(user)).toEqual([`budget:${DAY}:80`, `budget:${DAY}:100`]);
    expect(notifier.send).toHaveBeenCalledTimes(2);
  });

  it("goes straight to 'over budget' when one long visit passes both levels", async () => {
    const user = await setup();
    await visit(user, { seconds: 5000 });
    const notifier = fakeNotifier();
    expect(await checkBudgetAlerts(user.id, { now: NOW, notifier })).toMatchObject({ kind: "budget-over" });
    expect(await alertKeys(user)).toEqual([`budget:${DAY}:100`]);
    await checkBudgetAlerts(user.id, { now: NOW, notifier });
    expect(notifier.send).toHaveBeenCalledOnce();
  });

  it("starts fresh the next day", async () => {
    const user = await setup();
    await visit(user, { seconds: 2900 });
    const notifier = fakeNotifier();
    await checkBudgetAlerts(user.id, { now: NOW, notifier });
    await visit(user, { seconds: 2900, start: "2026-03-11T09:00:00Z" });
    await checkBudgetAlerts(user.id, { now: new Date("2026-03-11T12:00:00Z"), notifier });
    expect(await alertKeys(user)).toEqual([`budget:${DAY}:80`, "budget:2026-03-11:80"]);
  });

  it("counts only sites the user marked as distractions", async () => {
    const user = await setup();
    await visit(user, { domain: "docs.example.com", seconds: 9000 });
    await visit(user, { seconds: 600 });
    expect(await checkBudgetAlerts(user.id, { now: NOW, notifier: fakeNotifier() })).toBeNull();
  });

  it("counts only the user's own visits", async () => {
    const user = await setup();
    const other = await makeUser("other");
    await mark(other, "youtube.com");
    await visit(other, { seconds: 9000 });
    expect(await checkBudgetAlerts(user.id, { now: NOW, notifier: fakeNotifier() })).toBeNull();
  });

  it("uses the user's own midnight: late evening UTC can already be tomorrow", async () => {
    const india = await setup();
    await enable(india, "Asia/Kolkata");
    // 19:00 UTC on the 10th is 00:30 on the 11th in India: a 10:00 UTC visit belongs to "yesterday" there.
    await visit(india, { seconds: 2900, start: "2026-03-10T10:00:00Z" });
    expect(await checkBudgetAlerts(india.id, { now: new Date("2026-03-10T19:00:00Z"), notifier: fakeNotifier() })).toBeNull();

    const london = await setup();
    await visit(london, { seconds: 2900, start: "2026-03-10T10:00:00Z" });
    expect(await checkBudgetAlerts(london.id, { now: new Date("2026-03-10T19:00:00Z"), notifier: fakeNotifier() })).not.toBeNull();
  });
});

describe("when nothing should be sent", () => {
  it("does nothing for a user who has not switched notifications on, and records no alert", async () => {
    const user = await makeUser();
    await setBudget(user, 3600);
    await mark(user, "youtube.com");
    await visit(user, { seconds: 5000 });
    const notifier = fakeNotifier();
    expect(await checkBudgetAlerts(user.id, { now: NOW, notifier })).toBeNull();
    expect(await alertKeys(user)).toEqual([]);
    expect(notifier.send).not.toHaveBeenCalled();
  });

  it("does nothing, and reads nothing, when the server is not connected to a notification service", async () => {
    const user = await setup();
    await visit(user, { seconds: 5000 });
    const notifier = createNotifier({ env: {} });
    expect(await checkBudgetAlerts(user.id, { now: NOW, notifier })).toBeNull();
    expect(await alertKeys(user)).toEqual([]);
  });

  it("still records the alert for the pop-up when the notification service is down", async () => {
    const user = await setup();
    await visit(user, { seconds: 2900 });
    const client = { upsertUser: vi.fn().mockRejectedValue(new Error("service asleep")), send: vi.fn() };
    const notifier = createNotifier({ client, log: { warn: vi.fn() } });
    await expect(checkBudgetAlerts(user.id, { now: NOW, notifier })).resolves.toMatchObject({ kind: "budget-warning" });
    expect(await alertKeys(user)).toEqual([`budget:${DAY}:80`]);
  });

  it("sends the same alert only once when two checks run at the same moment", async () => {
    const user = await setup();
    await visit(user, { seconds: 2900 });
    const notifier = fakeNotifier();
    await Promise.all([checkBudgetAlerts(user.id, { now: NOW, notifier }), checkBudgetAlerts(user.id, { now: NOW, notifier })]);
    expect(notifier.send).toHaveBeenCalledOnce();
    expect(await alertKeys(user)).toEqual([`budget:${DAY}:80`]);
  });
});
