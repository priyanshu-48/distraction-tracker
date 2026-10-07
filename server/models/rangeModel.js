import db from "../db.js";
import { addDays, todayIn } from "../domain/dates.js";
import { firstDistractionByDay, rangeWindows, summarizeRange } from "../domain/rangeSummary.js";
import { getDailyBudget } from "./settingsModel.js";
import { dayEnd, dayStart } from "./timeSql.js";

/** Streaks look back this many days (today included); a longer lookback would scan 90 days of visits on every request. */
export const STREAK_DAYS = 30;

// Everything the Week and Month views show, for one period. Each query looks at a bounded date range through the
// (user_id, started_at) index; sites are grouped with site_key() after the per-domain totals (see migration 007).

/**
 * Runs one query with a larger `work_mem`, for this transaction only. The per-day totals group tens of thousands of
 * rows into a few hundred groups, but Postgres cannot estimate that for a grouped expression, assumes the worst, and
 * sorts on disk (2.5 times slower) instead of hashing in memory. Raising the limit for the query lets it hash.
 */
async function queryWithWorkMem(sql, params) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL work_mem = '32MB'");
    const result = await client.query(sql, params);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/** Per local day from `from` to `to`: tracked time, distraction time and distraction visits. */
async function fetchDaily(userId, from, to, tz) {
  const { rows } = await queryWithWorkMem(
    `WITH raw AS (
       SELECT (a.started_at AT TIME ZONE $4::text)::date AS day, a.domain, SUM(a.duration) AS seconds, COUNT(*) AS visits
       FROM tab_activity a
       WHERE a.user_id = $1 AND a.ended_at IS NOT NULL
         AND a.started_at >= ${dayStart("$2", "$4")} AND a.started_at < ${dayEnd("$3", "$4")}
       GROUP BY 1, 2
     )
     SELECT r.day::text AS day,
            SUM(r.seconds) AS "trackedSeconds",
            COALESCE(SUM(r.seconds) FILTER (WHERE m.domain IS NOT NULL), 0) AS "distractedSeconds",
            COALESCE(SUM(r.visits) FILTER (WHERE m.domain IS NOT NULL), 0) AS visits
     FROM raw r
     LEFT JOIN distraction_sites m ON m.user_id = $1 AND m.domain = site_key(r.domain)
     GROUP BY r.day
     ORDER BY r.day`,
    [userId, from, to, tz]
  );
  return rows;
}

/** Per-day totals for any date range (used by the scheduled alerts). Same query as the Week and Month views use. */
export const getDailyTotals = fetchDaily;

/** Distraction sites with their totals in the current period and in the previous one. */
async function fetchSites(userId, current, previous, tz) {
  const { rows } = await db.query(
    `WITH raw AS (
       SELECT CASE WHEN a.started_at >= ${dayStart("$2", "$6")} THEN 'cur' ELSE 'prev' END AS period,
              a.domain, SUM(a.duration) AS seconds, COUNT(*) AS visits
       FROM tab_activity a
       WHERE a.user_id = $1 AND a.ended_at IS NOT NULL
         AND ((a.started_at >= ${dayStart("$2", "$6")} AND a.started_at < ${dayEnd("$3", "$6")})
           OR (a.started_at >= ${dayStart("$4", "$6")} AND a.started_at < ${dayEnd("$5", "$6")}))
       GROUP BY 1, 2
     )
     SELECT r.period, site_key(r.domain) AS domain, SUM(r.seconds) AS seconds, SUM(r.visits) AS visits
     FROM raw r
     JOIN distraction_sites m ON m.user_id = $1 AND m.domain = site_key(r.domain)
     GROUP BY 1, 2`,
    [userId, current.start, current.end, previous.start, previous.end, tz]
  );
  return rows;
}

/**
 * Distraction seconds by weekday and hour of the user's wall clock. A visit that crosses an hour boundary is split
 * between the hours it spans.
 */
async function fetchHeat(userId, from, to, tz) {
  const { rows } = await db.query(
    `SELECT EXTRACT(ISODOW FROM h)::int AS dow, EXTRACT(HOUR FROM h)::int AS hour,
            SUM(EXTRACT(EPOCH FROM LEAST(v.le, h + INTERVAL '1 hour') - GREATEST(v.ls, h))) AS seconds
     FROM (
       SELECT (a.started_at AT TIME ZONE $4::text) AS ls, (a.ended_at AT TIME ZONE $4::text) AS le
       FROM tab_activity a
       JOIN distraction_sites m ON m.user_id = a.user_id AND m.domain = site_key(a.domain)
       WHERE a.user_id = $1 AND a.ended_at IS NOT NULL
         AND a.started_at >= ${dayStart("$2", "$4")} AND a.started_at < ${dayEnd("$3", "$4")}
     ) v
     CROSS JOIN LATERAL generate_series(date_trunc('hour', v.ls), date_trunc('hour', v.le), INTERVAL '1 hour') AS h
     GROUP BY 1, 2`,
    [userId, from, to, tz]
  );
  return rows;
}

/**
 * For each session, how long after it started the first distraction came (null if none). The lateral lookup stops at
 * the first marked visit in the session, so it reads a handful of rows instead of every visit of the period.
 */
async function fetchFirstDistractions(userId, from, to, tz) {
  const { rows } = await db.query(
    `SELECT (s.start_time AT TIME ZONE $4::text)::date::text AS day,
            EXTRACT(EPOCH FROM (f.started_at - s.start_time)) AS seconds
     FROM tracking_sessions s
     LEFT JOIN LATERAL (
       SELECT a.started_at
       FROM tab_activity a
       JOIN distraction_sites m ON m.user_id = a.user_id AND m.domain = site_key(a.domain)
       WHERE a.user_id = s.user_id AND a.started_at >= s.start_time AND a.started_at < COALESCE(s.end_time, 'infinity')
       ORDER BY a.started_at
       LIMIT 1
     ) f ON TRUE
     WHERE s.user_id = $1 AND s.start_time >= ${dayStart("$2", "$4")} AND s.start_time < ${dayEnd("$3", "$4")}`,
    [userId, from, to, tz]
  );
  return firstDistractionByDay(rows);
}

/**
 * Per-day totals for the period and its previous one, and for the streak window. When those ranges touch they are
 * fetched together (a current week or month does), otherwise as two small queries (an old month does).
 */
async function fetchDailyRows(userId, wanted, streak, tz) {
  const overlap = streak.from <= wanted.to && wanted.from <= streak.to;
  const ranges = overlap
    ? [{ from: wanted.from < streak.from ? wanted.from : streak.from, to: wanted.to > streak.to ? wanted.to : streak.to }]
    : [wanted, streak];
  const results = await Promise.all(ranges.map((r) => fetchDaily(userId, r.from, r.to, tz)));
  return results.flat();
}

/** `view` is "week" or "month"; `date` is any day inside the period. `now` lets tests fix the clock. */
export async function getRangeSummary(userId, view, date, tz, now = new Date()) {
  const today = todayIn(tz, now);
  const { start, through, previous } = rangeWindows(view, date, today);
  // Streaks are as of today whatever period is shown, so they need the last STREAK_DAYS days as well.
  const streakFrom = addDays(today, -(STREAK_DAYS - 1));

  const [budgetSeconds, dailyRows, siteRows, heatRows, firstDistractions] = await Promise.all([
    getDailyBudget(userId),
    fetchDailyRows(userId, { from: previous.start, to: through }, { from: streakFrom, to: today }, tz),
    fetchSites(userId, { start, end: through }, previous, tz),
    fetchHeat(userId, start, through, tz),
    fetchFirstDistractions(userId, start, through, tz),
  ]);

  return {
    timeZone: tz,
    ...summarizeRange({ view, date, today, budgetSeconds, streakFrom, dailyRows, siteRows, heatRows, firstDistractions }),
  };
}
