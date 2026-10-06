import db from "../db.js";

export const DEFAULT_DAILY_BUDGET_SECONDS = 7200;

/** The user's daily distraction budget, or the default until they set one. */
export async function getDailyBudget(userId) {
  const { rows } = await db.query("SELECT daily_budget_seconds FROM user_settings WHERE user_id = $1", [userId]);
  return rows[0]?.daily_budget_seconds ?? DEFAULT_DAILY_BUDGET_SECONDS;
}

export async function setDailyBudget(userId, seconds) {
  await db.query(
    `INSERT INTO user_settings (user_id, daily_budget_seconds) VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET daily_budget_seconds = EXCLUDED.daily_budget_seconds, updated_at = NOW()`,
    [userId, seconds]
  );
  return seconds;
}
