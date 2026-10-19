import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import db from "../db.js";
import { http, makeTrackingUser, makeUser } from "./helpers.js";

// POST /api/nudges: the extension asks, as a visit begins, whether to nudge (decisions.md, D-48). The rules themselves are
// tested in nudgesDomain.test.js; this checks that the route feeds them the right facts and records what it decides.

// Visit ids whose first 32 bits decide the holdout (below 20% = held out). The last digits keep every id different.
const shownId = (n = 0) => `ffffffff-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const heldId = (n = 0) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;

// "Today" is the real today, so skip the first minutes after midnight UTC when a visit a few minutes ago may be "yesterday".
const nearMidnight = () => new Date().getUTCHours() === 0 && new Date().getUTCMinutes() < 10;

const extensionAuth = async (user) => ({
  Authorization: `Bearer ${(await http().post("/api/auth/extension-token").set(user.auth).expect(200)).body.token}`,
});
const ask = (auth, body, tz = "UTC") => http().post(`/api/nudges?tz=${encodeURIComponent(tz)}`).set(auth).send(body);
const rows = async (user) => (await db.query("SELECT site, kind, shown, client_event_id FROM nudges WHERE user_id = $1 ORDER BY id", [user.id])).rows;

/** A finished visit that began `minsAgo` minutes ago, stored directly so the test controls exactly when it happened. */
async function visit(user, { domain = "youtube.com", minsAgo = 20, seconds = 60 }) {
  await db.query(
    `INSERT INTO tab_activity (user_id, client_event_id, url, domain, title, started_at, ended_at, duration)
     VALUES ($1, $2, $3, $4, '', NOW() - make_interval(mins => $5), NOW() - make_interval(mins => $5) + make_interval(secs => $6), $6)`,
    [user.id, randomUUID(), `https://${domain}/`, domain, minsAgo, seconds]
  );
}

/** A user with an open tracking session, a 1 hour budget and youtube.com marked as a distraction. */
async function armed({ marked = ["youtube.com"] } = {}) {
  const user = await makeTrackingUser();
  await http().put("/api/settings").set(user.auth).send({ dailyBudgetSeconds: 3600 }).expect(200);
  for (const domain of marked) await http().put(`/api/sites/${domain}`).set(user.auth).send({ marked: true }).expect(200);
  return { user, auth: await extensionAuth(user) };
}
const goOverBudget = (user, seconds = 4000) => visit(user, { minsAgo: 30, seconds });

describe.skipIf(nearMidnight())("POST /api/nudges: over budget", () => {
  it("nudges when the site is marked and today's distraction time is over the budget", async () => {
    const { user, auth } = await armed();
    await goOverBudget(user);
    const res = await ask(auth, { site: "youtube.com", visit: shownId(1) }).expect(200);
    expect(res.body.nudge).toMatchObject({ kind: "over-budget", title: "Over budget, and you just opened youtube.com" });
    expect(res.body.nudge.body).toMatch(/1h 6m of 1h used today/);
    expect(await rows(user)).toMatchObject([{ site: "youtube.com", kind: "over-budget", shown: true }]);
  });

  it("says nothing, and records nothing, while the user is under budget", async () => {
    const { user, auth } = await armed();
    await visit(user, { seconds: 600 });
    expect((await ask(auth, { site: "youtube.com", visit: shownId(1) }).expect(200)).body).toEqual({ nudge: null });
    expect(await rows(user)).toEqual([]);
  });

  it("counts exactly the budget as over, and one second less as under", async () => {
    const a = await armed();
    await visit(a.user, { seconds: 3599 });
    expect((await ask(a.auth, { site: "youtube.com", visit: shownId(1) })).body.nudge).toBeNull();
    const b = await armed();
    await visit(b.user, { seconds: 3600 });
    expect((await ask(b.auth, { site: "youtube.com", visit: shownId(2) })).body.nudge).toMatchObject({ kind: "over-budget" });
  });

  it("adds up every marked site, not just the one being opened", async () => {
    const { user, auth } = await armed({ marked: ["youtube.com", "reddit.com"] });
    await visit(user, { domain: "reddit.com", seconds: 2000 });
    await visit(user, { domain: "youtube.com", seconds: 1700 });
    expect((await ask(auth, { site: "youtube.com", visit: shownId(1) })).body.nudge).toMatchObject({ kind: "over-budget" });
  });

  it("ignores time on sites that are not marked", async () => {
    const { user, auth } = await armed();
    await visit(user, { domain: "github.com", seconds: 9000 });
    expect((await ask(auth, { site: "youtube.com", visit: shownId(1) })).body.nudge).toBeNull();
  });

  it("ignores yesterday: a visit more than a day old is not part of today", async () => {
    const { user, auth } = await armed();
    await visit(user, { minsAgo: 26 * 60, seconds: 9000 });
    expect((await ask(auth, { site: "youtube.com", visit: shownId(1) })).body.nudge).toBeNull();
  });

  it("nudges again for the same site only after the cooldown", async () => {
    const { user, auth } = await armed();
    await goOverBudget(user);
    expect((await ask(auth, { site: "youtube.com", visit: shownId(1) })).body.nudge).not.toBeNull();
    expect((await ask(auth, { site: "youtube.com", visit: shownId(2) })).body.nudge).toBeNull(); // straight after
    await db.query("UPDATE nudges SET created_at = NOW() - INTERVAL '9 minutes' WHERE user_id = $1", [user.id]);
    expect((await ask(auth, { site: "youtube.com", visit: shownId(3) })).body.nudge).toBeNull(); // 9 minutes
    await db.query("UPDATE nudges SET created_at = NOW() - INTERVAL '11 minutes' WHERE user_id = $1", [user.id]);
    expect((await ask(auth, { site: "youtube.com", visit: shownId(4) })).body.nudge).not.toBeNull(); // 11 minutes
  });

  it("keeps the cooldown per site", async () => {
    const { user, auth } = await armed({ marked: ["youtube.com", "reddit.com"] });
    await goOverBudget(user);
    expect((await ask(auth, { site: "youtube.com", visit: shownId(1) })).body.nudge).not.toBeNull();
    expect((await ask(auth, { site: "reddit.com", visit: shownId(2) })).body.nudge).not.toBeNull();
  });
});

describe.skipIf(nearMidnight())("POST /api/nudges: repeat opens", () => {
  const opens = (user, n, minsAgo = 20) => Promise.all(Array.from({ length: n }, (_, i) => visit(user, { domain: "reddit.com", minsAgo: minsAgo + i, seconds: 20 })));

  it("nudges on the 5th open within 30 minutes (the visit starting now is the 5th)", async () => {
    const { user, auth } = await armed({ marked: ["reddit.com"] });
    await opens(user, 4);
    const res = await ask(auth, { site: "reddit.com", visit: shownId(1) }).expect(200);
    expect(res.body.nudge).toMatchObject({ kind: "repeat", title: "5 visits to reddit.com in 30 minutes" });
    expect(await rows(user)).toMatchObject([{ kind: "repeat", shown: true }]);
  });

  it("does not nudge on the 4th open", async () => {
    const { user, auth } = await armed({ marked: ["reddit.com"] });
    await opens(user, 3);
    expect((await ask(auth, { site: "reddit.com", visit: shownId(1) })).body.nudge).toBeNull();
  });

  it("does not count visits older than 30 minutes", async () => {
    const { user, auth } = await armed({ marked: ["reddit.com"] });
    await opens(user, 6, 31);
    expect((await ask(auth, { site: "reddit.com", visit: shownId(1) })).body.nudge).toBeNull();
  });

  it("only counts visits to the site being opened", async () => {
    const { user, auth } = await armed({ marked: ["reddit.com"] });
    await Promise.all(Array.from({ length: 6 }, (_, i) => visit(user, { domain: "github.com", minsAgo: 10 + i, seconds: 20 })));
    expect((await ask(auth, { site: "reddit.com", visit: shownId(1) })).body.nudge).toBeNull();
  });
});

describe("POST /api/nudges: which sites count", () => {
  it.each(["www.youtube.com", "m.youtube.com", "youtu.be", "YOUTUBE.COM"])("matches %s to the marked site youtube.com", async (site) => {
    if (nearMidnight()) return;
    const { user, auth } = await armed();
    await goOverBudget(user);
    expect((await ask(auth, { site, visit: shownId(1) }).expect(200)).body.nudge).toMatchObject({ kind: "over-budget" });
    expect((await rows(user))[0].site).toBe("youtube.com");
  });

  it("does nothing for a site that is not marked, however far over budget", async () => {
    if (nearMidnight()) return;
    const { user, auth } = await armed();
    await goOverBudget(user, 9000);
    expect((await ask(auth, { site: "github.com", visit: shownId(1) }).expect(200)).body).toEqual({ nudge: null });
    expect(await rows(user)).toEqual([]);
  });
});

describe("POST /api/nudges: when it does not apply", () => {
  it("does nothing when no tracking session is open", async () => {
    if (nearMidnight()) return;
    const user = await makeUser();
    await http().put("/api/settings").set(user.auth).send({ dailyBudgetSeconds: 3600 }).expect(200);
    await http().put("/api/sites/youtube.com").set(user.auth).send({ marked: true }).expect(200);
    await goOverBudget(user);
    expect((await ask(await extensionAuth(user), { site: "youtube.com", visit: shownId(1) }).expect(200)).body.nudge).toBeNull();
    expect(await rows(user)).toEqual([]);
  });

  it("does nothing once the session has been stopped", async () => {
    if (nearMidnight()) return;
    const { user, auth } = await armed();
    await goOverBudget(user);
    await http().post("/api/stop-tracking").set(user.auth).expect(200);
    expect((await ask(auth, { site: "youtube.com", visit: shownId(1) })).body.nudge).toBeNull();
  });

  it("does not let one user's marks or visits affect another's", async () => {
    if (nearMidnight()) return;
    const a = await armed();
    const b = await armed();
    await goOverBudget(b.user, 9000);
    expect((await ask(a.auth, { site: "youtube.com", visit: shownId(1) })).body.nudge).toBeNull();
    expect(await rows(a.user)).toEqual([]);
  });

  it("falls back to UTC for a time zone it does not know, instead of failing", async () => {
    if (nearMidnight()) return;
    const { user, auth } = await armed();
    await goOverBudget(user);
    expect((await ask(auth, { site: "youtube.com", visit: shownId(1) }, "Not/AZone").expect(200)).body.nudge).not.toBeNull();
  });
});

describe.skipIf(nearMidnight())("POST /api/nudges: the holdout and retries", () => {
  it("records a held-out nudge as not shown and tells the extension nothing", async () => {
    const { user, auth } = await armed();
    await goOverBudget(user);
    expect((await ask(auth, { site: "youtube.com", visit: heldId(1) }).expect(200)).body).toEqual({ nudge: null });
    expect(await rows(user)).toMatchObject([{ kind: "over-budget", shown: false }]);
  });

  it("counts a held-out nudge towards the cooldown, so the next open does not roll again", async () => {
    const { user, auth } = await armed();
    await goOverBudget(user);
    await ask(auth, { site: "youtube.com", visit: heldId(1) });
    expect((await ask(auth, { site: "youtube.com", visit: shownId(2) })).body.nudge).toBeNull();
    expect(await rows(user)).toHaveLength(1);
  });

  it("decides once per visit: asking again for the same visit shows nothing and records nothing more", async () => {
    const { user, auth } = await armed();
    await goOverBudget(user);
    expect((await ask(auth, { site: "youtube.com", visit: shownId(7) })).body.nudge).not.toBeNull();
    expect((await ask(auth, { site: "youtube.com", visit: shownId(7) })).body.nudge).toBeNull();
    expect(await rows(user)).toHaveLength(1);
  });

  it("still answers nothing for a visit it decided long ago, even after the cooldown has passed", async () => {
    const { user, auth } = await armed();
    await goOverBudget(user);
    expect((await ask(auth, { site: "youtube.com", visit: shownId(8) })).body.nudge).not.toBeNull();
    await db.query("UPDATE nudges SET created_at = NOW() - interval '1 hour' WHERE user_id = $1", [user.id]);
    expect((await ask(auth, { site: "youtube.com", visit: shownId(8) })).body.nudge).toBeNull(); // a retried request, not a new visit
    expect(await rows(user)).toHaveLength(1);
  });

  it("is safe when two requests arrive at once: only one nudge is shown", async () => {
    const { user, auth } = await armed();
    await goOverBudget(user);
    const answers = await Promise.all([1, 2, 3, 4].map((n) => ask(auth, { site: "youtube.com", visit: shownId(n) })));
    expect(answers.filter((r) => r.body.nudge !== null)).toHaveLength(1);
    expect(await rows(user)).toHaveLength(1);
  });
});

describe("POST /api/nudges: who may ask, and what", () => {
  it("needs a login", async () => {
    await http().post("/api/nudges").send({ site: "youtube.com", visit: shownId(1) }).expect(401);
  });

  it("accepts the extension's limited token and the user's own", async () => {
    const { user, auth } = await armed();
    await ask(auth, { site: "youtube.com", visit: shownId(1) }).expect(200);
    await ask(user.auth, { site: "youtube.com", visit: shownId(2) }).expect(200);
  });

  it.each([
    ["no site", { visit: shownId(1) }],
    ["an empty site", { site: "", visit: shownId(1) }],
    ["a web address instead of a site", { site: "https://youtube.com/watch?v=x", visit: shownId(1) }],
    ["a site with a path", { site: "youtube.com/watch", visit: shownId(1) }],
    ["a site that is too long", { site: `${"a".repeat(250)}.com`, visit: shownId(1) }],
    ["no visit id", { site: "youtube.com" }],
    ["a visit id that is not a uuid", { site: "youtube.com", visit: "not-a-uuid" }],
  ])("refuses %s with a 400 and records nothing", async (_what, body) => {
    const { user, auth } = await armed();
    await ask(auth, body).expect(400);
    expect(await rows(user)).toEqual([]);
  });
});

describe("your data: nudges are exported and deleted with the rest", () => {
  const record = (user, over = {}) =>
    db.query("INSERT INTO nudges (user_id, client_event_id, site, kind, shown) VALUES ($1, $2, $3, $4, $5)", [
      user.id, over.visit ?? randomUUID(), over.site ?? "youtube.com", over.kind ?? "over-budget", over.shown ?? true,
    ]);
  const count = async (user) => Number((await db.query("SELECT COUNT(*) FROM nudges WHERE user_id = $1", [user.id])).rows[0].count);

  it("is in the JSON export: site, kind, whether it was shown and when, but not the visit id", async () => {
    const user = await makeUser();
    await record(user, { site: "reddit.com", kind: "repeat", shown: false });
    const res = await http().get("/api/account/export?format=json").set(user.auth).expect(200);
    const exported = JSON.parse(res.text);
    expect(exported.nudges).toHaveLength(1);
    expect(exported.nudges[0]).toMatchObject({ site: "reddit.com", kind: "repeat", shown: false });
    expect(Object.keys(exported.nudges[0]).sort()).toEqual(["createdAt", "kind", "shown", "site"]);
  });

  it("exports an empty list for a user with none", async () => {
    const user = await makeUser();
    const exported = JSON.parse((await http().get("/api/account/export?format=json").set(user.auth).expect(200)).text);
    expect(exported.nudges).toEqual([]);
  });

  it("is deleted by 'delete my history', and only for that user", async () => {
    const user = await makeUser();
    const other = await makeUser();
    await record(user);
    await record(other);
    await http().delete("/api/account/data").set(user.auth).send({ password: user.password }).expect(200);
    expect(await count(user)).toBe(0);
    expect(await count(other)).toBe(1);
  });

  it("is deleted with the account", async () => {
    const user = await makeUser();
    await record(user);
    await http().delete("/api/account").set(user.auth).send({ password: user.password }).expect(204);
    expect(await count(user)).toBe(0);
  });
});
