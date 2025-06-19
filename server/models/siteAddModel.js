import db from '../db.js';

export async function addSite(userId, domain) {
  const result = await db.query(
    `INSERT INTO distraction_sites (user_id, domain) VALUES ($1, $2) RETURNING *`,
    [userId, domain]
  );
  return result.rows[0];
}