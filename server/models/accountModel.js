import bcrypt from "bcrypt";
import db from "../db.js";
import { DEFAULT_DAILY_BUDGET_SECONDS } from "./settingsModel.js";

/** Does `password` match the one this account was created with? False for an unknown account too. */
export async function passwordMatches(userId, password) {
  const { rows } = await db.query("SELECT password_hash FROM users WHERE id = $1", [userId]);
  // A fixed hash is compared when the account is missing, so both outcomes cost one bcrypt round.
  return bcrypt.compare(password, rows[0]?.password_hash ?? MISSING_ACCOUNT_HASH);
}
const MISSING_ACCOUNT_HASH = bcrypt.hashSync("no-such-account", 10);

/** Everything about the account except the visits (those are read in batches): who, settings, marked sites, sessions. */
export async function getAccountSnapshot(userId) {
  const [account, settings, sites, sessions] = await Promise.all([
    db.query("SELECT email, created_at FROM users WHERE id = $1", [userId]),
    db.query("SELECT daily_budget_seconds FROM user_settings WHERE user_id = $1", [userId]),
    db.query("SELECT domain FROM distraction_sites WHERE user_id = $1 ORDER BY domain", [userId]),
    db.query("SELECT start_time, end_time FROM tracking_sessions WHERE user_id = $1 ORDER BY start_time", [userId]),
  ]);
  return {
    email: account.rows[0].email,
    createdAt: account.rows[0].created_at.toISOString(),
    dailyBudgetSeconds: settings.rows[0]?.daily_budget_seconds ?? DEFAULT_DAILY_BUDGET_SECONDS,
    distractionSites: sites.rows.map((r) => r.domain),
    sessions: sessions.rows.map((r) => ({ start: r.start_time.toISOString(), end: r.end_time ? r.end_time.toISOString() : null })),
  };
}

/**
 * The user's recorded visits, oldest stored first, a few thousand at a time. Reading by id (not OFFSET) keeps each batch
 * cheap however long the history is, and memory bounded however many visits there are.
 */
export async function* visitBatches(userId, size = 2000) {
  let after = 0;
  for (;;) {
    const { rows } = await db.query(
      `SELECT id, url, domain, title, started_at, ended_at, duration
       FROM tab_activity WHERE user_id = $1 AND id > $2 ORDER BY id LIMIT $3`,
      [userId, after, size]
    );
    if (rows.length === 0) return;
    yield rows;
    after = rows[rows.length - 1].id;
  }
}

/**
 * Deletes every recorded visit and session in one statement (so it is all or nothing). The account, the daily budget and
 * the list of marked sites stay. A session that was running is deleted too; visits the extension uploads afterwards are
 * dropped by the server until a new session starts.
 */
export async function deleteHistory(userId) {
  const { rows } = await db.query(
    `WITH v AS (DELETE FROM tab_activity WHERE user_id = $1 RETURNING 1),
          s AS (DELETE FROM tracking_sessions WHERE user_id = $1 RETURNING 1)
     SELECT (SELECT COUNT(*) FROM v) AS visits, (SELECT COUNT(*) FROM s) AS sessions`,
    [userId]
  );
  return { visits: Number(rows[0].visits), sessions: Number(rows[0].sessions) };
}

/** Deletes the account. Every other table references users with ON DELETE CASCADE, so nothing is left behind. */
export async function deleteAccount(userId) {
  await db.query("DELETE FROM users WHERE id = $1", [userId]);
}
