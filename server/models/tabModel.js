import db from "../db.js";

// Inserts finished intervals; rows whose (user_id, client_event_id) already exist are skipped,
// so a retried upload is harmless. Returns how many rows were newly stored.
export async function insertIntervals(userId, intervals) {
  const col = (key) => intervals.map((i) => i[key]);
  const result = await db.query(
    `INSERT INTO tab_activity (user_id, client_event_id, url, domain, title, started_at, ended_at, duration)
     SELECT $1, v.id, v.url, v.domain, v.title, v.started_at, v.ended_at,
            EXTRACT(EPOCH FROM (v.ended_at - v.started_at))
     FROM unnest($2::uuid[], $3::text[], $4::text[], $5::text[], $6::timestamptz[], $7::timestamptz[])
          AS v(id, url, domain, title, started_at, ended_at)
     ON CONFLICT (user_id, client_event_id) DO NOTHING`,
    [userId, col("clientEventId"), col("url"), col("domain"), col("title"), col("startedAt"), col("endedAt")]
  );
  return result.rowCount;
}
