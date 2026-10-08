// The analytics queries as they are after the rewrite (range predicates in the user's time zone on the
// (user_id, started_at) index), kept only so the benchmark can reproduce the "after" numbers. The endpoints that
// served them were removed; params: $1 user id, $2 IANA time zone name.
// "Today" and "this week" are computed in the user's timezone ($2) but compared
// against started_at as a plain range, so the (user_id, started_at) index is usable.
// ponytail: tz comes from the client; an unknown zone name makes Postgres error (500).
const TODAY = `today AS (
  SELECT (date_trunc('day', NOW() AT TIME ZONE $2::text) AT TIME ZONE $2::text) AS s,
         ((date_trunc('day', NOW() AT TIME ZONE $2::text) + INTERVAL '1 day') AT TIME ZONE $2::text) AS e
)`;

export const SQL = {
  timeSpentToday: `WITH ${TODAY}
    SELECT domain, SUM(duration) AS total_time
    FROM tab_activity, today
    WHERE user_id = $1 AND started_at >= today.s AND started_at < today.e
    GROUP BY domain ORDER BY total_time DESC LIMIT 5`,

  mostVisitedToday: `WITH ${TODAY}
    SELECT domain, COUNT(*) AS visit_count
    FROM tab_activity, today
    WHERE user_id = $1 AND started_at >= today.s AND started_at < today.e
    GROUP BY domain ORDER BY visit_count DESC LIMIT 5`,

  totalSwitchesToday: `WITH ${TODAY}
    SELECT COUNT(*) AS total_switches
    FROM tab_activity, today
    WHERE user_id = $1 AND started_at >= today.s AND started_at < today.e`,

  // One scan of today's rows feeds both the totals and the top domain.
  todayCount: `WITH ${TODAY},
    t AS (
      SELECT domain, duration FROM tab_activity, today
      WHERE user_id = $1 AND started_at >= today.s AND started_at < today.e
    )
    SELECT COUNT(*) AS count,
           SUM(duration) AS distraction_time,
           (SELECT domain FROM t GROUP BY domain ORDER BY COUNT(*) DESC LIMIT 1) AS most_visited_domain
    FROM t`,

  todaySession: `WITH ${TODAY}
    SELECT SUM(end_time - start_time) AS total_time
    FROM tracking_sessions, today
    WHERE user_id = $1 AND start_time >= today.s AND start_time < today.e AND end_time IS NOT NULL`,

  // Monday-to-Sunday of the current week; one range scan, grouped by local day.
  week: `WITH wk AS (SELECT date_trunc('week', NOW() AT TIME ZONE $2::text) AS mon),
    days AS (SELECT generate_series(mon, mon + INTERVAL '6 days', INTERVAL '1 day') AS day FROM wk),
    agg AS (
      SELECT date_trunc('day', started_at AT TIME ZONE $2::text) AS day,
             SUM(duration) AS secs, COUNT(*) AS n
      FROM tab_activity, wk
      WHERE user_id = $1
        AND started_at >= (wk.mon AT TIME ZONE $2::text)
        AND started_at < ((wk.mon + INTERVAL '7 days') AT TIME ZONE $2::text)
      GROUP BY 1
    )
    SELECT TO_CHAR(days.day, 'Day') AS weekday,
           COALESCE(agg.secs, 0) / 60 AS time_spent,
           COALESCE(agg.n, 0) AS tab_switches
    FROM days LEFT JOIN agg USING (day)
    ORDER BY days.day`,
};
