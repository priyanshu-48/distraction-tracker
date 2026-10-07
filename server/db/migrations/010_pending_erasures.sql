-- Erasure requests for the notification service (decisions.md, D-39).
--
-- When a user deletes their history or their account, whatever the notification service holds about them (their email
-- and the alerts it was sent) must go too. That is a call to another system, which may be asleep or down at that moment,
-- so the request is recorded in the SAME statement that deletes the data here, tried straight away, and retried until it
-- succeeds. The row is removed once the service has confirmed.
--
-- There is deliberately no foreign key to users: for an account deletion the user is already gone. The row holds only the
-- internal numeric id (no email, no name) and exists only until the erasure is confirmed.
CREATE TABLE IF NOT EXISTS pending_erasures (
  user_id         INTEGER PRIMARY KEY,
  requested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempts        INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ
);
