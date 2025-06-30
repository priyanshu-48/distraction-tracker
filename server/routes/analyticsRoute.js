import express from "express";
import authenticate from "../middleware/auth.js";
import db from "../db.js";

const router = express.Router();

router.get("/time-spent-daily", authenticate, async (req, res) => {
  const userId = req.user.id;

  const result = await db.query(
    `
    WITH last_monday AS (
    SELECT CURRENT_DATE - ((EXTRACT(DOW FROM CURRENT_DATE)::int + 6) % 7) AS monday
    ),
    days AS (
      SELECT generate_series(
        (SELECT monday FROM last_monday),
        (SELECT monday FROM last_monday) + INTERVAL '6 days',
        '1 day'
      )::DATE AS day
    )
    SELECT 
      TO_CHAR(days.day, 'Day') AS weekday,
      COALESCE(SUM(tab_activity.duration), 0)/60 AS time_spent
    FROM days
    LEFT JOIN tab_activity
      ON DATE(tab_activity.started_at) = days.day
      AND tab_activity.user_id = $1
    GROUP BY days.day
    ORDER BY days.day ASC;
  `,
    [userId]
  );

  res.json(result.rows);
});

router.get("/tab-switches-daily", authenticate, async (req, res) => {
  const userId = req.user.id;

  const result = await db.query(`
    WITH last_monday AS (
    SELECT CURRENT_DATE - ((EXTRACT(DOW FROM CURRENT_DATE)::int + 6) % 7) AS monday
    ),
    days AS (
      SELECT generate_series(
        (SELECT monday FROM last_monday),
        (SELECT monday FROM last_monday) + INTERVAL '6 days',
        '1 day'
      )::DATE AS day
    )
    SELECT 
      TO_CHAR(days.day, 'Day') AS weekday,
      COALESCE(COUNT(tab_activity.id), 0) AS tab_switches
    FROM days
    LEFT JOIN tab_activity
      ON DATE(tab_activity.started_at) = days.day
      AND tab_activity.user_id = $1
    GROUP BY days.day
    ORDER BY days.day ASC;
  `,[userId]);
  res.json(result.rows);
});

router.get("/most-visited-today", authenticate, async (req, res) => {
  const userId = req.user.id;
  const result = await db.query(
    `
    SELECT
      domain,
      COUNT(*) AS visit_count
    FROM tab_activity
    WHERE user_id = $1
      AND started_at::date = CURRENT_DATE
    GROUP BY domain
    ORDER BY visit_count DESC
    LIMIT 5;
  `,
    [userId]
  );
  res.json(result.rows);
});

router.get("/time-spent-today", authenticate, async (req, res) => {
  const userId = req.user.id;

  const result = await db.query(
    `
    SELECT domain, SUM(duration) AS total_time
    FROM tab_activity
    WHERE started_at::date = CURRENT_DATE AND user_id=$1
    GROUP BY domain
    ORDER BY total_time DESC
    LIMIT 5
  `,
    [userId]
  );
  res.json(result.rows);
});

router.get("/total-switches-today", authenticate, async (req, res) => {
  const userId = req.user.id;
  const result = await db.query(
    `
    SELECT COUNT(*) AS total_switches
    FROM tab_activity
    WHERE user_id = $1
    AND started_at::date = CURRENT_DATE;
    `,
    [userId]
  );
  res.json({ total_switches: parseInt(result.rows[0].total_switches) });
});

export default router;
