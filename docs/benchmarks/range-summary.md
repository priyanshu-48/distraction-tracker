# Week and Month summary benchmark

How long the whole Week or Month view takes to compute on the server: everything behind `GET /api/range`
(five queries run in parallel plus the calculations in `server/domain/rangeSummary.js`).

## Result

1,000,000 rows in `tab_activity` (5 users, 90 days), heaviest user (about 2,200 visits a day), five busiest
sites marked as distractions, time zone `Asia/Kolkata`. 20 timed runs after 3 warm-up runs. Wall time from the
Node process (query round trips and driver included).

| View | Distraction visits in it | p50 | p95 |
|---|---:|---:|---:|
| Week, 10 days back | 7,673 | **54 to 64 ms** | 77 to 141 ms |
| Week, current | 2,224 | **44 to 54 ms** | 48 to 77 ms |
| Month, current | 6,692 | **86 to 106 ms** | 148 ms |
| Month, 35 days back | 33,332 | **208 to 212 ms** | 234 to 252 ms |

The ranges are two runs on a laptop with other work going on, so treat them as an order of magnitude. The user
is deliberately extreme: a real person has a few hundred visits a day, so real numbers should be well below these.
An old month is the slowest case because it reads two months of visits (the month and the one before it, for the
comparison) plus the weekday-by-hour heatmap.

## What it does per request

- **Daily totals** for the period and the previous one, and for the last 30 days (for streaks). One query when
  those ranges touch (a current week or month), two small ones when they do not (an old month).
- **Sites**: distraction sites with their time in this period and in the previous one, in one query.
- **Heatmap**: distraction seconds by weekday and hour, splitting a visit across the hours it spans.
- **First distraction per session**: how long after each session started the first distraction came.
- The comparison is like for like: a week or month in progress is compared with the same number of days of
  the previous one, and a finished month with the whole previous month (which can be shorter).

## What the benchmark changed

The first version took 103 to 272 ms for a week or a month. Three changes, found by timing each query alone:

1. **First distraction per session, 72 ms to 1.5 ms (a month).** The first version read every distraction visit
   of the period (34,000 rows) and worked out the first one per session in JavaScript. A `LATERAL ... ORDER BY
   started_at LIMIT 1` lookup per session stops at the first marked visit, so it reads 93 rows.
2. **Streak lookback from 90 days to 30 days (111 ms to under 40 ms).** A streak only needs recent days; the
   first version scanned 90 days of visits on every request. "Longest streak" now means the longest in the
   last 30 days.
3. **The daily totals query was 2.5 times slower than it needed to be, because of the planner.** Adding a
   `COUNT(*)` next to the `SUM` made Postgres choose a sort that spilled to disk (`Sort Method: external merge
   Disk: 2424kB`) instead of a hash aggregate. It expects tens of thousands of groups when the real number is
   a few hundred (it cannot estimate a grouped expression). Running that one query in a transaction with
   `SET LOCAL work_mem = '32MB'` lets it hash in memory: 90 ms to 40 ms for 30 days. The setting is local to the
   transaction, so nothing else is affected.

Tried and rejected: splitting the heatmap into "whole-hour" and "crossing-an-hour-boundary" visits to avoid
`generate_series` was slower (95 ms against 74 ms).

## Reproduce

```
cd server
npm run migrate
node scripts/seed.js --confirm=$DB_NAME --rows 1000000 --users 5 --days 90
node scripts/bench/range.js
```

(`DB_NAME` must be a scratch database; the seed script refuses to run unless `--confirm` repeats its name.)
