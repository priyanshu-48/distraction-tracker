-- Intervals are uploaded once, already finished, with a client-generated id.
-- The unique index makes retried uploads idempotent. Legacy rows keep NULL ids
-- (NULLs are distinct in a unique index), so they are unaffected.
ALTER TABLE tab_activity ADD COLUMN IF NOT EXISTS client_event_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tab_activity_user_event
  ON tab_activity (user_id, client_event_id);
