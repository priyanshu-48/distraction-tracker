// Times the whole Week and Month summary (every query behind GET /api/range) against the current database.
//   node scripts/bench/range.js [--runs 20] [--tz Asia/Kolkata]
// Marks the heaviest user's five busiest sites as distractions first, so every part of the summary has work to do.
import db from "../../db.js";
import { addDays, todayIn } from "../../domain/dates.js";
import { getRangeSummary } from "../../models/rangeModel.js";

const flag = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const runs = parseInt(flag("runs", "20"));
const tz = flag("tz", "Asia/Kolkata");

const { user_id: userId } = (await db.query("SELECT user_id FROM tab_activity GROUP BY user_id ORDER BY COUNT(*) DESC LIMIT 1")).rows[0];
const top = await db.query("SELECT domain FROM tab_activity WHERE user_id = $1 GROUP BY domain ORDER BY SUM(duration) DESC LIMIT 5", [userId]);
for (const { domain } of top.rows) {
  await db.query("INSERT INTO distraction_sites (user_id, domain) VALUES ($1, $2) ON CONFLICT DO NOTHING", [userId, domain]);
}
const total = (await db.query("SELECT COUNT(*) FROM tab_activity")).rows[0].count;
const today = todayIn(tz);

async function time(label, view, date) {
  const times = [];
  let last;
  for (let i = 0; i < runs + 3; i++) {
    const start = performance.now();
    last = await getRangeSummary(userId, view, date, tz);
    if (i >= 3) times.push(performance.now() - start); // first 3 runs warm the cache
  }
  times.sort((a, b) => a - b);
  const pick = (q) => times[Math.min(times.length - 1, Math.floor(times.length * q))];
  console.log(
    `${label.padEnd(28)} ${String(last.totals.visits).padStart(6)} distraction visits  p50 ${pick(0.5).toFixed(1)} ms, p95 ${pick(0.95).toFixed(1)} ms, max ${times[times.length - 1].toFixed(1)} ms`
  );
}

console.log(`rows=${total} user=${userId} tz=${tz} runs=${runs}`);
await time("week, 10 days back", "week", addDays(today, -10));
await time("week, current", "week", today);
await time("month, 35 days back", "month", addDays(today, -35));
await time("month, current", "month", today);
await db.end();
