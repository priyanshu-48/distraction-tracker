import { describe, it, expect, vi } from "vitest";
import request from "supertest";

describe("auth rate limit", () => {
  it("returns 429 once the limit is exceeded", async () => {
    // The limiter reads its limit when the route module loads, so set it before importing the app.
    vi.stubEnv("AUTH_RATE_LIMIT", "3");
    const { default: app } = await import("../app.js");

    const attempt = () => request(app).post("/api/auth/login").send({ email: "a@test.io", password: "password123" });
    for (let i = 0; i < 3; i++) expect((await attempt()).status).toBe(401);
    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toBe("Too many requests");
  });
});
