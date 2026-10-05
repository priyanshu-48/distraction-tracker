import db from "../db.js";

// A user is "tracking" while they have a session row with no end_time.
export async function isTracking(userId) {
    const result = await db.query(
        `SELECT EXISTS (
            SELECT 1 FROM tracking_sessions WHERE user_id = $1 AND end_time IS NULL
        ) AS tracking`, [userId]);
    return result.rows[0].tracking;
}

export async function logSessionStart(userId) {
    if (await isTracking(userId)) return; // already running; don't open a second session
    await db.query(
        `INSERT INTO tracking_sessions (user_id, start_time) VALUES ($1, NOW())`,
        [userId]);
}

export async function logSessionEnd(userId){
   await db.query(`
        UPDATE tracking_sessions
        SET end_time = NOW()
        WHERE id = (
            SELECT id from tracking_sessions
            WHERE user_id = $1 AND end_time IS NULL
            ORDER BY start_time DESC
            LIMIT 1
        )
        `,[userId]);
}
