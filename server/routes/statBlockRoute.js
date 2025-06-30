import express from "express";
import authenticate from "../middleware/auth.js";
import db from "../db.js";

const router = express.Router();

router.get('/today-count', authenticate, async (req,res) => {
    const userId = req.user.id;
    const result = await db.query(`
        SELECT
        COUNT(*) AS count,
        SUM(duration) AS distraction_time,
        (
            SELECT domain
            FROM tab_activity
            WHERE user_id = $1 AND started_at::date = CURRENT_DATE
            GROUP BY domain
            ORDER BY COUNT(*) DESC
            LIMIT 1
        ) AS most_visited_domain
        FROM tab_activity
        WHERE user_id = $1 AND started_at::date = CURRENT_DATE;
        `,[userId]);
    res.json(result.rows);
})

router.get('/today-session', authenticate, async (req,res) => {
    const userId = req.user.id;

    const result = await db.query(`
        SELECT SUM(end_time - start_time) AS total_time
        FROM tracking_sessions
        WHERE user_id = $1
        AND start_time::date = CURRENT_DATE
        AND end_time IS NOT NULL;
        `,[userId]);
    res.json(result.rows);
    
});

export default router;
