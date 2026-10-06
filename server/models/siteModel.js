import db from "../db.js";
import { siteType } from "../domain/sites.js";

// Whitelisted ORDER BY fragments; user input never reaches the SQL text.
const ORDER = {
  time: "seconds DESC, domain",
  visits: "visits DESC, domain",
  name: "domain",
};

/**
 * Every site the user has visited in the last `days` days (today included, in the user's time zone)
 * plus every site they have marked, even if it has no visits in the window.
 */
export async function listSites(userId, { days, tz, filter, q, sort, limit, offset }) {
  const likeTerm = q.replace(/[\\%_]/g, "\\$&"); // search text is literal, not a pattern
  const result = await db.query(
    `WITH win AS (
       SELECT ((date_trunc('day', NOW() AT TIME ZONE $2::text) - ($3::int - 1) * INTERVAL '1 day') AT TIME ZONE $2::text) AS s
     ),
     usage AS (
       SELECT domain, SUM(duration) AS seconds, COUNT(*) AS visits, MAX(started_at) AS last_seen
       FROM tab_activity, win
       WHERE user_id = $1 AND started_at >= win.s
       GROUP BY domain
     ),
     merged AS (
       SELECT COALESCE(u.domain, m.domain) AS domain,
              (m.domain IS NOT NULL) AS marked,
              COALESCE(u.seconds, 0) AS seconds,
              COALESCE(u.visits, 0) AS visits,
              u.last_seen
       FROM usage u
       FULL OUTER JOIN (SELECT domain FROM distraction_sites WHERE user_id = $1) m ON m.domain = u.domain
     )
     SELECT *, COUNT(*) OVER () AS total
     FROM merged
     WHERE ($4::text = 'all' OR ($4::text = 'distractions' AND marked) OR ($4::text = 'unmarked' AND NOT marked))
       AND ($5::text = '' OR domain ILIKE '%' || $5::text || '%' ESCAPE '\\')
     ORDER BY ${ORDER[sort]}
     LIMIT $6 OFFSET $7`,
    [userId, tz, days, filter, likeTerm, limit, offset]
  );

  const sites = result.rows.map((row) => {
    const visits = Number(row.visits);
    const seconds = Number(row.seconds);
    return {
      domain: row.domain,
      marked: row.marked,
      seconds,
      visits,
      avgSeconds: visits ? seconds / visits : 0,
      lastSeen: row.last_seen ? row.last_seen.toISOString() : null,
      type: siteType(visits, seconds),
    };
  });
  return { days, total: result.rows.length ? Number(result.rows[0].total) : 0, sites };
}

/** Marks or unmarks a site as a distraction. Idempotent. */
export async function setMarked(userId, domain, marked) {
  if (marked) {
    await db.query(
      "INSERT INTO distraction_sites (user_id, domain) VALUES ($1, $2) ON CONFLICT (user_id, domain) DO NOTHING",
      [userId, domain]
    );
  } else {
    await db.query("DELETE FROM distraction_sites WHERE user_id = $1 AND domain = $2", [userId, domain]);
  }
}
