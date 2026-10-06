import { describe, it, expect } from "vitest";
import db from "../db.js";
import { http, makeUser } from "./helpers.js";

const put = (user, body) => http().put("/api/settings").set(user.auth).send(body);

describe("authentication", () => {
  it("is required for both endpoints", async () => {
    await http().get("/api/settings").expect(401);
    await http().put("/api/settings").send({ dailyBudgetSeconds: 3600 }).expect(401);
  });
});

describe("daily budget", () => {
  it("defaults to two hours until the user sets one, without creating a row", async () => {
    const user = await makeUser();
    expect((await http().get("/api/settings").set(user.auth).expect(200)).body).toEqual({ dailyBudgetSeconds: 7200 });
    const { rows } = await db.query("SELECT COUNT(*) FROM user_settings WHERE user_id = $1", [user.id]);
    expect(Number(rows[0].count)).toBe(0);
  });

  it("saves a budget and returns it afterwards", async () => {
    const user = await makeUser();
    expect((await put(user, { dailyBudgetSeconds: 5400 }).expect(200)).body).toEqual({ dailyBudgetSeconds: 5400 });
    expect((await http().get("/api/settings").set(user.auth)).body).toEqual({ dailyBudgetSeconds: 5400 });
  });

  it("can be changed again, keeping a single row per user", async () => {
    const user = await makeUser();
    await put(user, { dailyBudgetSeconds: 1800 }).expect(200);
    await put(user, { dailyBudgetSeconds: 3600 }).expect(200);
    expect((await http().get("/api/settings").set(user.auth)).body.dailyBudgetSeconds).toBe(3600);
    const { rows } = await db.query("SELECT COUNT(*) FROM user_settings WHERE user_id = $1", [user.id]);
    expect(Number(rows[0].count)).toBe(1);
  });

  it("accepts exactly the minimum and the maximum", async () => {
    const user = await makeUser();
    await put(user, { dailyBudgetSeconds: 300 }).expect(200);
    await put(user, { dailyBudgetSeconds: 86400 }).expect(200);
  });

  it.each([
    ["just under the minimum", { dailyBudgetSeconds: 299 }],
    ["just over the maximum", { dailyBudgetSeconds: 86401 }],
    ["zero", { dailyBudgetSeconds: 0 }],
    ["a negative number", { dailyBudgetSeconds: -600 }],
    ["a fraction", { dailyBudgetSeconds: 600.5 }],
    ["a string", { dailyBudgetSeconds: "3600" }],
    ["nothing", {}],
  ])("rejects %s with 400 and keeps the old value", async (_label, body) => {
    const user = await makeUser();
    await put(user, { dailyBudgetSeconds: 3600 }).expect(200);
    await put(user, body).expect(400);
    expect((await http().get("/api/settings").set(user.auth)).body.dailyBudgetSeconds).toBe(3600);
  });

  it("is separate for each user", async () => {
    const a = await makeUser("a");
    const b = await makeUser("b");
    await put(a, { dailyBudgetSeconds: 1200 }).expect(200);
    expect((await http().get("/api/settings").set(b.auth)).body.dailyBudgetSeconds).toBe(7200);
  });

  it("goes away with the user", async () => {
    const user = await makeUser();
    await put(user, { dailyBudgetSeconds: 1200 }).expect(200);
    await db.query("DELETE FROM users WHERE id = $1", [user.id]);
    const { rows } = await db.query("SELECT COUNT(*) FROM user_settings WHERE user_id = $1", [user.id]);
    expect(Number(rows[0].count)).toBe(0);
  });
});
