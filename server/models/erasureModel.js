import db from "../db.js";

/** Erasure requests wait this long after a failed attempt before the next one. */
const RETRY_AFTER_MINUTES = 5;

/** Erasure requests not yet confirmed and not tried in the last few minutes, oldest first. */
export async function duePendingErasures(limit = 50) {
  const { rows } = await db.query(
    `SELECT user_id FROM pending_erasures
     WHERE last_attempt_at IS NULL OR last_attempt_at < NOW() - make_interval(mins => $1)
     ORDER BY requested_at LIMIT $2`,
    [RETRY_AFTER_MINUTES, limit]
  );
  return rows.map((row) => row.user_id);
}

/** The notification service confirmed the erasure: nothing is left to do for this user. */
export async function completeErasure(userId) {
  await db.query("DELETE FROM pending_erasures WHERE user_id = $1", [userId]);
}

/** The attempt failed: keep the request, count it, and wait before trying again. */
export async function recordFailedErasure(userId) {
  await db.query("UPDATE pending_erasures SET attempts = attempts + 1, last_attempt_at = NOW() WHERE user_id = $1", [userId]);
}

/** How many requests are still waiting (for the log). */
export async function countPendingErasures() {
  const { rows } = await db.query("SELECT COUNT(*) FROM pending_erasures");
  return Number(rows[0].count);
}
