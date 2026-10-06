-- Per-user settings. A row is created the first time a user changes something; until then the
-- defaults in the application apply, so existing users need no backfill.
CREATE TABLE IF NOT EXISTS user_settings (
  user_id              INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  -- Daily distraction budget in seconds: 5 minutes to 24 hours.
  daily_budget_seconds INTEGER NOT NULL DEFAULT 7200
                       CHECK (daily_budget_seconds BETWEEN 300 AND 86400),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
