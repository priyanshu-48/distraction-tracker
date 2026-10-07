# Analytics query benchmark: 1M rows

> **Update 2026-10-08:** a re-run on PostgreSQL 17 in Docker gave about 33x, not the 206x below. See [Re-measured](#re-measured-on-2026-10-08-read-this-before-quoting-a-number) at the end.

Server-side execution time of the dashboard's seven analytics queries, before and after the
index + query rewrite.

## Setup

- PostgreSQL 17.5, local, default config, Windows laptop. Node/network overhead excluded:
  times are `EXPLAIN (ANALYZE, BUFFERS)` *Execution Time*.
- Synthetic data from `server/scripts/seed.js`: 1,000,000 `tab_activity` rows (237 MB with
  indexes), 5 users x 200k rows, spread uniformly over 90 days, 20 domains with a skewed
  distribution. Queries run for the heaviest user.
- 15 timed runs per query after 3 warm-up runs; p50 and p95 reported. Everything is in the
  buffer cache, so these are CPU-bound numbers; cold-cache disk reads would widen the gap.
- Reproduce: `npm run migrate`, `node scripts/seed.js --confirm=<db> --rows 1000000`,
  then `node scripts/bench/analytics.js legacy|new --runs 15`. The old queries are kept in
  `server/scripts/bench/legacy.js` for this purpose.

Three states were measured:

| State | Indexes | Queries |
|---|---|---|
| A: original app | none | `started_at::date = CURRENT_DATE`, `DATE(started_at) = day` joins |
| B: index only | `(user_id, started_at)` | same as A |
| C: this change | `(user_id, started_at)` | range predicates in the user's timezone |

## Results (p50 ms, lower is better)

| Query | A: original | B: + index | C: + rewrite | A -> C |
|---|---:|---:|---:|---:|
| timeSpentToday | 50.96 | 32.09 | 0.59 | 86x |
| mostVisitedToday | 50.64 | 32.47 | 0.57 | 89x |
| totalSwitchesToday | 64.93 | 31.82 | 0.36 | 180x |
| todayCount (stat block) | 124.21 | 83.25 | 0.95 | 131x |
| todaySession | 0.09 | 0.04 | 0.02 | n/a (tiny table) |
| timeSpentDaily (weekly) | 439.58 | 361.95 | 1.65 | 266x |
| tabSwitchesDaily (weekly) | 445.12 | 354.27 | 1.56 | 285x |
| **Dashboard total** | **1175.52** | **895.90** | **5.70** | **206x** |

p95 follows the same pattern (A: up to 474 ms, C: at most 2.07 ms). Full tables are in the
run output reproduced by the commands above.

## Why

- **The index alone barely helps (A -> B, 1.3x).** Wrapping the column in a function
  (`started_at::date`, `DATE(started_at)`) makes the predicate non-sargable, so Postgres can
  only use the index to find the user's 200k rows, then filters them one by one
  (`Rows Removed by Filter: 66165` per worker, plan below).
- **Range predicates fix it (B -> C, 157x).** `started_at >= <local midnight> AND < <next>`
  turns the filter into an index condition, so only today's ~1.5k rows are read
  (`Index Scan ... Index Cond: (user_id = 1 AND started_at >= ... AND started_at < ...)`,
  1,513 buffers instead of 16,027).
- **Weekly charts:** the old query joined `generate_series` days to the whole table with
  `DATE(started_at) = day`; the new one range-scans the week once, groups by local day, and
  joins the 7 results.
- **Stat block:** the old query scanned today's rows twice (once for totals, once for the
  top domain); the new one scans once and reuses the result.

## Plans: `timeSpentToday`

A: original (no index): `Parallel Seq Scan` over the whole table, 128 ms, 16,027 buffers.

```
Parallel Seq Scan on tab_activity  (actual time=0.010..26.484 rows=502 loops=3)
  Filter: ((user_id = 1) AND ((started_at)::date = CURRENT_DATE))
  Rows Removed by Filter: 332831
Execution Time: 128.039 ms
```

B: index added, same query: still filters row by row.

```
Parallel Bitmap Heap Scan on tab_activity
  Recheck Cond: (user_id = 1)
  Filter: ((started_at)::date = CURRENT_DATE)
  Rows Removed by Filter: 66165
-> Bitmap Index Scan on idx_tab_activity_user_started  (rows=200000)
Execution Time: 31.653 ms
```

C: rewritten query: index range scan.

```
Index Scan using idx_tab_activity_user_started on tab_activity  (actual rows=1506)
  Index Cond: ((user_id = 1) AND (started_at >= ...) AND (started_at < ...))
Execution Time: 0.560 ms
```

## Caveats (be upfront about these)

- One machine, synthetic uniform data, warm cache, one concurrent client. It shows the
  *shape* of the improvement (full scan to range scan), not production latency.
- State A's p95 is noisy (parallel workers start-up); compare p50.
- The new queries also change behavior on purpose: "today" and "this week" now follow the
  user's timezone (sent by the client as `?tz=`) instead of the database server's timezone.
- The single-user, 200k-row case is the interesting one; with 5 users and 1M total rows the
  legacy cost grows linearly with *total* table size, the new cost with the rows in the window.

## Re-measured on 2026-10-08 (read this before quoting a number)

The same scripts (`scripts/bench/analytics.js`, unchanged since this page was written) were run again on 1,000,000
seeded rows (5 users, 90 days, `scripts/seed.js`), heaviest user, 15 timed runs after 3 warm-ups, **PostgreSQL 17.11 in
Docker** (20 CPUs, 7.6 GiB visible to Docker) on an i7-12700H laptop. Environment: `docs/evidence/ENVIRONMENT.md`.
Reproduce: `docs/evidence/run-analytics-states.sh`. Raw timings and every `EXPLAIN (ANALYZE, BUFFERS)` plan:
`docs/evidence/raw/analytics-{A,B,C,D}-*.txt`.

| Query (p50 ms) | A: original, no index | B: + index only | D: rewrite only, no index | C: index + rewrite (today's code) |
|---|---:|---:|---:|---:|
| timeSpentToday | 31.17 | 24.13 | 47.00 | 0.09 |
| mostVisitedToday | 31.84 | 24.00 | 47.42 | 0.08 |
| totalSwitchesToday | 31.02 | 12.87 | 46.36 | 0.03 |
| todayCount (stat block) | 61.14 | 46.37 | 45.17 | 0.12 |
| todaySession | 0.06 | 0.06 | 0.02 | 0.02 |
| timeSpentDaily (weekly) | 119.44 | 118.99 | 68.11 | 5.75 |
| tabSwitchesDaily (weekly) | 121.44 | 114.70 | 68.05 | 5.86 |
| **Sum of p50** | **396.12** | **341.12** | **322.12** | **11.95** |
| Speedup against A | 1x | 1.16x | 1.23x | **33x** |

What this says:

- **The 206x figure above does not reproduce here.** The ratio is about **33x** (396 ms to 12 ms). Both ends moved: the
  "before" is about 3x faster than the table above (396 vs 1,176 ms) and the "after" about 2x slower (11.95 vs 5.70 ms).
  The queries, scripts and seed script are unchanged (git history), so the difference is the environment (this page used a
  local Windows PostgreSQL 17.5) or noise in the earlier run. This was not investigated further.
- **Neither change works alone.** The index alone gives 1.16x and the rewrite alone 1.23x. Together they give 33x: the
  `started_at::date = ...` predicates cannot use the index, and the range predicates are only fast because of it.
  Buffers touched by `timeSpentToday`: A 14,973 hit + 1,054 read, B 3,976, D 4,493, C 101.
- State A here still has the unique index on `(user_id, client_event_id)` (migration 003), which the planner did not use.
- The rewritten queries also change behaviour on purpose (the user's time zone instead of the server's), so this is
  not a pure like-for-like rewrite.
- Synthetic data, one laptop, one concurrent client, warm cache. It shows the shape of the improvement, not production latency.
