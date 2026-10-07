import { describe, it, expect, afterEach } from "vitest";
import db from "../db.js";
import { http, makeUser } from "./helpers.js";
import { setNotifier, createNotifier } from "../notifications/notifier.js";

const get = (user) => http().get("/api/notifications/settings").set(user.auth);
const put = (user, body) => http().put("/api/notifications/settings").set(user.auth).send(body);

afterEach(() => setNotifier(undefined));

describe("authentication", () => {
  it("is required for both endpoints", async () => {
    await http().get("/api/notifications/settings").expect(401);
    await http().put("/api/notifications/settings").send({ enabled: true }).expect(401);
  });
});

describe("notification settings", () => {
  it("are off, in UTC, until the user chooses, and reading creates no row", async () => {
    const user = await makeUser();
    expect((await get(user).expect(200)).body).toMatchObject({ enabled: false, timeZone: "UTC" });
    const { rows } = await db.query("SELECT COUNT(*) FROM notification_settings WHERE user_id = $1", [user.id]);
    expect(Number(rows[0].count)).toBe(0);
  });

  it("save the choice and the user's time zone", async () => {
    const user = await makeUser();
    expect((await put(user, { enabled: true, timeZone: "Asia/Kolkata" }).expect(200)).body).toMatchObject({ enabled: true, timeZone: "Asia/Kolkata" });
    expect((await get(user)).body).toMatchObject({ enabled: true, timeZone: "Asia/Kolkata" });
  });

  it("can be switched off again, keeping a single row", async () => {
    const user = await makeUser();
    await put(user, { enabled: true, timeZone: "UTC" }).expect(200);
    await put(user, { enabled: false, timeZone: "UTC" }).expect(200);
    expect((await get(user)).body.enabled).toBe(false);
    const { rows } = await db.query("SELECT COUNT(*) FROM notification_settings WHERE user_id = $1", [user.id]);
    expect(Number(rows[0].count)).toBe(1);
  });

  it("fall back to UTC for a zone nobody knows, instead of storing nonsense", async () => {
    const user = await makeUser();
    expect((await put(user, { enabled: true, timeZone: "Mars/Olympus" }).expect(200)).body.timeZone).toBe("UTC");
  });

  it("keep a zone Postgres knows exactly as given", async () => {
    const user = await makeUser();
    expect((await put(user, { enabled: true, timeZone: "Europe/Berlin" }).expect(200)).body.timeZone).toBe("Europe/Berlin");
  });

  it.each([
    ["no choice", {}],
    ["a string for enabled", { enabled: "yes" }],
    ["a number for enabled", { enabled: 1 }],
    ["an empty time zone", { enabled: true, timeZone: "" }],
    ["an enormous time zone", { enabled: true, timeZone: "x".repeat(100) }],
  ])("reject %s with 400 and keep the old value", async (_label, body) => {
    const user = await makeUser();
    await put(user, { enabled: true, timeZone: "UTC" }).expect(200);
    await put(user, body).expect(400);
    expect((await get(user)).body.enabled).toBe(true);
  });

  it("are separate for each user", async () => {
    const a = await makeUser("a");
    const b = await makeUser("b");
    await put(a, { enabled: true, timeZone: "UTC" }).expect(200);
    expect((await get(b)).body.enabled).toBe(false);
  });

  it("go away with the user", async () => {
    const user = await makeUser();
    await put(user, { enabled: true, timeZone: "UTC" }).expect(200);
    await db.query("DELETE FROM users WHERE id = $1", [user.id]);
    const { rows } = await db.query("SELECT COUNT(*) FROM notification_settings WHERE user_id = $1", [user.id]);
    expect(Number(rows[0].count)).toBe(0);
  });

  it("report whether this server is connected to a notification service at all", async () => {
    const user = await makeUser();
    setNotifier(createNotifier({ env: {} }));
    expect((await get(user)).body.available).toBe(false);
    setNotifier({ enabled: true, send: async () => null });
    expect((await get(user)).body.available).toBe(true);
  });
});
