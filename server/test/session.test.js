import { describe, it, expect } from "vitest";
import jwt from "jsonwebtoken";
import db from "../db.js";
import { http, makeUser } from "./helpers.js";

const PASSWORD = "password123"; // what makeUser registers with
const CSRF = { "X-Requested-With": "dt" };

const login = (user) => http().post("/api/auth/login").send({ email: user.email, password: PASSWORD });
/** "dt_session=<jwt>", ready to send back as a Cookie header. */
const sessionCookie = (res) => res.headers["set-cookie"].find((c) => c.startsWith("dt_session=")).split(";")[0];
/** The whole Set-Cookie line, attributes included. */
const setCookieLine = (res) => res.headers["set-cookie"].find((c) => c.startsWith("dt_session="));
const cookie = async (user) => sessionCookie(await login(user).expect(200));
const extensionToken = async (user) => (await http().post("/api/auth/extension-token").set(user.auth).expect(200)).body.token;
const bearer = (token) => ({ Authorization: `Bearer ${token}` });
const userToken = (claims, options = {}) => jwt.sign({ id: 1, email: "x@test.io", ...claims }, "test-secret", { algorithm: "HS256", expiresIn: 3600, ...options });

describe("signing in sets an httpOnly cookie", () => {
  it("is HttpOnly, SameSite=Strict, limited to /api and lasts a day", async () => {
    const user = await makeUser();
    const line = setCookieLine(await login(user).expect(200));
    expect(line).toMatch(/; HttpOnly/);
    expect(line).toMatch(/; SameSite=Strict/);
    expect(line).toMatch(/; Path=\/api/);
    expect(line).toMatch(/; Max-Age=86400/);
    expect(line).not.toMatch(/Secure/); // tests run in plain http; production adds it (see the unit tests)
  });

  it("carries the same token as the body, which stays for the extension, scripts and tests", async () => {
    const user = await makeUser();
    const res = await login(user).expect(200);
    expect(sessionCookie(res)).toBe(`dt_session=${res.body.token}`);
    expect(res.body.user).toMatchObject({ id: user.id, email: user.email });
    expect(Object.keys(res.body.user)).not.toEqual(expect.arrayContaining(["password_hash"])); // no hash
    expect(Object.keys(res.body.user)).not.toEqual(expect.arrayContaining(["token_version"])); // no internal version
  });

  it("is not set for a failed sign-in", async () => {
    const user = await makeUser();
    const res = await http().post("/api/auth/login").send({ email: user.email, password: "wrong-password" }).expect(401);
    expect(res.headers["set-cookie"]).toBeUndefined();
  });
});

describe("GET /api/auth/me", () => {
  it("says who is signed in, by cookie or by bearer token", async () => {
    const user = await makeUser();
    const byCookie = await http().get("/api/auth/me").set("Cookie", await cookie(user)).expect(200);
    const byBearer = await http().get("/api/auth/me").set(user.auth).expect(200);
    expect(byCookie.body).toEqual({ user: { id: user.id, email: user.email } });
    expect(byBearer.body).toEqual(byCookie.body);
  });

  it("is 401 with nothing, with a garbage cookie, and with a cookie for a deleted account", async () => {
    await http().get("/api/auth/me").expect(401);
    await http().get("/api/auth/me").set("Cookie", "dt_session=not-a-token").expect(401);
    const user = await makeUser();
    const stale = await cookie(user);
    await db.query("DELETE FROM users WHERE id = $1", [user.id]);
    const res = await http().get("/api/auth/me").set("Cookie", stale).expect(401);
    expect(res.body.error).toBe("Account not found");
  });

  it("takes the bearer token over a cookie when both are sent", async () => {
    const a = await makeUser("a");
    const b = await makeUser("b");
    const res = await http().get("/api/auth/me").set(a.auth).set("Cookie", await cookie(b)).expect(200);
    expect(res.body.user.email).toBe(a.email);
  });
});

describe("POST /api/auth/logout really ends the session", () => {
  it("clears the cookie, and the old cookie and old bearer token stop working", async () => {
    const user = await makeUser();
    const old = await cookie(user);
    const res = await http().post("/api/auth/logout").set("Cookie", old).set(CSRF).expect(204);
    expect(setCookieLine(res)).toMatch(/^dt_session=;/);
    expect(setCookieLine(res)).toMatch(/Path=\/api/);
    expect(setCookieLine(res)).toMatch(/Expires=Thu, 01 Jan 1970/);

    expect((await http().get("/api/auth/me").set("Cookie", old).expect(401)).body.error).toBe("Session ended");
    expect((await http().get("/api/settings").set(user.auth).expect(401)).body.error).toBe("Session ended"); // the token from before
    await login(user).expect(200); // signing in again works
  });

  it("also ends the extension's token, so one logout cuts off everything", async () => {
    const user = await makeUser();
    const ext = await extensionToken(user);
    await http().get("/api/is-tracking").set(bearer(ext)).expect(200);
    await http().post("/api/auth/logout").set(user.auth).expect(204);
    await http().get("/api/is-tracking").set(bearer(ext)).expect(401);
  });

  it("gives a new sign-in a working token", async () => {
    const user = await makeUser();
    await http().post("/api/auth/logout").set(user.auth).expect(204);
    const again = await login(user).expect(200);
    await http().get("/api/settings").set(bearer(again.body.token)).expect(200);
  });

  it("leaves other users signed in", async () => {
    const user = await makeUser();
    const other = await makeUser("other");
    await http().post("/api/auth/logout").set(user.auth).expect(204);
    await http().get("/api/settings").set(other.auth).expect(200);
  });

  it("needs a session of its own: without one it is 401", async () => {
    await http().post("/api/auth/logout").set(CSRF).expect(401);
  });
});

describe("the cookie needs the X-Requested-With header to change anything", () => {
  it("refuses a state-changing request from the cookie without the header, and allows it with", async () => {
    const user = await makeUser();
    const c = await cookie(user);
    const refused = await http().post("/api/start-tracking").set("Cookie", c).send({}).expect(403);
    expect(refused.body.error).toBe("Request not allowed");
    await http().post("/api/start-tracking").set("Cookie", c).set(CSRF).send({}).expect(200);
  });

  it("refuses PUT and DELETE the same way", async () => {
    const user = await makeUser();
    const c = await cookie(user);
    await http().put("/api/settings").set("Cookie", c).send({ dailyBudgetSeconds: 3600 }).expect(403);
    await http().delete("/api/account/data").set("Cookie", c).send({ password: PASSWORD }).expect(403);
    await http().put("/api/settings").set("Cookie", c).set(CSRF).send({ dailyBudgetSeconds: 3600 }).expect(200);
  });

  it("does not ask for it on a read", async () => {
    const user = await makeUser();
    await http().get("/api/settings").set("Cookie", await cookie(user)).expect(200);
  });

  it("does not accept some other value of the header", async () => {
    const user = await makeUser();
    await http().post("/api/start-tracking").set("Cookie", await cookie(user)).set("X-Requested-With", "XMLHttpRequest").send({}).expect(403);
  });

  it("does not ask for it from a bearer token (a script that sets that header can set any)", async () => {
    const user = await makeUser();
    await http().post("/api/start-tracking").set(user.auth).send({}).expect(200);
  });
});

describe("the extension's token", () => {
  it("is issued to a signed-in user, is scoped and lasts 30 days", async () => {
    const user = await makeUser();
    const res = await http().post("/api/auth/extension-token").set(user.auth).expect(200);
    expect(res.body.expiresInSeconds).toBe(30 * 24 * 60 * 60);
    const claims = jwt.decode(res.body.token);
    expect(claims).toMatchObject({ id: user.id, email: user.email, scope: "ingest", v: 0 });
    expect(claims.exp - claims.iat).toBe(30 * 24 * 60 * 60);
  });

  it("needs a sign-in to be issued", async () => {
    await http().post("/api/auth/extension-token").expect(401);
  });

  it("can upload visits and read whether tracking is on", async () => {
    const user = await makeUser();
    const ext = bearer(await extensionToken(user));
    expect((await http().get("/api/is-tracking").set(ext).expect(200)).body).toEqual({ isTracking: false });
    await http().post("/api/intervals").set(ext).send({ intervals: [] }).expect(400); // reached the handler: it is the empty batch that is refused
  });

  it.each([
    ["GET", "/api/summary?date=2026-03-09"],
    ["GET", "/api/range?view=week&date=2026-03-09"],
    ["GET", "/api/sites"],
    ["PUT", "/api/sites/youtube.com", { marked: true }],
    ["GET", "/api/settings"],
    ["PUT", "/api/settings", { dailyBudgetSeconds: 3600 }],
    ["POST", "/api/start-tracking", {}],
    ["POST", "/api/stop-tracking", {}],
    ["GET", "/api/account/export"],
    ["GET", "/api/account/export?format=csv"],
    ["DELETE", "/api/account/data", { password: PASSWORD }],
    ["DELETE", "/api/account", { password: PASSWORD }],
    ["GET", "/api/auth/me"],
    ["POST", "/api/auth/logout"],
    ["POST", "/api/auth/extension-token"],
    ["GET", "/api/analytics/time-spent-today"],
  ])("cannot %s %s (403)", async (method, url, body) => {
    const user = await makeUser();
    const ext = bearer(await extensionToken(user));
    const res = await http()[method.toLowerCase()](url).set(ext).send(body);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Insufficient scope");
  });

  it("changes nothing when it is refused: the account and its data are still there", async () => {
    const user = await makeUser();
    const ext = bearer(await extensionToken(user));
    await http().delete("/api/account").set(ext).send({ password: PASSWORD }).expect(403);
    await http().get("/api/settings").set(user.auth).expect(200);
  });

  it("cannot be made stronger by editing it: a changed scope breaks the signature", async () => {
    const user = await makeUser();
    const ext = await extensionToken(user);
    const [head, body, signature] = ext.split(".");
    const edited = JSON.parse(Buffer.from(body, "base64url").toString());
    edited.scope = "user";
    const forged = [head, Buffer.from(JSON.stringify(edited)).toString("base64url"), signature].join(".");
    const res = await http().get("/api/settings").set(bearer(forged)).expect(401);
    expect(res.body.error).toBe("Invalid token");
  });

  it("stops working when its account is deleted", async () => {
    const user = await makeUser();
    const ext = bearer(await extensionToken(user));
    await db.query("DELETE FROM users WHERE id = $1", [user.id]);
    expect((await http().get("/api/is-tracking").set(ext).expect(401)).body.error).toBe("Account not found");
  });
});

describe("token validity", () => {
  it("accepts a token from before scopes and versions existed as a full token while nothing was revoked", async () => {
    const user = await makeUser();
    const legacy = userToken({ id: user.id, email: user.email }); // no scope, no version
    await http().get("/api/settings").set(bearer(legacy)).expect(200);
    await http().get("/api/is-tracking").set(bearer(legacy)).expect(200);
  });

  it("rejects a token whose version is not the user's current one", async () => {
    const user = await makeUser();
    const res = await http().get("/api/settings").set(bearer(userToken({ id: user.id, email: user.email, v: 5 }))).expect(401);
    expect(res.body.error).toBe("Session ended");
  });

  it("rejects an expired token with its own message", async () => {
    const user = await makeUser();
    const res = await http().get("/api/settings").set(bearer(userToken({ id: user.id, email: user.email }, { expiresIn: -10 }))).expect(401);
    expect(res.body.error).toBe("Token expired");
  });

  it("rejects a token signed with another secret, or with none", async () => {
    const user = await makeUser();
    const other = jwt.sign({ id: user.id, email: user.email }, "another-secret", { algorithm: "HS256" });
    await http().get("/api/settings").set(bearer(other)).expect(401);
    const none = `${Buffer.from('{"alg":"none"}').toString("base64url")}.${Buffer.from(JSON.stringify({ id: user.id })).toString("base64url")}.`;
    await http().get("/api/settings").set(bearer(none)).expect(401);
  });
});

describe("CORS carries the cookie only for the dashboard's origin", () => {
  const preflight = (origin) =>
    http()
      .options("/api/start-tracking")
      .set("Origin", origin)
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "x-requested-with,content-type");

  it("allows credentials and the custom header for the configured origin", async () => {
    const res = await preflight("http://localhost:5173");
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
    expect(res.headers["access-control-allow-headers"]).toMatch(/x-requested-with/i);
  });

  it("names no allowed origin for any other site, so its page cannot send the header or read a reply", async () => {
    const res = await preflight("http://evil.example");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

describe("deleting the account clears the cookie", () => {
  it("expires it, and the old cookie no longer works", async () => {
    const user = await makeUser();
    const c = await cookie(user);
    const res = await http().delete("/api/account").set("Cookie", c).set(CSRF).send({ password: PASSWORD }).expect(204);
    expect(setCookieLine(res)).toMatch(/^dt_session=;/);
    await http().get("/api/auth/me").set("Cookie", c).expect(401);
  });
});
