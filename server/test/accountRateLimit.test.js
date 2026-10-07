import { describe, it, expect, vi } from "vitest";
import request from "supertest";

describe("account endpoints rate limit", () => {
  it("returns 429 once a user has tried too often, so a stolen token cannot guess the password", async () => {
    // The limiter reads its ceiling when the route module loads, so set it before importing the app.
    vi.stubEnv("ACCOUNT_RATE_LIMIT", "3");
    const { default: app } = await import("../app.js");
    await request(app).post("/api/auth/register").send({ email: "limit@test.io", password: "password123" }).expect(201);
    const login = await request(app).post("/api/auth/login").send({ email: "limit@test.io", password: "password123" }).expect(200);
    const auth = { Authorization: `Bearer ${login.body.token}` };

    const guess = () => request(app).delete("/api/account/data").set(auth).send({ password: "wrong-guess" });
    for (let i = 0; i < 3; i++) expect((await guess()).status).toBe(403);
    const blocked = await guess();
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toBe("Too many requests");
    // the real password is turned away too once blocked: that is the point
    expect((await request(app).delete("/api/account/data").set(auth).send({ password: "password123" })).status).toBe(429);
  });
});
