import { describe, it, expect } from "vitest";
import db from "../db.js";
import { http, makeUser, interval } from "./helpers.js";

// The server keeps only time that lies inside a tracking session (decisions.md, D-23). Fixed times so nothing
// depends on now. The user's sessions: one from 10:00 to 10:30, and one from 11:00 that is still running.
const at = (hhmmss) => `2026-03-09T${hhmmss.length === 5 ? hhmmss + ":00" : hhmmss}.000Z`;
const visit = (from, to, over = {}) => interval({ startedAt: at(from), endedAt: at(to), ...over });

async function userWithSessions() {
  const user = await makeUser();
  await db.query("INSERT INTO tracking_sessions (user_id, start_time, end_time) VALUES ($1, $2, $3)", [user.id, at("10:00"), at("10:30")]);
  await db.query("INSERT INTO tracking_sessions (user_id, start_time) VALUES ($1, $2)", [user.id, at("11:00")]);
  return user;
}

const upload = (user, intervals) => http().post("/api/intervals").set(user.auth).send({ intervals }).expect(200);
const rows = async (user) =>
  (await db.query("SELECT started_at, ended_at, duration FROM tab_activity WHERE user_id = $1 ORDER BY started_at", [user.id])).rows.map((r) => ({
    start: r.started_at.toISOString().slice(11, 19),
    end: r.ended_at.toISOString().slice(11, 19),
    seconds: Math.round(r.duration),
  }));

describe("visits inside a session", () => {
  it("are stored exactly as sent", async () => {
    const user = await userWithSessions();
    const res = await upload(user, [visit("10:05", "10:10")]);
    expect(res.body).toMatchObject({ received: 1, stored: 1, rejected: 0, clamped: 0 });
    expect(await rows(user)).toEqual([{ start: "10:05:00", end: "10:10:00", seconds: 300 }]);
  });

  it("are stored in full when the session is still running, however long they last", async () => {
    const user = await userWithSessions();
    const res = await upload(user, [visit("11:10", "13:10")]);
    expect(res.body).toMatchObject({ stored: 1, clamped: 0 });
    expect(await rows(user)).toEqual([{ start: "11:10:00", end: "13:10:00", seconds: 7200 }]);
  });

  it("are stored when they end exactly where the session ends", async () => {
    const user = await userWithSessions();
    const res = await upload(user, [visit("10:20", "10:30")]);
    expect(res.body).toMatchObject({ stored: 1, clamped: 0 });
  });
});

describe("visits that run past the end of a session", () => {
  it("are cut at the session's end, with the duration recomputed", async () => {
    const user = await userWithSessions();
    const res = await upload(user, [visit("10:25", "10:35")]);
    expect(res.body).toMatchObject({ stored: 1, rejected: 0, clamped: 1 });
    expect(await rows(user)).toEqual([{ start: "10:25:00", end: "10:30:00", seconds: 300 }]);
  });

  it("are cut at the end of the session they started in, not carried into the next one", async () => {
    const user = await userWithSessions();
    await upload(user, [visit("10:20", "11:10")]); // spans Stop at 10:30 and Start at 11:00
    expect(await rows(user)).toEqual([{ start: "10:20:00", end: "10:30:00", seconds: 600 }]);
  });
});

describe("visits that started when no session was running", () => {
  it("are rejected: the extension had not yet noticed Stop", async () => {
    const user = await userWithSessions();
    const res = await upload(user, [visit("10:40", "10:45")]); // between the two sessions
    expect(res.body).toMatchObject({ received: 1, stored: 0, rejected: 1, clamped: 0 });
    expect(await rows(user)).toEqual([]);
  });

  it("are rejected before the first session", async () => {
    const user = await userWithSessions();
    expect((await upload(user, [visit("09:00", "09:30")])).body).toMatchObject({ stored: 0, rejected: 1 });
  });

  it("are rejected when they start exactly when the session ended", async () => {
    const user = await userWithSessions();
    expect((await upload(user, [visit("10:30", "10:35")])).body).toMatchObject({ stored: 0, rejected: 1 });
  });

  it("are all rejected for a user who never started a session", async () => {
    const user = await makeUser();
    const res = await upload(user, [visit("10:05", "10:10"), visit("11:05", "11:10")]);
    expect(res.body).toMatchObject({ received: 2, stored: 0, rejected: 2 });
  });

  it("do not count another user's sessions", async () => {
    const owner = await userWithSessions();
    const other = await makeUser();
    expect((await upload(other, [visit("10:05", "10:10")])).body).toMatchObject({ stored: 0, rejected: 1 });
    expect((await upload(owner, [visit("10:05", "10:10")])).body.stored).toBe(1);
  });
});

describe("visits that start a few seconds before a session", () => {
  it("are cut at the session's start when within five seconds (the two clocks are read at different moments)", async () => {
    const user = await userWithSessions();
    const res = await upload(user, [visit("09:59:57", "10:05")]);
    expect(res.body).toMatchObject({ stored: 1, clamped: 1 });
    expect(await rows(user)).toEqual([{ start: "10:00:00", end: "10:05:00", seconds: 300 }]);
  });

  it("are rejected when further before it than that", async () => {
    const user = await userWithSessions();
    expect((await upload(user, [visit("09:59:50", "10:05")])).body).toMatchObject({ stored: 0, rejected: 1 });
  });

  it("are rejected when they also ended before the session began, leaving nothing inside it", async () => {
    const user = await userWithSessions();
    expect((await upload(user, [visit("09:59:56", "09:59:59")])).body).toMatchObject({ stored: 0, rejected: 1 });
  });
});

describe("batches and retries", () => {
  it("counts each kind separately in a mixed batch", async () => {
    const user = await userWithSessions();
    const res = await upload(user, [
      visit("10:01", "10:02"), // stored
      visit("10:28", "10:40"), // stored, cut
      visit("10:50", "10:55"), // rejected
      visit("11:05", "11:06"), // stored
    ]);
    expect(res.body).toEqual({ success: true, received: 4, stored: 3, rejected: 1, clamped: 1 });
  });

  it("stays idempotent for a visit that was cut: re-uploading it stores nothing and changes nothing", async () => {
    const user = await userWithSessions();
    const batch = [visit("10:25", "10:35")];
    await upload(user, batch);
    const retry = await upload(user, batch);
    expect(retry.body).toMatchObject({ stored: 0 });
    expect(await rows(user)).toEqual([{ start: "10:25:00", end: "10:30:00", seconds: 300 }]);
  });

  it("keeps a late upload of a visit from a session that closed long ago (the extension was offline)", async () => {
    const user = await userWithSessions();
    expect((await upload(user, [visit("10:10", "10:15")])).body.stored).toBe(1);
  });

  it("is not affected by the order of the visits in a batch", async () => {
    const user = await userWithSessions();
    const res = await upload(user, [visit("11:05", "11:06"), visit("10:50", "10:55"), visit("10:01", "10:02")]);
    expect(res.body).toMatchObject({ stored: 2, rejected: 1 });
  });
});

describe("a session ended through the API", () => {
  it("rejects what the extension records after Stop", async () => {
    const user = await makeUser();
    await http().post("/api/start-tracking").set(user.auth).send({}).expect(200);
    await http().post("/api/stop-tracking").set(user.auth).send({}).expect(200);
    // a visit that begins well after the session ended: the old extension would still have recorded it
    const later = new Date(Date.now() + 60_000).toISOString();
    const res = await upload(user, [interval({ startedAt: later, endedAt: new Date(Date.now() + 120_000).toISOString() })]);
    expect(res.body).toMatchObject({ stored: 0, rejected: 1 });
  });
});
