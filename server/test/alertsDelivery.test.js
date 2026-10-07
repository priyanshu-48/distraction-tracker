import { describe, it, expect, afterEach, vi } from "vitest";
import db from "../db.js";
import { http, makeTrackingUser, makeUser, interval } from "./helpers.js";
import { setNotifier } from "../notifications/notifier.js";
import { settleBackground } from "../notifications/background.js";

const extensionAuth = async (user) => ({
  Authorization: `Bearer ${(await http().post("/api/auth/extension-token").set(user.auth).expect(200)).body.token}`,
});
// The extension asks for alerts explicitly; the dashboard asks the same question without it.
const poll = async (auth) => (await http().get("/api/is-tracking?alerts=1").set(auth).expect(200)).body;
const dashboardPoll = async (auth) => (await http().get("/api/is-tracking").set(auth).expect(200)).body;
const addAlert = (user, key, { title = "Heads up", minutesOld = 0 } = {}) =>
  db.query(
    "INSERT INTO alerts (user_id, dedupe_key, kind, title, body, created_at) VALUES ($1, $2, 'budget-warning', $3, 'body', NOW() - make_interval(mins => $4))",
    [user.id, key, title, minutesOld]
  );

afterEach(() => setNotifier(undefined));

describe("alerts reach the extension through the poll it already makes", () => {
  it("keeps the old answer for a user with no alerts", async () => {
    const user = await makeUser();
    expect(await poll(user.auth)).toEqual({ isTracking: false });
  });

  it("hands over waiting alerts once, oldest first, with the extension's limited token", async () => {
    const user = await makeUser();
    await addAlert(user, "a", { title: "first" });
    await addAlert(user, "b", { title: "second" });
    const ext = await extensionAuth(user);

    const first = await poll(ext);
    expect(first.isTracking).toBe(false);
    expect(first.alerts.map((a) => a.title)).toEqual(["first", "second"]);
    expect(first.alerts[0]).toMatchObject({ kind: "budget-warning", body: "body" });
    expect(await poll(ext)).toEqual({ isTracking: false }); // shown once
  });

  it("hands over at most three per poll and the rest on the next", async () => {
    const user = await makeUser();
    for (const key of ["a", "b", "c", "d", "e"]) await addAlert(user, key, { title: key });
    expect((await poll(user.auth)).alerts.map((a) => a.title)).toEqual(["a", "b", "c"]);
    expect((await poll(user.auth)).alerts.map((a) => a.title)).toEqual(["d", "e"]);
  });

  it("ignores alerts too old to be news", async () => {
    const user = await makeUser();
    await addAlert(user, "old", { minutesOld: 7 * 60 });
    expect(await poll(user.auth)).toEqual({ isTracking: false });
  });

  it("never shows one user another user's alerts", async () => {
    const mine = await makeUser("mine");
    const theirs = await makeUser("theirs");
    await addAlert(theirs, "x", { title: "private" });
    expect(await poll(mine.auth)).toEqual({ isTracking: false });
    expect((await poll(theirs.auth)).alerts).toHaveLength(1);
  });

  it("leaves alerts alone for a poll that does not ask for them, so the dashboard cannot swallow them", async () => {
    const user = await makeUser();
    await addAlert(user, "a", { title: "for the extension" });
    expect(await dashboardPoll(user.auth)).toEqual({ isTracking: false });
    expect(await dashboardPoll(user.auth)).toEqual({ isTracking: false });
    expect((await poll(user.auth)).alerts.map((a) => a.title)).toEqual(["for the extension"]); // still there for the extension
  });

  it("drops waiting alerts when the user switches notifications off", async () => {
    const user = await makeUser();
    await addAlert(user, "a");
    await http().put("/api/notifications/settings").set(user.auth).send({ enabled: false, timeZone: "UTC" }).expect(200);
    expect(await poll(user.auth)).toEqual({ isTracking: false });
  });
});

describe("the upload hook", () => {
  // A visit that began minutes ago is "today" for the user unless the test runs in the first minutes after midnight UTC.
  const skipNearMidnight = () => new Date().getUTCHours() === 0 && new Date().getUTCMinutes() < 10;

  async function readyUser() {
    const user = await makeTrackingUser();
    await http().put("/api/notifications/settings").set(user.auth).send({ enabled: true, timeZone: "UTC" }).expect(200);
    await http().put("/api/settings").set(user.auth).send({ dailyBudgetSeconds: 300 }).expect(200);
    await http().put("/api/sites/a.com").set(user.auth).send({ marked: true }).expect(200);
    return user;
  }

  it("raises an alert after an upload that crosses the budget, without holding up the response", async () => {
    if (skipNearMidnight()) return;
    const notifier = { enabled: true, send: vi.fn().mockResolvedValue({ id: "n" }) };
    setNotifier(notifier);
    const user = await readyUser();

    const res = await http().post("/api/intervals").set(user.auth).send({ intervals: [interval({ minsAgo: 8, seconds: 400 })] }).expect(200);
    expect(res.body.stored).toBe(1);
    await settleBackground();
    expect(notifier.send).toHaveBeenCalledOnce();
    expect((await poll(user.auth)).alerts[0]).toMatchObject({ kind: "budget-over" });
  });

  it("still answers 200 when the notification service is failing", async () => {
    setNotifier({ enabled: true, send: vi.fn().mockRejectedValue(new Error("service down")) });
    const user = await readyUser();
    await http().post("/api/intervals").set(user.auth).send({ intervals: [interval({ minsAgo: 8, seconds: 400 })] }).expect(200);
    await settleBackground(); // the failed check is logged, not thrown
  });

  it("does not check anything when nothing new was stored (a retried upload)", async () => {
    const notifier = { enabled: true, send: vi.fn().mockResolvedValue({ id: "n" }) };
    setNotifier(notifier);
    const user = await readyUser();
    const batch = { intervals: [interval({ minsAgo: 8, seconds: 20 })] };
    await http().post("/api/intervals").set(user.auth).send(batch).expect(200);
    const again = await http().post("/api/intervals").set(user.auth).send(batch).expect(200);
    expect(again.body.stored).toBe(0);
    await settleBackground();
    expect(notifier.send).not.toHaveBeenCalled();
  });

  it("does nothing for a user who has not opted in", async () => {
    const notifier = { enabled: true, send: vi.fn().mockResolvedValue({ id: "n" }) };
    setNotifier(notifier);
    const user = await makeTrackingUser();
    await http().put("/api/settings").set(user.auth).send({ dailyBudgetSeconds: 300 }).expect(200);
    await http().put("/api/sites/a.com").set(user.auth).send({ marked: true }).expect(200);
    await http().post("/api/intervals").set(user.auth).send({ intervals: [interval({ minsAgo: 8, seconds: 400 })] }).expect(200);
    await settleBackground();
    expect(notifier.send).not.toHaveBeenCalled();
  });
});

describe("the user's data controls", () => {
  const PASSWORD = "password123";

  it("includes notification settings and alerts in the export, and nothing of anyone else's", async () => {
    const user = await makeUser();
    const other = await makeUser("other");
    await http().put("/api/notifications/settings").set(user.auth).send({ enabled: true, timeZone: "Asia/Kolkata" }).expect(200);
    await addAlert(user, "mine", { title: "my alert" });
    await addAlert(other, "theirs", { title: "their alert" });

    const { body } = await http().get("/api/account/export").set(user.auth).expect(200);
    expect(body.notifications).toMatchObject({ enabled: true, timeZone: "Asia/Kolkata" });
    expect(body.notifications.alerts.map((a) => a.title)).toEqual(["my alert"]);
    expect(JSON.stringify(body)).not.toContain("their alert");
  });

  it("reports the defaults in the export for an account that never chose", async () => {
    const user = await makeUser();
    const { body } = await http().get("/api/account/export").set(user.auth).expect(200);
    expect(body.notifications).toEqual({ enabled: false, timeZone: "UTC", alerts: [] });
  });

  it("deletes the alerts with the history, and keeps the notification settings", async () => {
    const user = await makeUser();
    await http().put("/api/notifications/settings").set(user.auth).send({ enabled: true, timeZone: "UTC" }).expect(200);
    await addAlert(user, "a");
    await http().delete("/api/account/data").set(user.auth).send({ password: PASSWORD }).expect(200);
    expect(Number((await db.query("SELECT COUNT(*) FROM alerts WHERE user_id = $1", [user.id])).rows[0].count)).toBe(0);
    expect((await http().get("/api/notifications/settings").set(user.auth)).body.enabled).toBe(true);
  });

  it("deletes the alerts and settings with the account", async () => {
    const user = await makeUser();
    await http().put("/api/notifications/settings").set(user.auth).send({ enabled: true, timeZone: "UTC" }).expect(200);
    await addAlert(user, "a");
    await http().delete("/api/account").set(user.auth).send({ password: PASSWORD }).expect(204);
    for (const table of ["alerts", "notification_settings"]) {
      expect(Number((await db.query(`SELECT COUNT(*) FROM ${table} WHERE user_id = $1`, [user.id])).rows[0].count), table).toBe(0);
    }
  });
});
