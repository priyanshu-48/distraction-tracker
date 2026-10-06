// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkExtension, forgetAccount, syncToken, type ExtensionReport } from "./extension";

const report: ExtensionReport = {
  status: "ok",
  version: "0.1.0",
  hasToken: true,
  authState: "ok",
  tracking: false,
  queued: 2,
  lastUploadAt: "2026-10-06T10:00:00.000Z",
};

type Reply = { response?: unknown; lastError?: unknown; throws?: boolean };

/** Installs a fake chrome.runtime that answers each message type from `replies`. */
function fakeChrome(replies: Record<string, Reply>) {
  const sent: Array<{ id: string; message: { type: string } }> = [];
  const runtime = {
    lastError: undefined as unknown,
    sendMessage(id: string, message: { type: string }, callback: (response: unknown) => void) {
      sent.push({ id, message });
      const reply = replies[message.type] ?? {};
      if (reply.throws) throw new Error("Extension context invalidated");
      runtime.lastError = reply.lastError;
      callback(reply.response);
    },
  };
  (window as unknown as { chrome: unknown }).chrome = { runtime };
  return sent;
}

beforeEach(() => vi.stubEnv("VITE_EXTENSION_ID", "abcdefghijklmnopabcdefghijklmnop"));
afterEach(() => {
  vi.unstubAllEnvs();
  delete (window as unknown as { chrome?: unknown }).chrome;
});

describe("checkExtension", () => {
  it("reports an unconfigured extension when no ID is set", async () => {
    vi.stubEnv("VITE_EXTENSION_ID", "");
    expect(await checkExtension()).toEqual({ kind: "unconfigured" });
  });

  it("reports an unsupported browser when there is no extension messaging", async () => {
    expect(await checkExtension()).toEqual({ kind: "unsupported" });
  });

  it("reports not-found when nobody answers", async () => {
    fakeChrome({ PING: { lastError: { message: "Could not establish connection" } } });
    expect(await checkExtension()).toEqual({ kind: "not-found" });
  });

  it("tells an outdated extension apart from a missing one", async () => {
    // An extension that listens but does not know PING closes the channel without replying.
    fakeChrome({ PING: { lastError: { message: "The message port closed before a response was received." } } });
    expect(await checkExtension()).toEqual({ kind: "outdated" });
    // Nobody there (not installed, disabled, wrong ID) is worded differently by Chrome.
    fakeChrome({ PING: { lastError: { message: "Could not establish connection. Receiving end does not exist." } } });
    expect(await checkExtension()).toEqual({ kind: "not-found" });
  });

  it("reports not-found when sending throws", async () => {
    fakeChrome({ PING: { throws: true } });
    expect(await checkExtension()).toEqual({ kind: "not-found" });
  });

  it("returns what the extension says about itself", async () => {
    const sent = fakeChrome({ PING: { response: report } });
    expect(await checkExtension()).toEqual({ kind: "connected", report });
    expect(sent[0]).toEqual({ id: "abcdefghijklmnopabcdefghijklmnop", message: { type: "PING" } });
  });

  it("does not trust a reply that is not an ok report", async () => {
    fakeChrome({ PING: { response: { status: "error" } } });
    expect(await checkExtension()).toEqual({ kind: "not-found" });
  });
});

describe("syncToken", () => {
  it("sends the token and is true when the extension accepts it", async () => {
    const sent = fakeChrome({ SET_TOKEN: { response: { status: "ok" } } });
    expect(await syncToken("the.jwt.token")).toBe(true);
    expect(sent[0].message).toEqual({ type: "SET_TOKEN", token: "the.jwt.token" });
  });

  it("is false when the extension rejects the token or is missing", async () => {
    fakeChrome({ SET_TOKEN: { response: { status: "invalid" } } });
    expect(await syncToken("bad")).toBe(false);
    fakeChrome({ SET_TOKEN: { lastError: { message: "gone" } } });
    expect(await syncToken("x")).toBe(false);
  });

  it("does nothing, quietly, when there is no extension", async () => {
    expect(await syncToken("x")).toBe(false);
  });
});

describe("forgetAccount", () => {
  it("sends LOGOUT", async () => {
    const sent = fakeChrome({ LOGOUT: { response: { status: "ok" } } });
    await forgetAccount();
    expect(sent.map((s) => s.message.type)).toEqual(["LOGOUT"]);
  });

  it("never throws when the extension is missing", async () => {
    await expect(forgetAccount()).resolves.toBeUndefined();
  });
});
