// Times the real HTTP requests behind the dashboard screens, against the current database.
//   node scripts/bench/requests.js [--runs 30] [--tz Asia/Kolkata]
// Starts the Express app on a free port, signs in as the heaviest seeded user (demo password from seed.js) and measures
//   Day view: the single GET /api/summary;
//   Week and Month: GET /api/range.
// (The six-request comparison with the original dashboard was measured once, on 2026-10-08, while the old /api/analytics
// endpoints still existed; see docs/RESUME_EVIDENCE.md. Those endpoints have since been removed.)
// Wall time from this process to the full response body (localhost, so network time is close to zero). It is server
// time, not what a user sees in a browser.
import db from "../../db.js";
import app from "../../app.js";
import { addDays, todayIn } from "../../domain/dates.js";

const flag = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const runs = parseInt(flag("runs", "30"));
const tz = flag("tz", "Asia/Kolkata");
const WARMUP = 3;

const { user_id: userId } = (await db.query("SELECT user_id FROM tab_activity GROUP BY user_id ORDER BY COUNT(*) DESC LIMIT 1")).rows[0];
const { email } = (await db.query("SELECT email FROM users WHERE id = $1", [userId])).rows[0];
const total = (await db.query("SELECT COUNT(*) FROM tab_activity")).rows[0].count;

const server = app.listen(0);
const base = `http://localhost:${server.address().port}/api`;
const login = await fetch(`${base}/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password: "demo-password" }),
});
if (!login.ok) throw new Error(`login failed (${login.status}); seed with scripts/seed.js first`);
const headers = { Authorization: `Bearer ${(await login.json()).token}` };

const get = async (path) => {
  const res = await fetch(`${base}${path}`, { headers });
  const body = await res.arrayBuffer();
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return body.byteLength;
};

const day = addDays(todayIn(tz), -10);
const NEW_DAY = `/summary?date=${day}&tz=${encodeURIComponent(tz)}`;
const WEEK = `/range?view=week&date=${day}&tz=${encodeURIComponent(tz)}`;
const MONTH = `/range?view=month&date=${day}&tz=${encodeURIComponent(tz)}`;

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
async function measure(label, fn) {
  const times = [];
  let bytes = 0;
  for (let i = 0; i < runs + WARMUP; i++) {
    const t0 = performance.now();
    bytes = await fn();
    if (i >= WARMUP) times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  return { label, p50: pct(times, 0.5), p95: pct(times, 0.95), max: times[times.length - 1], bytes };
}

const results = [];
results.push(await measure("Day: GET /summary", () => get(NEW_DAY)));
results.push(await measure("Week: GET /range", () => get(WEEK)));
results.push(await measure("Month: GET /range", () => get(MONTH)));

console.log(`rows=${total} user=${userId} runs=${runs} (+${WARMUP} warm-up) tz=${tz} day=${day}`);
console.log("| request | p50 ms | p95 ms | max ms | response bytes |\n|---|---:|---:|---:|---:|");
for (const r of results) console.log(`| ${r.label} | ${r.p50.toFixed(1)} | ${r.p95.toFixed(1)} | ${r.max.toFixed(1)} | ${r.bytes} |`);

server.close();
await db.end();
