// Times each analytics query against the current database.
//   node scripts/bench/analytics.js legacy|new [--runs 30] [--explain timeSpentToday]
// Reports server-side execution time (EXPLAIN ANALYZE), which excludes network and driver overhead.
import db from "../../db.js";
import { SQL } from "./rewritten.js";
import { LEGACY } from "./legacy.js";

const mode = process.argv[2];
const flag = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : null;
};
const runs = parseInt(flag("runs")) || 30;
const explainName = flag("explain");
if (!["legacy", "new"].includes(mode)) throw new Error("usage: analytics.js legacy|new");

const TZ = "Asia/Kolkata";
const { week, ...rest } = SQL;
const queries =
  mode === "legacy"
    ? Object.entries(LEGACY).map(([name, sql]) => [name, sql, (u) => [u]])
    : Object.entries({ ...rest, timeSpentDaily: week, tabSwitchesDaily: week }).map(([name, sql]) => [name, sql, (u) => [u, TZ]]);

const userId = (await db.query("SELECT user_id FROM tab_activity GROUP BY user_id ORDER BY COUNT(*) DESC LIMIT 1")).rows[0].user_id;
const total = (await db.query("SELECT COUNT(*) FROM tab_activity")).rows[0].count;
const ms = (plan) => parseFloat(plan.match(/Execution Time: ([\d.]+) ms/)[1]);

const out = [];
for (const [name, sql, params] of queries) {
  const times = [];
  let plan = "";
  for (let i = 0; i < runs + 3; i++) {
    plan = (await db.query(`EXPLAIN (ANALYZE, BUFFERS) ${sql}`, params(userId))).rows.map((r) => r["QUERY PLAN"]).join("\n");
    if (i >= 3) times.push(ms(plan)); // first 3 runs warm the cache
  }
  times.sort((a, b) => a - b);
  out.push({ name, p50: times[Math.floor(times.length / 2)], p95: times[Math.floor(times.length * 0.95)] });
  if (name === explainName) console.log(`\n--- plan: ${name} ---\n${plan}\n`);
}
console.log(`mode=${mode} rows=${total} user=${userId} runs=${runs}`);
console.log("| query | p50 ms | p95 ms |\n|---|---:|---:|");
for (const r of out) console.log(`| ${r.name} | ${r.p50.toFixed(2)} | ${r.p95.toFixed(2)} |`);
console.log(`| **sum of p50** | **${out.reduce((s, r) => s + r.p50, 0).toFixed(2)}** | |`);
await db.end();
