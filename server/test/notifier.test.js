import { describe, it, expect, vi } from "vitest";
import { createNotifier } from "../notifications/notifier.js";

const user = { id: 7, email: "me@test.io" };
const alert = { idempotencyKey: "k1", type: "budget-warning", title: "Heads up", body: "40m so far." };
const quietLog = () => ({ warn: vi.fn() });

describe("when it is not configured", () => {
  it("is disabled and sends nothing, with no client built", async () => {
    const notifier = createNotifier({ env: {}, log: quietLog() });
    expect(notifier.enabled).toBe(false);
    expect(await notifier.send(user, alert)).toBeNull();
  });

  it("needs both the URL and the key", () => {
    expect(createNotifier({ env: { NOTIFICATIONS_API_URL: "https://n.test" }, log: quietLog() }).enabled).toBe(false);
    expect(createNotifier({ env: { NOTIFICATIONS_API_KEY: "ntf_live_x" }, log: quietLog() }).enabled).toBe(false);
  });

  it("is enabled when both are set", () => {
    expect(createNotifier({ env: { NOTIFICATIONS_API_URL: "https://n.test", NOTIFICATIONS_API_KEY: "ntf_live_x" }, log: quietLog() }).enabled).toBe(true);
  });
});

describe("sending", () => {
  const fakeClient = () => ({
    upsertUser: vi.fn().mockResolvedValue({}),
    send: vi.fn().mockResolvedValue({ id: "n1", status: "queued", replayed: false }),
  });

  it("registers the user, then sends with the user's own id, the title and body, and the idempotency key", async () => {
    const client = fakeClient();
    const result = await createNotifier({ client, log: quietLog() }).send(user, alert);
    expect(client.upsertUser).toHaveBeenCalledWith("7", { email: "me@test.io" });
    expect(client.send).toHaveBeenCalledWith(
      { externalUserId: "7", type: "budget-warning", payload: { title: "Heads up", body: "40m so far." }, channels: ["in_app"] },
      { idempotencyKey: "k1" }
    );
    expect(result).toMatchObject({ id: "n1" });
  });

  it("tells the service about each user once per run, not on every alert", async () => {
    const client = fakeClient();
    const notifier = createNotifier({ client, log: quietLog() });
    await notifier.send(user, alert);
    await notifier.send(user, { ...alert, idempotencyKey: "k2" });
    await notifier.send({ id: 8, email: "other@test.io" }, alert);
    expect(client.upsertUser).toHaveBeenCalledTimes(2);
    expect(client.send).toHaveBeenCalledTimes(3);
  });

  it("never throws when the service fails: it logs and returns null", async () => {
    const client = fakeClient();
    client.send.mockRejectedValue(Object.assign(new Error("fetch failed"), { status: 0 }));
    const log = quietLog();
    await expect(createNotifier({ client, log }).send(user, alert)).resolves.toBeNull();
    expect(log.warn).toHaveBeenCalledOnce();
  });

  it("does not put the user's email or the alert text in its log line", async () => {
    const client = fakeClient();
    client.upsertUser.mockRejectedValue(new Error("boom"));
    const log = quietLog();
    await createNotifier({ client, log }).send(user, alert);
    const logged = JSON.stringify(log.warn.mock.calls);
    expect(logged).not.toContain("me@test.io");
    expect(logged).not.toContain("40m so far");
  });

  it("retries registering the user after a failure instead of remembering a user that was never registered", async () => {
    const client = fakeClient();
    client.upsertUser.mockRejectedValueOnce(new Error("down")).mockResolvedValue({});
    const notifier = createNotifier({ client, log: quietLog() });
    expect(await notifier.send(user, alert)).toBeNull();
    expect(await notifier.send(user, alert)).toMatchObject({ id: "n1" });
    expect(client.upsertUser).toHaveBeenCalledTimes(2);
  });
});
