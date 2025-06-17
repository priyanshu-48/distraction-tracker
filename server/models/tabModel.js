import db from "../db.js";

export async function insertStartData(data) {
  const { url, domain, title, startTime } = data;
  await db.query(
    "INSERT INTO tab_activity (url, domain, title, started_at) VALUES ($1, $2, $3, $4)",
    [url, domain, title, startTime]
  );
}

export async function updateEndTime(data) {
  const { url, endedAt } = data;
  console.log("End url:",url);
  console.log("End time:",endedAt);
  await db.query(`
  WITH target AS (
    SELECT id FROM tab_activity
    WHERE url = $1 AND ended_at IS NULL
    ORDER BY started_at DESC
    LIMIT 1
  )
  UPDATE tab_activity
  SET ended_at = $2
  WHERE id IN (SELECT id FROM target)`, [url, endedAt]);
}
