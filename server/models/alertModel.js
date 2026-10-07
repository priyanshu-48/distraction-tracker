import db from "../db.js";
import { dayEnd, dayStart } from "./timeSql.js";

/** How long an alert stays worth showing as a pop-up. An old one is history, not news. */
const FRESH_HOURS = 6;
/** The most pop-ups one poll hands the extension, so a backlog never becomes a burst. */
const MAX_PER_POLL = 3;

/**
 * Today's time on sites the user marked as distractions, biggest first. `date` is the user's own calendar day in `tz`.
 * Only today is read, with a range on the (user_id, started_at) index, so this stays cheap on a long history.
 */
export async function distractionSitesForDay(userId, date, tz) {
  const { rows } = await db.query(
    `SELECT site_key(a.domain) AS domain, SUM(a.duration) AS seconds
     FROM tab_activity a
     JOIN distraction_sites m ON m.user_id = a.user_id AND m.domain = site_key(a.domain)
     WHERE a.user_id = $1 AND a.ended_at IS NOT NULL
       AND a.started_at >= ${dayStart("$2", "$3")} AND a.started_at < ${dayEnd("$2", "$3")}
     GROUP BY 1
     ORDER BY seconds DESC, domain`,
    [userId, date, tz]
  );
  return rows.map((row) => ({ domain: row.domain, seconds: Number(row.seconds) }));
}

/**
 * Records an alert unless one with the same key already exists. Returns its id, or null when it was already raised, so
 * the caller knows whether this call is the one that should send it.
 */
export async function insertAlert(userId, { dedupeKey, kind, title, body = "" }) {
  const { rows } = await db.query(
    `INSERT INTO alerts (user_id, dedupe_key, kind, title, body) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, dedupe_key) DO NOTHING
     RETURNING id`,
    [userId, dedupeKey, kind, title, body]
  );
  return rows[0] ? Number(rows[0].id) : null;
}

/** Hands out the user's fresh, not yet shown alerts and marks them shown in the same statement, so each is shown once. */
export async function takeUndeliveredAlerts(userId) {
  const { rows } = await db.query(
    `UPDATE alerts SET delivered_at = NOW()
     WHERE id IN (
       SELECT id FROM alerts
       WHERE user_id = $1 AND delivered_at IS NULL AND created_at > NOW() - make_interval(hours => $2)
       ORDER BY id LIMIT $3
     )
     RETURNING id, kind, title, body`,
    [userId, FRESH_HOURS, MAX_PER_POLL]
  );
  return rows.map((row) => ({ id: Number(row.id), kind: row.kind, title: row.title, body: row.body })).sort((a, b) => a.id - b.id);
}

/** Every alert raised for the user, oldest first, for the data export. */
export async function listAlerts(userId) {
  const { rows } = await db.query("SELECT kind, title, body, created_at FROM alerts WHERE user_id = $1 ORDER BY id", [userId]);
  return rows.map((row) => ({ kind: row.kind, title: row.title, body: row.body, createdAt: row.created_at.toISOString() }));
}

/** Marks the user's waiting alerts as shown without showing them: used when they switch notifications off. */
export async function dismissPendingAlerts(userId) {
  await db.query("UPDATE alerts SET delivered_at = NOW() WHERE user_id = $1 AND delivered_at IS NULL", [userId]);
}

/** Has this alert already been raised? A single indexed lookup, so a schedule can ask before doing any real work. */
export async function alertExists(userId, dedupeKey) {
  const { rowCount } = await db.query("SELECT 1 FROM alerts WHERE user_id = $1 AND dedupe_key = $2", [userId, dedupeKey]);
  return rowCount > 0;
}
