import { describe, it, expect } from "vitest";
import db from "../db.js";
import { http, makeTrackingUser, interval } from "./helpers.js";

const upload = (user, intervals) => http().post("/api/intervals").set(user.auth).send({ intervals });
const rowCount = async (userId) => Number((await db.query("SELECT COUNT(*) FROM tab_activity WHERE user_id = $1", [userId])).rows[0].count);

describe("POST /api/intervals", () => {
  it("stores a batch and computes duration on the server", async () => {
    const user = await makeTrackingUser();
    const res = await upload(user, [interval({ seconds: 90 }), interval({ minsAgo: 20, seconds: 30 })]).expect(200);
    expect(res.body).toMatchObject({ received: 2, stored: 2 });

    const { rows } = await db.query("SELECT duration FROM tab_activity WHERE user_id = $1 ORDER BY duration", [user.id]);
    expect(rows.map((r) => Math.round(r.duration))).toEqual([30, 90]);
  });

  it("is idempotent: re-uploading the same batch stores nothing new", async () => {
    const user = await makeTrackingUser();
    const batch = [interval(), interval({ minsAgo: 20 })];
    await upload(user, batch).expect(200);
    const retry = await upload(user, batch).expect(200);
    expect(retry.body).toMatchObject({ received: 2, stored: 0 });
    expect(await rowCount(user.id)).toBe(2);
  });

  it("stores only the new intervals when a batch partly overlaps an earlier one", async () => {
    const user = await makeTrackingUser();
    const old = interval();
    await upload(user, [old]);
    const res = await upload(user, [old, interval({ minsAgo: 30 })]).expect(200);
    expect(res.body.stored).toBe(1);
    expect(await rowCount(user.id)).toBe(2);
  });

  it("accepts a full batch of 50 and refuses 51, storing nothing from the refused one", async () => {
    const user = await makeTrackingUser();
    const batch = (n, from) => Array.from({ length: n }, (_, i) => interval({ minsAgo: from + i }));
    expect((await upload(user, batch(50, 10)).expect(200)).body).toMatchObject({ received: 50, stored: 50 });
    await upload(user, batch(51, 200)).expect(400);
    expect(await rowCount(user.id)).toBe(50);
  });

  it("a retry after a lost response leaves the totals exact", async () => {
    // The server stored the batch but the extension never saw the answer, so it sends the same batch again.
    const user = await makeTrackingUser();
    const batch = [interval({ seconds: 90 }), interval({ minsAgo: 20, seconds: 30 })];
    await upload(user, batch).expect(200);
    await upload(user, batch).expect(200);
    await upload(user, batch).expect(200);
    const { rows } = await db.query("SELECT COUNT(*)::int AS visits, SUM(duration)::int AS seconds FROM tab_activity WHERE user_id = $1", [user.id]);
    expect(rows[0]).toEqual({ visits: 2, seconds: 120 });
  });

  it("scopes event ids per user", async () => {
    const a = await makeTrackingUser("a");
    const b = await makeTrackingUser("b");
    const shared = interval();
    expect((await upload(a, [shared])).body.stored).toBe(1);
    expect((await upload(b, [shared])).body.stored).toBe(1);
  });

  it("takes the owner from the token, ignoring any userId in the body", async () => {
    const a = await makeTrackingUser("a");
    const b = await makeTrackingUser("b");
    await http().post("/api/intervals").set(a.auth).send({ intervals: [{ ...interval(), userId: b.id }] }).expect(200);
    expect(await rowCount(a.id)).toBe(1);
    expect(await rowCount(b.id)).toBe(0);
  });

  it("requires authentication", async () => {
    await http().post("/api/intervals").send({ intervals: [interval()] }).expect(401);
  });

  it.each([
    ["an empty batch", () => []],
    ["more than 50 intervals", () => Array.from({ length: 51 }, () => interval())],
    ["an interval that ends before it starts", () => [interval({ endedAt: new Date(Date.now() - 3600000).toISOString() })]],
    ["an interval longer than 24h", () => [interval({ endedAt: new Date(Date.now() + 2 * 86400000).toISOString() })]],
    ["a non-http url", () => [interval({ url: "javascript:alert(1)" })]],
    ["a malformed event id", () => [interval({ clientEventId: "nope" })]],
    ["a missing domain", () => [interval({ domain: undefined })]],
    ["a non-ISO timestamp", () => [interval({ startedAt: "yesterday" })]],
  ])("rejects %s with 400 and stores nothing", async (_label, make) => {
    const user = await makeTrackingUser();
    await upload(user, make()).expect(400);
    expect(await rowCount(user.id)).toBe(0);
  });

  it("rejects a body that is not an intervals array", async () => {
    const user = await makeTrackingUser();
    await http().post("/api/intervals").set(user.auth).send({ intervals: "x" }).expect(400);
    await http().post("/api/intervals").set(user.auth).send({}).expect(400);
  });

  it("no longer serves the old start/end endpoints", async () => {
    const user = await makeTrackingUser();
    await http().post("/api/start-tab").set(user.auth).send({}).expect(404);
    await http().post("/api/end-tab").set(user.auth).send({}).expect(404);
  });
});
