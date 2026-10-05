import { describe, it, expect } from "vitest";
import jwt from "jsonwebtoken";
import db from "../db.js";
import { http, makeUser } from "./helpers.js";

const creds = { email: "a@test.io", password: "password123" };

describe("POST /api/auth/register", () => {
  it("creates a user and stores a hash, not the password", async () => {
    await http().post("/api/auth/register").send(creds).expect(201);
    const { rows } = await db.query("SELECT password_hash FROM users WHERE email = $1", [creds.email]);
    expect(rows).toHaveLength(1);
    expect(rows[0].password_hash).not.toContain(creds.password);
    expect(rows[0].password_hash).toMatch(/^\$2[aby]\$/);
  });

  it("rejects a duplicate email with 409", async () => {
    await http().post("/api/auth/register").send(creds).expect(201);
    await http().post("/api/auth/register").send(creds).expect(409);
  });

  it.each([
    ["not an email", { email: "nope", password: "password123" }],
    ["password under 8 chars", { email: "b@test.io", password: "short" }],
    ["password over 72 chars", { email: "b@test.io", password: "x".repeat(73) }],
    ["missing password", { email: "b@test.io" }],
    ["empty body", {}],
  ])("rejects %s with 400", async (_label, body) => {
    await http().post("/api/auth/register").send(body).expect(400);
  });
});

describe("POST /api/auth/login", () => {
  it("returns a token and a user without the password hash", async () => {
    await http().post("/api/auth/register").send(creds);
    const res = await http().post("/api/auth/login").send(creds).expect(200);
    expect(res.body.token).toBeTypeOf("string");
    expect(res.body.user.email).toBe(creds.email);
    expect(res.body.user).not.toHaveProperty("password_hash");
  });

  it("gives the same answer for a wrong password and an unknown email", async () => {
    await http().post("/api/auth/register").send(creds);
    const wrongPw = await http().post("/api/auth/login").send({ ...creds, password: "wrong-password" });
    const unknown = await http().post("/api/auth/login").send({ email: "ghost@test.io", password: "password123" });
    expect(wrongPw.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrongPw.body).toEqual(unknown.body);
  });

  it("rejects a malformed body with 400", async () => {
    await http().post("/api/auth/login").send({ email: "a@test.io" }).expect(400);
  });
});

describe("token verification (GET /api/auth/dashboard)", () => {
  const get = (authorization) => {
    const r = http().get("/api/auth/dashboard");
    return authorization ? r.set("Authorization", authorization) : r;
  };
  const sign = (payload, options = {}, secret = process.env.JWT_SECRET) => jwt.sign(payload, secret, options);

  it("accepts a valid token", async () => {
    const user = await makeUser();
    await http().get("/api/auth/dashboard").set(user.auth).expect(200);
  });

  it.each([
    ["no header", () => undefined],
    ["wrong scheme", () => "Basic abc"],
    ["garbage token", () => "Bearer not.a.jwt"],
    ["signed with another secret", () => `Bearer ${sign({ id: 1 }, {}, "other-secret")}`],
    ["signed with a different algorithm", () => `Bearer ${sign({ id: 1 }, { algorithm: "HS512" })}`],
    ["payload without an id", () => `Bearer ${sign({ email: "x@test.io" })}`],
  ])("returns 401 for %s", async (_label, header) => {
    await get(header()).expect(401);
  });

  it("returns 401 'Token expired' for an expired token", async () => {
    const res = await get(`Bearer ${sign({ id: 1 }, { expiresIn: -10 })}`).expect(401);
    expect(res.body.error).toBe("Token expired");
  });
});
