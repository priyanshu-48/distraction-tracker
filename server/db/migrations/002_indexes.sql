-- Analytics filter by (user_id, time range); open rows are looked up per user.
CREATE INDEX IF NOT EXISTS idx_tab_activity_user_started
  ON tab_activity (user_id, started_at);

CREATE INDEX IF NOT EXISTS idx_tab_activity_open
  ON tab_activity (user_id, started_at DESC) WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tracking_sessions_open
  ON tracking_sessions (user_id) WHERE end_time IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_distraction_sites_user_domain
  ON distraction_sites (user_id, domain);
