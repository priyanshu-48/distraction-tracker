import { describe, it, expect, vi, afterEach } from "vitest";
import db from "../db.js";
import { http, makeUser } from "./helpers.js";

afterEach(() => vi.restoreAllMocks());

describe("error handling", () => {
  it("answers malformed JSON with a 400 in the standard shape", async () => {
    const res = await http().post("/api/auth/login").set("Content-Type", "application/json").send("{bad json").expect(400);
    expect(res.body).toEqual({ error: "Bad request", message: "Request body is not valid JSON" });
  });

  it("answers an oversized body with a 413", async () => {
    const res = await http().post("/api/auth/login").send({ email: "a@test.io", password: "x".repeat(300_000) }).expect(413);
    expect(res.body.error).toBe("Payload too large");
  });

  it("answers an unknown route with a JSON 404", async () => {
    const res = await http().get("/api/nope").expect(404);
    expect(res.headers["content-type"]).toMatch(/json/);
    expect(res.body.error).toBe("Not found");
  });

  it("hides internals on a 500 but returns a request id to quote", async () => {
    const user = await makeUser();
    vi.spyOn(db, "query").mockRejectedValueOnce(new Error("secret db detail at /srv/app/models/x.js"));
    const res = await http().get("/api/settings").set(user.auth).expect(500);

    expect(res.body).toMatchObject({ error: "Internal server error", message: "Something went wrong" });
    expect(res.body.requestId).toBe(res.headers["x-request-id"]);
    expect(JSON.stringify(res.body)).not.toMatch(/secret|stack|\.js/);
  });

  it("still maps a duplicate email to 409 after the controller cleanup", async () => {
    const body = { email: "dup@test.io", password: "password123" };
    await http().post("/api/auth/register").send(body).expect(201);
    await http().post("/api/auth/register").send(body).expect(409);
  });
});

describe("request ids", () => {
  it("generates an id when none is sent", async () => {
    const res = await http().get("/healthz");
    expect(res.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("reuses a sane id from the caller", async () => {
    const res = await http().get("/healthz").set("X-Request-Id", "trace-abc_123");
    expect(res.headers["x-request-id"]).toBe("trace-abc_123");
  });

  it("replaces an id with odd characters instead of echoing it", async () => {
    const res = await http().get("/healthz").set("X-Request-Id", "bad id; <script>");
    expect(res.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("GET /healthz", () => {
  it("reports ok without authentication when the database answers", async () => {
    const res = await http().get("/healthz").expect(200);
    expect(res.body).toEqual({ status: "ok", db: "up" });
  });

  it("returns 503 when the database does not answer", async () => {
    vi.spyOn(db, "query").mockRejectedValueOnce(new Error("connection refused"));
    const res = await http().get("/healthz").expect(503);
    expect(res.body).toEqual({ status: "degraded", db: "down" });
  });
});
