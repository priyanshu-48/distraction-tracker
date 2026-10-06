# Day summary benchmark

How long the whole Day view takes to compute on the server: everything behind `GET /api/summary`
(six queries run in parallel plus the calculations in `server/domain/daySummary.js`).

## Result

| Rows in `tab_activity` | Visits on the day | p50 | p95 | max |
|---:|---:|---:|---:|---:|
| 1,000,000 (5 users) | 2,206 | **47.8 ms** | 64.2 ms | 89.4 ms |

30 timed runs after 3 warm-up runs, heaviest user, a full day 10 days back, time zone `Asia/Kolkata`.
This is wall time from the Node process (query round trips and driver included), not just database
execution time. The same screen used to need six separate requests.

Per query (p50, run alone): visits 11 ms, last 7 days 37 ms, "usual" 34 ms, triggers 35 ms.

An earlier version of this page said 24.5 ms. The summary then did less: it computed an hourly strip and a
single comparison day. It now also returns the last seven days, a four-week "usual" with a per-site
baseline, and the timeline, and every query groups sites with `site_key()` (below).

## What it does per request

- One query for the day's visits (about 2,200 rows here) joined to the user's marked sites; totals, top
  sites, the "to classify" list, recent visits, longest focus stretch, time to first distraction and the
  timeline are calculated from those rows in memory.
- One query for the last 7 local days (zero-filled), for the bars.
- One query for "usual": per-day, per-site totals for the same weekday in each of the previous four weeks.
- One window-function query over the last 7 days for triggers (the site you were on just before a distraction).
- One query for the day's sessions, one for the budget.
- All use the `(user_id, started_at)` index through half-open time ranges (see `analytics-1m-rows.md`).

## Grouping sites (`site_key()`, migration 007)

`m.youtube.com`, `youtu.be` and `youtube.com` are one site. The grouping is a SQL function, so every query
reads it the same way and nothing stored is rewritten. Two things mattered for speed:

- **A SQL function with a subquery is not inlined by Postgres.** The first version cost about 10 microseconds
  per call, which turned the triggers query (two calls per visit over a week) from about 20 ms into 318 ms.
  Written as a single expression with no `FROM` it is inlined and the cost disappears (35 ms).
- **A regex per row was slow on big scans.** The sites list (90 days, about 200,000 rows) went from 44 ms to
  190 ms. Plain `LIKE` tests, and grouping by raw domain first and then by key (so the function runs once per
  domain, not once per visit), bring it back to 48 ms (7 days: 7.9 ms).

## Reproduce

```
cd server
npm run migrate
node scripts/seed.js --confirm=<scratch db> --rows 1000000 --users 5 --days 90
node scripts/bench/summary.js --runs 30 --tz Asia/Kolkata
```

## Caveats

- One machine, synthetic data, warm cache, one concurrent client, local database (no network latency).
- The seeded user's visits are spread evenly over 90 days (about 2,400 a day, heavier than a real day);
  a quiet day is faster.
- The in-memory calculations scale with the number of visits in the day. A day with tens of thousands of
  visits would be slower; that is not a realistic single-user day, but it is the ceiling of this design.
