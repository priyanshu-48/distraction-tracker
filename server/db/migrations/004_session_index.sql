-- "Today's session time" filters tracking_sessions by user and start time.
CREATE INDEX IF NOT EXISTS idx_tracking_sessions_user_start
  ON tracking_sessions (user_id, start_time);
