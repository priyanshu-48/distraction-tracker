import { describe, it, expect, vi } from "vitest";

// The limiter reads its ceiling when the route module loads; this file makes many requests, so raise it first.
vi.hoisted(() => {
  process.env.ACCOUNT_RATE_LIMIT = "1000";
});

import { randomUUID } from "node:crypto";
import bcrypt from "bcrypt";
import db from "../db.js";
import { visitBatches } from "../models/accountModel.js";
import { http, makeUser } from "./helpers.js";

const PASSWORD = "password123"; // what makeUser registers with

const visit = (userId, { domain = "a.com", title = "A page", url = `https://${domain}/`, start = "2026-03-09T10:00:00Z", seconds = 60 } = {}) =>
  db.query(
    `INSERT INTO tab_activity (user_id, client_event_id, url, domain, title, started_at, ended_at, duration)
     VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $6::timestamptz + make_interval(secs => $7), $7)`,
    [userId, randomUUID(), url, domain, title, start, seconds]
  );
const mark = (userId, domain) => db.query("INSERT INTO distraction_sites (user_id, domain) VALUES ($1, $2)", [userId, domain]);
const session = (userId, start, end) => db.query("INSERT INTO tracking_sessions (user_id, start_time, end_time) VALUES ($1, $2, $3)", [userId, start, end]);
const count = async (table, userId) => Number((await db.query(`SELECT COUNT(*) FROM ${table} WHERE user_id = $1`, [userId])).rows[0].count);

const exportJson = (user) => http().get("/api/account/export").set(user.auth);
const exportCsv = (user) => http().get("/api/account/export").query({ format: "csv" }).set(user.auth).buffer(true);
const csvLines = (text) => text.split("\r\n").filter((l) => l !== "");

describe("GET /api/account/export: access", () => {
  it("requires authentication", async () => {
    await http().get("/api/account/export").expect(401);
  });

  it("rejects a format it does not know", async () => {
    const user = await makeUser();
    await http().get("/api/account/export").query({ format: "xml" }).set(user.auth).expect(400);
  });

  it("is sent as a download that is not cached", async () => {
    const user = await makeUser();
    const res = await exportJson(user).expect(200);
    expect(res.headers["content-type"]).toMatch(/^application\/json/);
    expect(res.headers["content-disposition"]).toMatch(/^attachment; filename="distraction-tracker-\d{4}-\d{2}-\d{2}\.json"$/);
    expect(res.headers["cache-control"]).toBe("no-store");
    const csv = await exportCsv(user).expect(200);
    expect(csv.headers["content-type"]).toMatch(/^text\/csv/);
    expect(csv.headers["content-disposition"]).toMatch(/\.csv"$/);
  });
});

describe("the JSON export", () => {
  it("holds the account, settings, marked sites, sessions and visits", async () => {
    const user = await makeUser();
    await http().put("/api/settings").set(user.auth).send({ dailyBudgetSeconds: 3600 }).expect(200);
    await mark(user.id, "youtube.com");
    await mark(user.id, "reddit.com");
    await session(user.id, "2026-03-09T09:00:00Z", "2026-03-09T12:00:00Z");
    await session(user.id, "2026-03-10T09:00:00Z", null);
    await visit(user.id, { domain: "youtube.com", title: "Cats", start: "2026-03-09T10:00:00Z", seconds: 90.5 });

    const { body } = await exportJson(user).expect(200);
    expect(body.account.email).toBe(user.email);
    expect(body.account.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(body.settings).toEqual({ dailyBudgetSeconds: 3600 });
    expect(body.distractionSites).toEqual(["reddit.com", "youtube.com"]);
    expect(body.sessions).toEqual([
      { start: "2026-03-09T09:00:00.000Z", end: "2026-03-09T12:00:00.000Z" },
      { start: "2026-03-10T09:00:00.000Z", end: null },
    ]);
    expect(body.visits).toEqual([
      {
        startedAt: "2026-03-09T10:00:00.000Z",
        endedAt: "2026-03-09T10:01:30.500Z",
        durationSeconds: 90.5,
        domain: "youtube.com",
        title: "Cats",
        url: "https://youtube.com/",
      },
    ]);
    expect(new Date(body.exportedAt).getTime()).toBeGreaterThan(Date.now() - 60_000);
  });

  it("reports the default budget for an account that never changed it, and is valid with nothing in it", async () => {
    const user = await makeUser();
    const { body } = await exportJson(user).expect(200);
    expect(body.settings).toEqual({ dailyBudgetSeconds: 7200 });
    expect(body).toMatchObject({ distractionSites: [], sessions: [], visits: [] });
  });

  it("never includes the password or its hash, or anything of another account", async () => {
    const user = await makeUser();
    const other = await makeUser("other");
    await visit(user.id, { domain: "mine.com" });
    await visit(other.id, { domain: "theirs.com", title: "Secret" });
    await mark(other.id, "theirs.com");
    await session(other.id, "2026-03-09T09:00:00Z", "2026-03-09T10:00:00Z");

    const res = await exportJson(user).expect(200);
    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(/password|\$2[aby]\$/i);
    expect(text).not.toContain("theirs.com");
    expect(text).not.toContain(other.email);
    expect(res.body.visits.map((v) => v.domain)).toEqual(["mine.com"]);
    expect(res.body.sessions).toEqual([]);
    expect(res.body.distractionSites).toEqual([]);
  });

  it("is complete and valid JSON for a history longer than one batch", async () => {
    const user = await makeUser();
    await db.query(
      `INSERT INTO tab_activity (user_id, client_event_id, url, domain, title, started_at, ended_at, duration)
       SELECT $1, gen_random_uuid(), 'https://a.com/' || g, 'a.com', 'Page ' || g,
              TIMESTAMPTZ '2026-03-01' + g * INTERVAL '1 minute', TIMESTAMPTZ '2026-03-01' + g * INTERVAL '1 minute' + INTERVAL '30 seconds', 30
       FROM generate_series(1, 4500) g`,
      [user.id]
    );
    const { body } = await exportJson(user).expect(200);
    expect(body.visits).toHaveLength(4500);
    expect(new Set(body.visits.map((v) => v.url)).size).toBe(4500); // none repeated across the batch boundaries
  });
});

describe("visitBatches", () => {
  it("reads every visit exactly once, in the order stored, whatever the batch size", async () => {
    const user = await makeUser();
    for (let i = 1; i <= 5; i++) await visit(user.id, { domain: `s${i}.com` });
    const batches = [];
    for await (const batch of visitBatches(user.id, 2)) batches.push(batch.map((r) => r.domain));
    expect(batches).toEqual([["s1.com", "s2.com"], ["s3.com", "s4.com"], ["s5.com"]]);
  });

  it("is empty for a user with no visits, and ignores other users", async () => {
    const user = await makeUser();
    const other = await makeUser("other");
    await visit(other.id);
    const batches = [];
    for await (const batch of visitBatches(user.id)) batches.push(batch);
    expect(batches).toEqual([]);
  });
});

describe("the CSV export", () => {
  it("has a header and one line per visit, and only visits", async () => {
    const user = await makeUser();
    await mark(user.id, "a.com");
    await visit(user.id, { domain: "a.com", title: "One", start: "2026-03-09T10:00:00Z", seconds: 60 });
    await visit(user.id, { domain: "b.com", title: "Two", start: "2026-03-09T11:00:00Z", seconds: 120 });
    const res = await exportCsv(user).expect(200);
    expect(csvLines(res.text)).toEqual([
      "started_at,ended_at,duration_seconds,domain,title,url",
      "2026-03-09T10:00:00.000Z,2026-03-09T10:01:00.000Z,60,a.com,One,https://a.com/",
      "2026-03-09T11:00:00.000Z,2026-03-09T11:02:00.000Z,120,b.com,Two,https://b.com/",
    ]);
    expect(res.text).not.toContain(user.email);
  });

  it("is just the header for an account with no visits", async () => {
    const user = await makeUser();
    expect(csvLines((await exportCsv(user).expect(200)).text)).toEqual(["started_at,ended_at,duration_seconds,domain,title,url"]);
  });

  it("quotes commas, quotes and line breaks in titles so a spreadsheet reads one cell", async () => {
    const user = await makeUser();
    await visit(user.id, { title: 'Hello, "world"\nsecond line' });
    const res = await exportCsv(user).expect(200);
    expect(res.text).toContain('"Hello, ""world""\nsecond line"');
  });

  it("makes a title that looks like a formula plain text, so opening the file cannot run it", async () => {
    const user = await makeUser();
    for (const title of ["=HYPERLINK(\"http://evil\",\"x\")", "+1+1", "-2+3", "@SUM(A1)"]) await visit(user.id, { title });
    const res = await exportCsv(user).expect(200);
    expect(res.text).toContain(`,"'=HYPERLINK(""http://evil"",""x"")",`); // quoted, because it has commas and quotes
    expect(res.text).toContain(",'+1+1,");
    expect(res.text).toContain(",'-2+3,");
    expect(res.text).toContain(",'@SUM(A1),");
    // no title cell starts with a formula character
    for (const line of csvLines(res.text).slice(1)) expect(line).not.toMatch(/,"?[=+\-@]/);
  });

  it("leaves an ordinary title untouched, including one with a dash or digit inside", async () => {
    const user = await makeUser();
    await visit(user.id, { title: "Top 10 - best of 2026" });
    expect((await exportCsv(user).expect(200)).text).toContain(",Top 10 - best of 2026,");
  });

  it("separates lines with CRLF, as the format asks", async () => {
    const user = await makeUser();
    await visit(user.id);
    expect((await exportCsv(user).expect(200)).text).toMatch(/url\r\n.*\r\n$/);
  });
});

describe("DELETE /api/account/data", () => {
  async function userWithHistory() {
    const user = await makeUser();
    await http().put("/api/settings").set(user.auth).send({ dailyBudgetSeconds: 1800 }).expect(200);
    await mark(user.id, "youtube.com");
    await visit(user.id, { domain: "youtube.com" });
    await visit(user.id, { domain: "github.com" });
    await session(user.id, "2026-03-09T09:00:00Z", "2026-03-09T12:00:00Z");
    await http().post("/api/start-tracking").set(user.auth).send({}).expect(200); // a session still running
    return user;
  }
  const remove = (user, body) => http().delete("/api/account/data").set(user.auth).send(body);

  it("requires authentication", async () => {
    await http().delete("/api/account/data").send({ password: PASSWORD }).expect(401);
  });

  it("asks for the password: none, or an empty one, is a 400 and deletes nothing", async () => {
    const user = await userWithHistory();
    await remove(user).expect(400);
    await remove(user, {}).expect(400);
    await remove(user, { password: "" }).expect(400);
    expect(await count("tab_activity", user.id)).toBe(2);
  });

  it("answers 403, not 401, to a wrong password (a 401 would sign the dashboard out), and deletes nothing", async () => {
    const user = await userWithHistory();
    const res = await remove(user, { password: "not-my-password" }).expect(403);
    expect(res.body.error).toBe("Password incorrect");
    expect(await count("tab_activity", user.id)).toBe(2);
    expect(await count("tracking_sessions", user.id)).toBe(2);
  });

  it("deletes every visit and session, says how many, and ends the running session", async () => {
    const user = await userWithHistory();
    const res = await remove(user, { password: PASSWORD }).expect(200);
    expect(res.body).toEqual({ success: true, visits: 2, sessions: 2 });
    expect(await count("tab_activity", user.id)).toBe(0);
    expect(await count("tracking_sessions", user.id)).toBe(0);
    expect((await http().get("/api/is-tracking").set(user.auth).expect(200)).body.isTracking).toBe(false);
  });

  it("keeps the account, the daily budget and the marked sites, and the user stays signed in", async () => {
    const user = await userWithHistory();
    await remove(user, { password: PASSWORD }).expect(200);
    expect(await count("distraction_sites", user.id)).toBe(1);
    expect((await http().get("/api/settings").set(user.auth).expect(200)).body.dailyBudgetSeconds).toBe(1800);
    await http().post("/api/auth/login").send({ email: user.email, password: PASSWORD }).expect(200);
  });

  it("leaves every other account's data alone", async () => {
    const user = await userWithHistory();
    const other = await userWithHistory();
    await remove(user, { password: PASSWORD }).expect(200);
    expect(await count("tab_activity", other.id)).toBe(2);
    expect(await count("tracking_sessions", other.id)).toBe(2);
  });

  it("is harmless to repeat on an account with nothing recorded", async () => {
    const user = await makeUser();
    expect((await remove(user, { password: PASSWORD }).expect(200)).body).toEqual({ success: true, visits: 0, sessions: 0 });
  });

  it("makes the server drop what the extension uploads for the deleted session, until a new one starts", async () => {
    const user = await userWithHistory();
    await remove(user, { password: PASSWORD }).expect(200);
    const upload = () =>
      http().post("/api/intervals").set(user.auth).send({
        intervals: [{ clientEventId: randomUUID(), url: "https://a.com/", domain: "a.com", title: "", startedAt: new Date(Date.now() + 1000).toISOString(), endedAt: new Date(Date.now() + 3000).toISOString() }], // just after any session started now
      });
    expect((await upload().expect(200)).body).toMatchObject({ stored: 0, rejected: 1 });
    await http().post("/api/start-tracking").set(user.auth).send({}).expect(200);
    expect((await upload().expect(200)).body.stored).toBe(1);
  });
});

describe("DELETE /api/account", () => {
  const removeAccount = (user, body) => http().delete("/api/account").set(user.auth).send(body);

  it("requires authentication and the password", async () => {
    const user = await makeUser();
    await http().delete("/api/account").send({ password: PASSWORD }).expect(401);
    await removeAccount(user).expect(400);
    await removeAccount(user, { password: "wrong-password" }).expect(403);
    expect(Number((await db.query("SELECT COUNT(*) FROM users WHERE id = $1", [user.id])).rows[0].count)).toBe(1);
  });

  it("deletes the account and everything that belonged to it", async () => {
    const user = await makeUser();
    await http().put("/api/settings").set(user.auth).send({ dailyBudgetSeconds: 1800 }).expect(200);
    await mark(user.id, "youtube.com");
    await visit(user.id);
    await session(user.id, "2026-03-09T09:00:00Z", null);
    await removeAccount(user, { password: PASSWORD }).expect(204);
    expect(Number((await db.query("SELECT COUNT(*) FROM users WHERE id = $1", [user.id])).rows[0].count)).toBe(0);
    for (const table of ["tab_activity", "tracking_sessions", "distraction_sites", "user_settings"]) {
      expect(await count(table, user.id), table).toBe(0);
    }
  });

  it("leaves every other account alone", async () => {
    const user = await makeUser();
    const other = await makeUser("other");
    await visit(other.id);
    await mark(other.id, "youtube.com");
    await removeAccount(user, { password: PASSWORD }).expect(204);
    expect(await count("tab_activity", other.id)).toBe(1);
    expect(await count("distraction_sites", other.id)).toBe(1);
    await http().get("/api/settings").set(other.auth).expect(200);
  });

  it("makes the old token and the old credentials useless", async () => {
    const user = await makeUser();
    await removeAccount(user, { password: PASSWORD }).expect(204);
    for (const request of [
      http().get("/api/settings").set(user.auth),
      http().get("/api/is-tracking").set(user.auth),
      http().post("/api/start-tracking").set(user.auth).send({}),
      http().get("/api/account/export").set(user.auth),
    ]) {
      const res = await request.expect(401);
      expect(res.body.error).toBe("Account not found");
    }
    await http().post("/api/auth/login").send({ email: user.email, password: PASSWORD }).expect(401);
  });

  it("tells the extension's uploads the same, so it forgets the token instead of retrying", async () => {
    const user = await makeUser();
    await removeAccount(user, { password: PASSWORD }).expect(204);
    const res = await http().post("/api/intervals").set(user.auth).send({ intervals: [] });
    expect(res.status).toBe(401);
  });

  it("lets the same email register again afterwards, as a fresh account with no history", async () => {
    const user = await makeUser();
    await visit(user.id);
    await removeAccount(user, { password: PASSWORD }).expect(204);
    await http().post("/api/auth/register").send({ email: user.email, password: PASSWORD }).expect(201);
    const login = await http().post("/api/auth/login").send({ email: user.email, password: PASSWORD }).expect(200);
    const again = { auth: { Authorization: `Bearer ${login.body.token}` } };
    expect((await exportJson(again).expect(200)).body.visits).toEqual([]);
  });
});

describe("the password check", () => {
  it("does not accept the hash itself, or a password that merely starts the same", async () => {
    const user = await makeUser();
    const { rows } = await db.query("SELECT password_hash FROM users WHERE id = $1", [user.id]);
    expect(await bcrypt.compare(PASSWORD, rows[0].password_hash)).toBe(true);
    await http().delete("/api/account/data").set(user.auth).send({ password: rows[0].password_hash.slice(0, 72) }).expect(403);
    await http().delete("/api/account/data").set(user.auth).send({ password: PASSWORD.slice(0, -1) }).expect(403);
    await http().delete("/api/account/data").set(user.auth).send({ password: PASSWORD + "x" }).expect(403);
  });
});
