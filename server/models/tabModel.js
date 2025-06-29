import db from "../db.js";

export async function insertStartData(data) {
  const { url, domain, title, startTime, userId } = data;
  await db.query(
    "INSERT INTO tab_activity (url, domain, title, started_at, user_id) VALUES ($1, $2, $3, $4, $5)",
    [url, domain, title, startTime, userId]
  );
}

export async function updateEndTime(data) {
  const { userId, endedAt } = data;
  await db.query(`
    WITH target AS (
      SELECT id FROM tab_activity
      WHERE user_id = $1 AND ended_at IS NULL
      ORDER BY started_at DESC
      LIMIT 1
    )
    UPDATE tab_activity
    SET ended_at = $2,
        duration = EXTRACT(EPOCH FROM ($2 - started_at))
    WHERE id IN (SELECT id FROM target)
  `, [userId, endedAt]);
}

export async function endAllTabs(userId, endTime) {
  await db.query(`
    UPDATE tab_activity
    SET 
      ended_at = $1,
      duration = EXTRACT(EPOCH FROM ($1 - started_at))
    WHERE user_id = $2 AND ended_at IS NULL
    `, [endTime, userId]);
}

