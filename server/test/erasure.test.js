import { describe, it, expect, afterEach, vi } from "vitest";

// The limiter reads its ceiling when the route module loads; this file deletes many accounts and histories, so raise it first.
vi.hoisted(() => {
  process.env.ACCOUNT_RATE_LIMIT = "1000";
});
import db from "../db.js";
import { http, makeUser } from "./helpers.js";
import { setNotifier, createNotifier } from "../notifications/notifier.js";
import { settleBackground } from "../notifications/background.js";
import { retryPendingErasures, startErasureRetries } from "../notifications/erasure.js";

const PASSWORD = "password123"; // what makeUser registers with
const fakeNotifier = (result = true) => ({ enabled: true, send: vi.fn(), erase: vi.fn().mockResolvedValue(result) });
const removeAccount = (user) => http().delete("/api/account").set(user.auth).send({ password: PASSWORD });
const removeHistory = (user) => http().delete("/api/account/data").set(user.auth).send({ password: PASSWORD });
const pending = async (userId) => (await db.query("SELECT user_id, attempts, last_attempt_at FROM pending_erasures WHERE user_id = $1", [userId])).rows[0];
const userExists = async (userId) => Number((await db.query("SELECT COUNT(*) FROM users WHERE id = $1", [userId])).rows[0].count) === 1;

afterEach(() => setNotifier(undefined));

describe("deleting an account", () => {
  it("asks the notification service to erase the user, and forgets the request once it confirms", async () => {
    const notifier = fakeNotifier(true);
    setNotifier(notifier);
    const user = await makeUser();
    await removeAccount(user).expect(204);
    await settleBackground();
    expect(notifier.erase).toHaveBeenCalledWith({ id: user.id });
    expect(await userExists(user.id)).toBe(false);
    expect(await pending(user.id)).toBeUndefined();
  });

  it("records the request together with the deletion, so it exists even if the call to the service never returns", async () => {
    let answer;
    setNotifier({ enabled: true, send: vi.fn(), erase: () => new Promise((resolve) => (answer = resolve)) }); // a service that has not answered yet
    const user = await makeUser();
    try {
      await removeAccount(user).expect(204);
      expect(await userExists(user.id)).toBe(false);
      expect(await pending(user.id)).toMatchObject({ user_id: user.id, attempts: 0 }); // recorded, with the call still in flight
    } finally {
      answer?.(false); // always let the background attempt finish, so a failure here cannot hang the tests that follow
      await settleBackground();
    }
  });

  it("keeps the request when the service cannot be reached, still deletes the account, and counts the attempt", async () => {
    setNotifier(fakeNotifier(false));
    const user = await makeUser();
    await removeAccount(user).expect(204);
    await settleBackground();
    expect(await userExists(user.id)).toBe(false);
    const row = await pending(user.id);
    expect(row.attempts).toBe(1);
    expect(row.last_attempt_at).not.toBeNull();
  });

  it("still answers 204 when the erase call blows up unexpectedly", async () => {
    setNotifier({ enabled: true, send: vi.fn(), erase: vi.fn().mockRejectedValue(new Error("boom")) });
    const user = await makeUser();
    await removeAccount(user).expect(204);
    await settleBackground();
    expect(await userExists(user.id)).toBe(false);
  });

  it("does nothing about the notification service when the server is not connected to one", async () => {
    setNotifier(createNotifier({ env: {} }));
    const user = await makeUser();
    await removeAccount(user).expect(204);
    await settleBackground();
    expect(await pending(user.id)).toBeUndefined();
  });

  it("still needs the password: a wrong one deletes nothing and records nothing", async () => {
    const notifier = fakeNotifier();
    setNotifier(notifier);
    const user = await makeUser();
    await http().delete("/api/account").set(user.auth).send({ password: "wrong-password" }).expect(403);
    expect(await userExists(user.id)).toBe(true);
    expect(await pending(user.id)).toBeUndefined();
    expect(notifier.erase).not.toHaveBeenCalled();
  });
});

describe("deleting history", () => {
  it("also asks the service to erase the user (it holds copies of what was sent), and keeps the account", async () => {
    const notifier = fakeNotifier(true);
    setNotifier(notifier);
    const user = await makeUser();
    await removeHistory(user).expect(200);
    await settleBackground();
    expect(notifier.erase).toHaveBeenCalledWith({ id: user.id });
    expect(await userExists(user.id)).toBe(true);
    expect(await pending(user.id)).toBeUndefined();
  });

  it("keeps the request when the service cannot be reached", async () => {
    setNotifier(fakeNotifier(false));
    const user = await makeUser();
    await removeHistory(user).expect(200);
    await settleBackground();
    expect(await userExists(user.id)).toBe(true);
    expect((await pending(user.id)).attempts).toBe(1);
  });

  it("records no request when the server is not connected to a notification service", async () => {
    setNotifier(createNotifier({ env: {} }));
    const user = await makeUser();
    await removeHistory(user).expect(200);
    expect(await pending(user.id)).toBeUndefined();
  });

  it("a second deletion while one is waiting does not duplicate the request", async () => {
    setNotifier(fakeNotifier(false));
    const user = await makeUser();
    await removeHistory(user).expect(200);
    await removeHistory(user).expect(200);
    await settleBackground();
    expect(Number((await db.query("SELECT COUNT(*) FROM pending_erasures WHERE user_id = $1", [user.id])).rows[0].count)).toBe(1);
  });
});

describe("retrying", () => {
  const fail = async () => {
    const notifier = fakeNotifier(false);
    setNotifier(notifier);
    const user = await makeUser();
    await removeAccount(user).expect(204);
    await settleBackground();
    return { user, notifier };
  };

  it("waits a few minutes after a failure, then tries again and clears the request when the service answers", async () => {
    const { user } = await fail();
    const notifier = fakeNotifier(true);

    expect(await retryPendingErasures({ notifier })).toBe(0); // tried a moment ago: not due yet
    expect(notifier.erase).not.toHaveBeenCalledWith({ id: user.id });

    await db.query("UPDATE pending_erasures SET last_attempt_at = NOW() - INTERVAL '10 minutes' WHERE user_id = $1", [user.id]);
    await retryPendingErasures({ notifier });
    expect(notifier.erase).toHaveBeenCalledWith({ id: user.id });
    expect(await pending(user.id)).toBeUndefined();
  });

  it("keeps trying (and counting) while the service stays unreachable", async () => {
    const { user } = await fail();
    await db.query("UPDATE pending_erasures SET last_attempt_at = NOW() - INTERVAL '10 minutes' WHERE user_id = $1", [user.id]);
    await retryPendingErasures({ notifier: fakeNotifier(false) });
    expect((await pending(user.id)).attempts).toBe(2);
  });

  it("does not touch waiting requests when the server is no longer connected to a service", async () => {
    const { user } = await fail();
    await db.query("UPDATE pending_erasures SET last_attempt_at = NULL WHERE user_id = $1", [user.id]);
    expect(await retryPendingErasures({ notifier: createNotifier({ env: {} }) })).toBe(0);
    expect(await pending(user.id)).toBeDefined();
  });

  it("picks up a request left over from before a restart, as soon as the server starts", async () => {
    const user = await makeUser();
    await db.query("INSERT INTO pending_erasures (user_id) VALUES ($1)", [user.id]);
    const notifier = fakeNotifier(true);
    const timer = startErasureRetries({ notifier, intervalMs: 3_600_000, log: { info: vi.fn(), warn: vi.fn() } });
    try {
      await vi.waitFor(async () => expect(await pending(user.id)).toBeUndefined());
      expect(notifier.erase).toHaveBeenCalledWith({ id: user.id });
    } finally {
      clearInterval(timer);
    }
  });

  it("does not start a retry loop when notifications are not configured", () => {
    expect(startErasureRetries({ notifier: createNotifier({ env: {} }) })).toBeNull();
  });
});
