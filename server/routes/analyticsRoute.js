import express from 'express';
import authenticate from '../middleware/auth.js';
import db from '../db.js';

const router = express.Router();

router.get('/daily-time', authenticate, async (req, res) => {
  const userId = req.user.id;

  const result = await db.query(`
    WITH days AS (
      SELECT generate_series(
        CURRENT_DATE - INTERVAL '6 days',
        CURRENT_DATE,
        '1 day'
      )::DATE AS day
    )
    SELECT 
      days.day,
      COALESCE(SUM(tab_activity.duration), 0) AS total_time
    FROM days
    LEFT JOIN tab_activity
      ON DATE(tab_activity.started_at) = days.day
      AND tab_activity.user_id = $1
    GROUP BY days.day
    ORDER BY days.day ASC;
  `, [userId]);

  res.json(result.rows);
});

router.get('/time-spent-today', authenticate, async (req, res) => {
  const userId = req.user.id;

  const result = await db.query(`
    SELECT domain, SUM(duration) AS total_time
    FROM tab_activity
    WHERE started_at::date = CURRENT_DATE AND user_id=$1
    GROUP BY domain
    ORDER BY total_time DESC
    LIMIT 5
  `, [userId]);
  res.json(result.rows);
});

router.get('/daily-tab-switches', authenticate, async (req, res) => {
  const userId = req.user.id;

  const result = await db.query(`
    WITH days AS (
      SELECT generate_series(
        CURRENT_DATE - INTERVAL '6 days',
        CURRENT_DATE,
        '1 day'
      )::DATE AS day
    )
    SELECT 
      days.day,
      COALESCE(COUNT(tab_activity.id), 0) AS tab_switches
    FROM days
    LEFT JOIN tab_activity
      ON DATE(tab_activity.started_at) = days.day
      AND tab_activity.user_id = $1
    GROUP BY days.day
    ORDER BY days.day ASC;
  `, [userId]);

  res.json(result.rows);
});

router.get('/most-visited-today', authenticate, async (req, res) => {
  const userId = req.user.id;

  const result = await db.query(`
    SELECT
      domain,
      COUNT(*) AS visit_count
    FROM tab_activity
    WHERE user_id = $1
      AND started_at::date = CURRENT_DATE
    GROUP BY domain
    ORDER BY visit_count DESC
    LIMIT 5;
  `, [userId]);
  res.json(result.rows);
});


export default router;
