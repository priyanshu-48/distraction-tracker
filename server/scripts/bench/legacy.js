// The analytics queries as they were before the rewrite, kept only so the benchmark can
// reproduce the "before" numbers. Single param: user id.
const LAST_MONDAY = `WITH last_monday AS (
    SELECT CURRENT_DATE - ((EXTRACT(DOW FROM CURRENT_DATE)::int + 6) % 7) AS monday
  ),
  days AS (
    SELECT generate_series((SELECT monday FROM last_monday), (SELECT monday FROM last_monday) + INTERVAL '6 days', '1 day')::DATE AS day
  )`;

export const LEGACY = {
  timeSpentToday: `SELECT domain, SUM(duration) AS total_time FROM tab_activity
    WHERE started_at::date = CURRENT_DATE AND user_id=$1 GROUP BY domain ORDER BY total_time DESC LIMIT 5`,
  mostVisitedToday: `SELECT domain, COUNT(*) AS visit_count FROM tab_activity
    WHERE user_id = $1 AND started_at::date = CURRENT_DATE GROUP BY domain ORDER BY visit_count DESC LIMIT 5`,
  totalSwitchesToday: `SELECT COUNT(*) AS total_switches FROM tab_activity
    WHERE user_id = $1 AND started_at::date = CURRENT_DATE`,
  todayCount: `SELECT COUNT(*) AS count, SUM(duration) AS distraction_time,
    (SELECT domain FROM tab_activity WHERE user_id = $1 AND started_at::date = CURRENT_DATE
       GROUP BY domain ORDER BY COUNT(*) DESC LIMIT 1) AS most_visited_domain
    FROM tab_activity WHERE user_id = $1 AND started_at::date = CURRENT_DATE`,
  todaySession: `SELECT SUM(end_time - start_time) AS total_time FROM tracking_sessions
    WHERE user_id = $1 AND start_time::date = CURRENT_DATE AND end_time IS NOT NULL`,
  timeSpentDaily: `${LAST_MONDAY}
    SELECT TO_CHAR(days.day, 'Day') AS weekday, COALESCE(SUM(tab_activity.duration), 0)/60 AS time_spent
    FROM days LEFT JOIN tab_activity ON DATE(tab_activity.started_at) = days.day AND tab_activity.user_id = $1
    GROUP BY days.day ORDER BY days.day ASC`,
  tabSwitchesDaily: `${LAST_MONDAY}
    SELECT TO_CHAR(days.day, 'Day') AS weekday, COALESCE(COUNT(tab_activity.id), 0) AS tab_switches
    FROM days LEFT JOIN tab_activity ON DATE(tab_activity.started_at) = days.day AND tab_activity.user_id = $1
    GROUP BY days.day ORDER BY days.day ASC`,
};
