-- Nudges (decisions.md, D-48).
--
-- A nudge is the extension's "you are over budget, and you just opened a distraction site" moment. The server decides it
-- (it owns the budget and the site-matching rules) and records every decision here, including the ones deliberately NOT
-- shown (`shown` = FALSE, the randomised holdout), so the dashboard can compare how often people leave a site within a
-- minute with and without a nudge.
--
-- `client_event_id` is the id of the visit the nudge was decided for. The visit uploads later as a tab_activity row with the
-- same id (unique per user, migration 003), so the outcome is a join and the extension reports nothing extra. The unique key
-- also means one decision per visit, however many times the request is retried.
CREATE TABLE IF NOT EXISTS nudges (
  id              BIGSERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_event_id UUID NOT NULL,
  site            TEXT NOT NULL, -- site_key(domain): youtu.be and youtube.com are one site
  kind            TEXT NOT NULL CHECK (kind IN ('over-budget', 'repeat')),
  shown           BOOLEAN NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, client_event_id)
);

-- The cooldown asks "when was this site last nudged?"; the dashboard asks "which nudges fell in this week?".
CREATE INDEX IF NOT EXISTS nudges_site_idx ON nudges (user_id, site, created_at DESC);
CREATE INDEX IF NOT EXISTS nudges_time_idx ON nudges (user_id, created_at);
