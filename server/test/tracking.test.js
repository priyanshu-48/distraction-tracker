import { describe, it, expect } from "vitest";
import db from "../db.js";
import { http, makeUser } from "./helpers.js";

const isTracking = async (user) => (await http().get("/api/is-tracking").set(user.auth).expect(200)).body.isTracking;

describe("tracking state", () => {
  it("requires authentication", async () => {
    await http().get("/api/is-tracking").expect(401);
    await http().post("/api/start-tracking").expect(401);
    await http().post("/api/stop-tracking").expect(401);
  });

  it("starts false, becomes true on start and false on stop", async () => {
    const user = await makeUser();
    expect(await isTracking(user)).toBe(false);
    await http().post("/api/start-tracking").set(user.auth).expect(200);
    expect(await isTracking(user)).toBe(true);
    await http().post("/api/stop-tracking").set(user.auth).expect(200);
    expect(await isTracking(user)).toBe(false);
  });

  it("is per user: one user's session does not start another's", async () => {
    const a = await makeUser("a");
    const b = await makeUser("b");
    await http().post("/api/start-tracking").set(a.auth).expect(200);
    expect(await isTracking(a)).toBe(true);
    expect(await isTracking(b)).toBe(false);

    await http().post("/api/stop-tracking").set(b.auth).expect(200); // b stopping must not end a's session
    expect(await isTracking(a)).toBe(true);
  });

  it("does not open a second session when started twice", async () => {
    const user = await makeUser();
    await http().post("/api/start-tracking").set(user.auth);
    await http().post("/api/start-tracking").set(user.auth);
    const { rows } = await db.query("SELECT COUNT(*) FROM tracking_sessions WHERE user_id = $1", [user.id]);
    expect(Number(rows[0].count)).toBe(1);
  });

  it("stopping when nothing is running is harmless", async () => {
    const user = await makeUser();
    await http().post("/api/stop-tracking").set(user.auth).expect(200);
    expect(await isTracking(user)).toBe(false);
  });
});
