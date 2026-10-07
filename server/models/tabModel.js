import db from "../db.js";

/**
 * A visit may start this long before its session did and still count (the extension and the server read their own
 * clocks, and the extension starts recording a moment after the server opens the session).
 */
const START_GRACE_SECONDS = 5;

/**
 * Stores finished intervals, keeping only time that falls inside one of the user's tracking sessions: the server,
 * not the extension, decides what counts as tracked time (decisions.md, D-23).
 *
 * - A visit that started when no session was running is rejected (the extension had not yet noticed Stop).
 * - A visit that runs past the end of its session is cut at the session's end; one that started a few seconds
 *   before the session is cut at its start. A session still running cuts nothing.
 * - Rows whose (user_id, client_event_id) already exist are skipped, so a retried upload is harmless.
 *
 * Returns how many rows were newly stored, how many visits were rejected, and how many were cut.
 */
export async function insertIntervals(userId, intervals) {
  const col = (key) => intervals.map((i) => i[key]);
  const result = await db.query(
    `WITH incoming AS (
       SELECT v.id, v.url, v.domain, v.title, v.started_at, v.ended_at
       FROM unnest($2::uuid[], $3::text[], $4::text[], $5::text[], $6::timestamptz[], $7::timestamptz[])
            AS v(id, url, domain, title, started_at, ended_at)
     ),
     -- the latest session that began at or before the visit (sessions never overlap, so it is the only one that can
     -- contain it); a visit that began after that session ended is left with nothing inside it and is dropped below
     placed AS (
       SELECT i.*, s.start_time AS session_start, s.end_time AS session_end
       FROM incoming i
       LEFT JOIN LATERAL (
         SELECT t.start_time, t.end_time
         FROM tracking_sessions t
         WHERE t.user_id = $1
           AND t.start_time <= i.started_at + make_interval(secs => $8)
         ORDER BY t.start_time DESC
         LIMIT 1
       ) s ON TRUE
     ),
     cut AS (
       SELECT p.*,
              GREATEST(p.started_at, p.session_start) AS s2,
              LEAST(p.ended_at, COALESCE(p.session_end, p.ended_at)) AS e2
       FROM placed p
     ),
     usable AS (
       SELECT * FROM cut WHERE session_start IS NOT NULL AND e2 > s2
     ),
     stored AS (
       INSERT INTO tab_activity (user_id, client_event_id, url, domain, title, started_at, ended_at, duration)
       SELECT $1, id, url, domain, title, s2, e2, EXTRACT(EPOCH FROM (e2 - s2)) FROM usable
       ON CONFLICT (user_id, client_event_id) DO NOTHING
       RETURNING 1
     )
     SELECT (SELECT COUNT(*) FROM stored) AS stored,
            (SELECT COUNT(*) FROM cut) - (SELECT COUNT(*) FROM usable) AS rejected,
            (SELECT COUNT(*) FROM usable WHERE s2 > started_at OR e2 < ended_at) AS clamped`,
    [userId, col("clientEventId"), col("url"), col("domain"), col("title"), col("startedAt"), col("endedAt"), START_GRACE_SECONDS]
  );
  const row = result.rows[0];
  return { stored: Number(row.stored), rejected: Number(row.rejected), clamped: Number(row.clamped) };
}
