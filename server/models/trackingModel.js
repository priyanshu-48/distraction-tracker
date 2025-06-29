import db from "../db.js";

export async function logSessionStart(userId,startTime) {
    const result = await db.query(`
        INSERT INTO tracking_sessions
        (user_id, start_time) VALUES ($1, $2)
        RETURNING id
        `, [userId, startTime]);
    const sessionId = result.rows[0].id;
    return sessionId;
}

export async function logSessionEnd(userId,endTime){
   await db.query(`
        UPDATE tracking_sessions
        SET end_time = $1
        WHERE id = (
            SELECT id from tracking_sessions
            WHERE user_id = $2 AND end_time IS NULL
            ORDER BY start_time DESC
            LIMIT 1
        )
        `,[endTime,userId]);
}