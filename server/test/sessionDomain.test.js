import { describe, it, expect } from "vitest";
import {
  COOKIE_NAME,
  EXTENSION_TOKEN_SECONDS,
  SESSION_SECONDS,
  clearCookieOptions,
  cookieOptions,
  parseCookies,
  tokenClaims,
} from "../domain/session.js";

describe("cookieOptions", () => {
  it("is httpOnly, strict, limited to /api and lasts a day", () => {
    expect(cookieOptions({})).toEqual({ httpOnly: true, sameSite: "strict", secure: false, path: "/api", maxAge: SESSION_SECONDS * 1000 });
    expect(SESSION_SECONDS).toBe(86_400);
  });

  it("is Secure in production", () => {
    expect(cookieOptions({ NODE_ENV: "production" }).secure).toBe(true);
    expect(cookieOptions({ NODE_ENV: "development" }).secure).toBe(false);
  });

  it("lets COOKIE_SECURE decide either way, for plain http in a production-mode container or to force it elsewhere", () => {
    expect(cookieOptions({ NODE_ENV: "production", COOKIE_SECURE: "false" }).secure).toBe(false);
    expect(cookieOptions({ NODE_ENV: "development", COOKIE_SECURE: "true" }).secure).toBe(true);
  });

  it("never turns httpOnly or SameSite off, whatever the environment says", () => {
    for (const env of [{}, { NODE_ENV: "production" }, { COOKIE_SECURE: "false" }, { COOKIE_SECURE: "true" }]) {
      expect(cookieOptions(env)).toMatchObject({ httpOnly: true, sameSite: "strict", path: "/api" });
    }
  });
});

describe("clearCookieOptions", () => {
  it("has the same attributes as the cookie, without an expiry, so the browser matches and removes it", () => {
    const { maxAge, ...same } = cookieOptions({ NODE_ENV: "production" });
    expect(maxAge).toBeGreaterThan(0);
    expect(clearCookieOptions({ NODE_ENV: "production" })).toEqual(same);
  });
});

describe("parseCookies", () => {
  it("reads several cookies and trims the spaces between them", () => {
    expect(parseCookies("a=1; dt_session=abc.def.ghi;  b=2")).toEqual({ a: "1", dt_session: "abc.def.ghi", b: "2" });
  });

  it("is empty for a missing or empty header", () => {
    expect(parseCookies(undefined)).toEqual({});
    expect(parseCookies("")).toEqual({});
    expect(parseCookies(null)).toEqual({});
  });

  it("decodes percent-encoding and keeps what it cannot decode", () => {
    expect(parseCookies("a=x%20y")).toEqual({ a: "x y" });
    expect(parseCookies("a=%E0%A4%A")).toEqual({ a: "%E0%A4%A" });
  });

  it("keeps an equals sign inside a value", () => {
    expect(parseCookies("a=b=c")).toEqual({ a: "b=c" });
  });

  it("lets the first of two cookies with one name win, and ignores a part with no name", () => {
    expect(parseCookies("a=1; a=2")).toEqual({ a: "1" });
    expect(parseCookies("=orphan; b=2; novalue")).toEqual({ b: "2" });
  });

  it("finds the session cookie by its name", () => {
    expect(parseCookies(`other=1; ${COOKIE_NAME}=tok`)[COOKIE_NAME]).toBe("tok");
  });
});

describe("tokenClaims", () => {
  it("defaults to a full user token at version 0", () => {
    expect(tokenClaims({ id: 7, email: "a@b.c" })).toEqual({ id: 7, email: "a@b.c", v: 0, scope: "user" });
  });

  it("carries the user's version and the scope asked for, and nothing secret", () => {
    const claims = tokenClaims({ id: 7, email: "a@b.c", token_version: 3, password_hash: "x" }, "ingest");
    expect(claims).toEqual({ id: 7, email: "a@b.c", v: 3, scope: "ingest" });
  });

  it("gives the extension a month", () => {
    expect(EXTENSION_TOKEN_SECONDS).toBe(30 * 24 * 60 * 60);
  });
});
