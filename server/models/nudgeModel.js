import db from "../db.js";
import { dayEnd, dayStart } from "./timeSql.js";

// Nudges (decisions.md, D-48). All the SQL for them lives here; the rules are in domain/nudges.js.

/** Two numbers choose one advisory lock: this namespace, then the user. */
const LOCK_NAMESPACE = 48;

/** Is `site` one the user marked as a distraction? `site_key` makes youtu.be and m.youtube.com match youtube.com. */
export async function isMarkedSite(userId, site) {
  const { rows } = await db.query("SELECT 1 FROM distraction_sites WHERE user_id = $1 AND domain = site_key($2) LIMIT 1", [userId, site]);
  return rows.length > 0;
}

/** How many visits to `site` started after `since` (only visits that have already reached the server). */
export async function countRecentOpens(userId, site, since) {
  const { rows } = await db.query(
    "SELECT COUNT(*)::int AS n FROM tab_activity WHERE user_id = $1 AND started_at > $3 AND site_key(domain) = site_key($2)",
    [userId, site, since]
  );
  return rows[0].n;
}

/**
 * Runs `work(client)` in a transaction that holds this user's nudge lock, so two requests at once (two windows) cannot both
 * pass the cooldown. The lock is released at COMMIT or ROLLBACK.
 */
export async function withNudgeLock(userId, work) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1, $2)", [LOCK_NAMESPACE, userId]);
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/** Was a nudge already decided for this visit? (A retried request must not decide twice.) */
export async function nudgeExists(client, userId, visit) {
  const { rows } = await client.query("SELECT 1 FROM nudges WHERE user_id = $1 AND client_event_id = $2", [userId, visit]);
  return rows.length > 0;
}

/** When was this site last nudged about, shown or held out? Null if never. */
export async function lastNudgeAt(client, userId, site) {
  const { rows } = await client.query("SELECT MAX(created_at) AS at FROM nudges WHERE user_id = $1 AND site = site_key($2)", [userId, site]);
  return rows[0].at;
}

export async function insertNudge(client, userId, { visit, site, kind, shown }) {
  await client.query(
    `INSERT INTO nudges (user_id, client_event_id, site, kind, shown) VALUES ($1, $2, site_key($3), $4, $5)
     ON CONFLICT (user_id, client_event_id) DO NOTHING`,
    [userId, visit, site, kind, shown]
  );
}

/**
 * The nudges decided between two local dates (inclusive), each with the length of the visit it was decided for. The visit
 * is joined on its id; `duration` is null when it has not reached the server.
 */
export async function nudgeRowsForDays(userId, fromDate, toDate, tz) {
  const { rows } = await db.query(
    `SELECT n.shown, a.duration
     FROM nudges n
     LEFT JOIN tab_activity a ON a.user_id = n.user_id AND a.client_event_id = n.client_event_id
     WHERE n.user_id = $1 AND n.created_at >= ${dayStart("$2", "$4")} AND n.created_at < ${dayEnd("$3", "$4")}`,
    [userId, fromDate, toDate, tz]
  );
  return rows;
}

/** The user's own nudge records, for their data export. */
export async function listNudges(userId) {
  const { rows } = await db.query("SELECT site, kind, shown, created_at FROM nudges WHERE user_id = $1 ORDER BY id", [userId]);
  return rows.map((row) => ({ site: row.site, kind: row.kind, shown: row.shown, createdAt: row.created_at.toISOString() }));
}
