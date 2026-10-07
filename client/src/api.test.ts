// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InternalAxiosRequestConfig } from "axios";
import api from "@/api";

// The HTTP client is what carries the login (cookie), the CSRF header and the "signed out" reaction, so it is tested
// here with a fake network layer rather than being mocked away as in the component tests.
let sent: InternalAxiosRequestConfig[];
let status: number;
const assign = vi.fn();
const realLocation = window.location;

beforeEach(() => {
  sent = [];
  status = 200;
  assign.mockReset();
  Object.defineProperty(window, "location", { configurable: true, value: { assign } });
  api.defaults.adapter = async (config) => {
    sent.push(config);
    if (status >= 400) throw Object.assign(new Error(`status ${status}`), { config, response: { status, data: {} } });
    return { data: {}, status, statusText: "OK", headers: {}, config };
  };
});
afterEach(() => {
  Object.defineProperty(window, "location", { configurable: true, value: realLocation });
});

const header = (config: InternalAxiosRequestConfig, name: string) => config.headers.get(name);

describe("requests", () => {
  it("send the login cookie, which the page itself never sees", async () => {
    await api.get("/settings");
    expect(sent[0].withCredentials).toBe(true);
    expect(header(sent[0], "Authorization")).toBeUndefined(); // no token is read from storage and attached
  });

  it.each(["post", "put", "delete", "patch"] as const)("carry the CSRF header on %s", async (method) => {
    await api[method]("/anything");
    expect(header(sent[0], "X-Requested-With")).toBe("dt");
  });

  it("leave the CSRF header off reads", async () => {
    await api.get("/settings");
    expect(header(sent[0], "X-Requested-With")).toBeUndefined();
  });

  it.each(["/summary", "/range", "/sites"])("add the browser's time zone to %s", async (path) => {
    await api.get(path, { params: { date: "2026-10-05" } });
    expect(sent[0].params).toEqual({ tz: Intl.DateTimeFormat().resolvedOptions().timeZone, date: "2026-10-05" });
  });

  it("do not add a time zone to other calls", async () => {
    await api.get("/settings");
    expect(sent[0].params).toBeUndefined();
  });

  it("let the caller's own tz win", async () => {
    await api.get("/summary", { params: { tz: "Asia/Kolkata" } });
    expect(sent[0].params.tz).toBe("Asia/Kolkata");
  });
});

describe("a 401 answer", () => {
  it("sends the user to the sign-in page and still rejects, so the caller stops", async () => {
    status = 401;
    await expect(api.get("/summary")).rejects.toMatchObject({ response: { status: 401 } });
    expect(assign).toHaveBeenCalledWith("/login");
  });

  it.each(["/auth/me", "/auth/login"])("is left to the caller on %s (being signed out is normal there)", async (path) => {
    status = 401;
    await expect(api.get(path)).rejects.toBeTruthy();
    expect(assign).not.toHaveBeenCalled();
  });

  it.each([403, 500])("is the only status that redirects: %s does not", async (code) => {
    status = code;
    await expect(api.get("/summary")).rejects.toBeTruthy();
    expect(assign).not.toHaveBeenCalled();
  });
});
