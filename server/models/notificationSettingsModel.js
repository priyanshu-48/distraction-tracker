import db from "../db.js";

export const DEFAULT_NOTIFICATION_SETTINGS = { enabled: false, timeZone: "UTC" };

/** The user's notification choice, or "off, UTC" until they save one (no row is created by reading). */
export async function getNotificationSettings(userId) {
  const { rows } = await db.query("SELECT enabled, time_zone FROM notification_settings WHERE user_id = $1", [userId]);
  return rows[0] ? { enabled: rows[0].enabled, timeZone: rows[0].time_zone } : { ...DEFAULT_NOTIFICATION_SETTINGS };
}

export async function setNotificationSettings(userId, { enabled, timeZone }) {
  await db.query(
    `INSERT INTO notification_settings (user_id, enabled, time_zone) VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE SET enabled = EXCLUDED.enabled, time_zone = EXCLUDED.time_zone, updated_at = NOW()`,
    [userId, enabled, timeZone]
  );
  return { enabled, timeZone };
}

/** Who an alert goes to: the account's id and email. */
export async function getRecipient(userId) {
  const { rows } = await db.query("SELECT email FROM users WHERE id = $1", [userId]);
  return { id: userId, email: rows[0].email };
}
