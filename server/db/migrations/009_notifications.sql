-- Notifications (decisions.md, D-39).
--
-- notification_settings: opt-in per user. A row appears when the user first saves a choice, and `enabled`
-- defaults to FALSE, so nothing is sent about anyone who has not switched notifications on. `time_zone` is what
-- the user's "today" and "Monday morning" mean for alerts that are raised without a browser request.
CREATE TABLE IF NOT EXISTS notification_settings (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  enabled    BOOLEAN NOT NULL DEFAULT FALSE,
  time_zone  TEXT NOT NULL DEFAULT 'UTC',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- alerts: the tracker's own record of each alert it raised. The unique key makes an alert happen once (a retry,
-- a restart or two requests at once cannot raise it twice), and the extension reads undelivered rows to show a
-- Chrome notification, so a toast never depends on the hosted notification service being awake.
CREATE TABLE IF NOT EXISTS alerts (
  id           BIGSERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dedupe_key   TEXT NOT NULL,
  kind         TEXT NOT NULL,
  title        TEXT NOT NULL,
  body         TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  UNIQUE (user_id, dedupe_key)
);

-- The extension asks for undelivered alerts every 30 seconds; this keeps that lookup to the few rows that matter.
CREATE INDEX IF NOT EXISTS alerts_undelivered_idx ON alerts (user_id, id) WHERE delivered_at IS NULL;
