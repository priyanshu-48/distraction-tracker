import db from "../db.js";
import { buildTimeline, summarizeDay, usualBaseline } from "../domain/daySummary.js";
import { addDays, timeOfDayIn, todayIn } from "../domain/dates.js";
import { getDailyBudget } from "./settingsModel.js";
import { dayEnd, dayStart } from "./timeSql.js";

/** How many earlier same-weekday days make up "your usual". */
const USUAL_WEEKS = 4;

/** The day's visits in start order, each flagged with whether its site is marked as a distraction. */
async function fetchVisits(userId, date, tz) {
  const { rows } = await db.query(
    `SELECT site_key(a.domain) AS domain, a.started_at, a.ended_at, a.duration, (m.domain IS NOT NULL) AS marked
     FROM tab_activity a
     LEFT JOIN distraction_sites m ON m.user_id = a.user_id AND m.domain = site_key(a.domain)
     WHERE a.user_id = $1
       AND a.started_at >= ${dayStart("$2", "$3")} AND a.started_at < ${dayEnd("$2", "$3")}
       AND a.ended_at IS NOT NULL
     ORDER BY a.started_at`,
    [userId, date, tz]
  );
  return rows;
}

async function fetchSessions(userId, date, tz) {
  const { rows } = await db.query(
    `SELECT start_time, end_time FROM tracking_sessions
     WHERE user_id = $1 AND start_time >= ${dayStart("$2", "$3")} AND start_time < ${dayEnd("$2", "$3")}
     ORDER BY start_time`,
    [userId, date, tz]
  );
  return rows;
}

/** The seven local days ending at `date`, oldest first, zero-filled, for the "last 7 days" bars. */
async function fetchRecentDays(userId, date, tz) {
  const { rows } = await db.query(
    `SELECT ($2::date - 6 + i)::text AS date,
            COALESCE(SUM(a.duration) FILTER (WHERE m.domain IS NOT NULL), 0) AS distracted,
            COALESCE(SUM(a.duration), 0) AS tracked
     FROM generate_series(0, 6) AS i
     LEFT JOIN tab_activity a
       ON a.user_id = $1 AND a.ended_at IS NOT NULL
      AND a.started_at >= ${dayStart("($2::date - 6)", "$3")} AND a.started_at < ${dayEnd("$2", "$3")}
      AND (a.started_at AT TIME ZONE $3::text)::date = $2::date - 6 + i
     LEFT JOIN distraction_sites m ON m.user_id = a.user_id AND m.domain = site_key(a.domain)
     GROUP BY i
     ORDER BY i`,
    [userId, date, tz]
  );
  return rows.map((row) => ({
    date: row.date,
    distractedSeconds: Math.round(Number(row.distracted)),
    trackedSeconds: Math.round(Number(row.tracked)),
  }));
}

/** Per-day, per-site totals for the same weekday in each of the previous four weeks. */
async function fetchUsualRows(userId, date, tz) {
  const days = Array.from({ length: USUAL_WEEKS }, (_, i) => addDays(date, -7 * (i + 1)));
  // Totals per raw domain first, then grouped, so site_key() runs once per domain and day, not once per visit.
  const { rows } = await db.query(
    `WITH raw AS (
       SELECT (a.started_at AT TIME ZONE $3::text)::date::text AS day, a.domain, SUM(a.duration) AS seconds
       FROM tab_activity a
       WHERE a.user_id = $1 AND a.ended_at IS NOT NULL
         AND a.started_at >= ${dayStart(`($2::date - ${7 * USUAL_WEEKS})`, "$3")} AND a.started_at < ${dayEnd("($2::date - 7)", "$3")}
         AND (a.started_at AT TIME ZONE $3::text)::date = ANY($4::date[])
       GROUP BY 1, 2
     )
     SELECT r.day, site_key(r.domain) AS domain, (m.domain IS NOT NULL) AS marked, SUM(r.seconds) AS seconds
     FROM raw r
     LEFT JOIN distraction_sites m ON m.user_id = $1 AND m.domain = site_key(r.domain)
     GROUP BY 1, 2, 3`,
    [userId, date, tz, days]
  );
  return rows;
}

/**
 * Distraction time that had built up by `timeOfDay` on each of the previous four same weekdays, added together
 * (a visit still going at that moment counts up to it). Divide by the number of those days for "usual by now".
 */
async function fetchPaceTotal(userId, date, tz, timeOfDay) {
  const days = Array.from({ length: USUAL_WEEKS }, (_, i) => addDays(date, -7 * (i + 1)));
  const { rows } = await db.query(
    `SELECT COALESCE(SUM(EXTRACT(EPOCH FROM LEAST(a.ended_at, c.cutoff) - a.started_at)), 0) AS seconds
     FROM unnest($3::date[]) AS d(day)
     CROSS JOIN LATERAL (SELECT ((d.day + $4::time)::timestamp AT TIME ZONE $2::text) AS cutoff) c
     JOIN tab_activity a
       ON a.user_id = $1 AND a.ended_at IS NOT NULL
      AND a.started_at >= ${dayStart("d.day", "$2")} AND a.started_at < c.cutoff
     JOIN distraction_sites m ON m.user_id = a.user_id AND m.domain = site_key(a.domain)`,
    [userId, tz, days, timeOfDay]
  );
  return Number(rows[0].seconds);
}

/**
 * What came right before a distraction: pairs "site you were on" -> "distraction site" over the 7 days up to
 * and including `date`, counting only cases where the previous visit was not itself a distraction and the
 * two were within 2 minutes of each other. The five most common pairs.
 */
async function fetchTriggers(userId, date, tz) {
  const { rows } = await db.query(
    `WITH visits AS (
       SELECT site_key(a.domain) AS domain, a.started_at,
              LAG(site_key(a.domain)) OVER w AS prev_domain,
              LAG(a.ended_at) OVER w AS prev_end
       FROM tab_activity a
       WHERE a.user_id = $1 AND a.ended_at IS NOT NULL
         AND a.started_at >= ${dayStart("($2::date - 6)", "$3")} AND a.started_at < ${dayEnd("$2", "$3")}
       WINDOW w AS (ORDER BY a.started_at)
     )
     SELECT v.prev_domain AS "from", v.domain AS "to", COUNT(*) AS count
     FROM visits v
     JOIN distraction_sites m ON m.user_id = $1 AND m.domain = v.domain
     LEFT JOIN distraction_sites pm ON pm.user_id = $1 AND pm.domain = v.prev_domain
     WHERE v.prev_domain IS NOT NULL
       AND v.prev_domain <> v.domain
       AND pm.domain IS NULL
       AND v.started_at - v.prev_end <= INTERVAL '2 minutes'
     GROUP BY v.prev_domain, v.domain
     ORDER BY count DESC, v.prev_domain, v.domain
     LIMIT 5`,
    [userId, date, tz]
  );
  return rows.map((row) => ({ from: row.from, to: row.to, count: Number(row.count) }));
}

/** Everything the Day view shows, for one local day, in one round trip from the client's point of view. */
export async function getDaySummary(userId, date, tz, now = new Date()) {
  // "Usual by now" only means something for a day that is still going.
  const inProgress = date === todayIn(tz, now);
  const [budgetSeconds, visits, sessions, recentDays, triggers, usualRows, paceTotal] = await Promise.all([
    getDailyBudget(userId),
    fetchVisits(userId, date, tz),
    fetchSessions(userId, date, tz),
    fetchRecentDays(userId, date, tz),
    fetchTriggers(userId, date, tz),
    fetchUsualRows(userId, date, tz),
    inProgress ? fetchPaceTotal(userId, date, tz, timeOfDayIn(tz, now)) : null,
  ]);

  const usual = usualBaseline(usualRows);
  const summary = summarizeDay(visits, sessions);

  return {
    date,
    timeZone: tz,
    budgetSeconds,
    ...summary,
    topSites: summary.topSites.map((site) => ({ ...site, usualSeconds: usual.siteSeconds(site.domain) })),
    timeline: buildTimeline(visits, sessions),
    recentDays,
    triggers,
    usual: {
      days: usual.days,
      distractedSeconds: usual.distractedSeconds,
      // distraction time usually built up by this time of day; null for a finished day or with no history
      paceSeconds: paceTotal !== null && usual.days ? Math.round(paceTotal / usual.days) : null,
    },
  };
}
