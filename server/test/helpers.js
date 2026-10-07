import request from "supertest";
import { randomUUID } from "node:crypto";
import app from "../app.js";
import db from "../db.js";

export const http = () => request(app);

let n = 0;

// Registers and logs in a fresh user through the real API.
export async function makeUser(label = "user") {
  const email = `${label}${++n}@test.io`;
  const password = "password123";
  await http().post("/api/auth/register").send({ email, password }).expect(201);
  const res = await http().post("/api/auth/login").send({ email, password }).expect(200);
  return { email, password, id: res.body.user.id, token: res.body.token, auth: { Authorization: `Bearer ${res.body.token}` } };
}

// A user with a tracking session that has been running for a long time (since 120 days ago), so any visit the test
// uploads falls inside it. The server only keeps time that lies inside a session (decisions.md, D-23).
export async function makeTrackingUser(label = "user") {
  const user = await makeUser(label);
  await db.query("INSERT INTO tracking_sessions (user_id, start_time) VALUES ($1, NOW() - INTERVAL '120 days')", [user.id]);
  return user;
}

// A valid finished interval that started `minsAgo` minutes ago and lasted `seconds`.
export function interval({ minsAgo = 10, seconds = 90, ...overrides } = {}) {
  const start = Date.now() - minsAgo * 60000;
  return {
    clientEventId: randomUUID(),
    url: "https://a.com/page",
    domain: "a.com",
    title: "Page",
    startedAt: new Date(start).toISOString(),
    endedAt: new Date(start + seconds * 1000).toISOString(),
    ...overrides,
  };
}
