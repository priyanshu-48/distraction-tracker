// Times the whole Day summary (every query behind GET /api/summary) against the current database.
//   node scripts/bench/summary.js [--runs 30] [--tz Asia/Kolkata]
// Marks the heaviest user's five busiest sites as distractions first, so every part of the summary has work to do.
import db from "../../db.js";
import { addDays, todayIn } from "../../domain/dates.js";
import { getDaySummary } from "../../models/summaryModel.js";

const flag = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const runs = parseInt(flag("runs", "30"));
const tz = flag("tz", "Asia/Kolkata");

const { user_id: userId } = (await db.query("SELECT user_id FROM tab_activity GROUP BY user_id ORDER BY COUNT(*) DESC LIMIT 1")).rows[0];
const top = await db.query("SELECT domain FROM tab_activity WHERE user_id = $1 GROUP BY domain ORDER BY SUM(duration) DESC LIMIT 5", [userId]);
for (const { domain } of top.rows) {
  await db.query("INSERT INTO distraction_sites (user_id, domain) VALUES ($1, $2) ON CONFLICT DO NOTHING", [userId, domain]);
}
const total = (await db.query("SELECT COUNT(*) FROM tab_activity")).rows[0].count;

// A day well inside the seeded range, so it is a typical full day and not a partial "today".
const date = addDays(todayIn(tz), -10);
const rowsThatDay = (
  await db.query(
    "SELECT COUNT(*) FROM tab_activity WHERE user_id = $1 AND started_at >= ($2::date::timestamp AT TIME ZONE $3::text) AND started_at < (($2::date + 1)::timestamp AT TIME ZONE $3::text)",
    [userId, date, tz]
  )
).rows[0].count;

const times = [];
for (let i = 0; i < runs + 3; i++) {
  const start = performance.now();
  await getDaySummary(userId, date, tz);
  if (i >= 3) times.push(performance.now() - start); // first 3 runs warm the cache
}
times.sort((a, b) => a - b);
const pick = (q) => times[Math.min(times.length - 1, Math.floor(times.length * q))];

console.log(`rows=${total} user=${userId} date=${date} tz=${tz} visits that day=${rowsThatDay} runs=${runs}`);
console.log(`day summary, wall time incl. driver: p50 ${pick(0.5).toFixed(1)} ms, p95 ${pick(0.95).toFixed(1)} ms, max ${times[times.length - 1].toFixed(1)} ms`);
await db.end();
