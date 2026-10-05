-- Baseline schema. IF NOT EXISTS so it is a no-op on databases created by hand
-- before migrations existed.

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tab_activity (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  url        TEXT NOT NULL,
  domain     TEXT NOT NULL,
  title      TEXT,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at   TIMESTAMPTZ,
  duration   DOUBLE PRECISION -- seconds; NULL while the tab is still open
);

CREATE TABLE IF NOT EXISTS tracking_sessions (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_time   TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS distraction_sites (
  id      SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  domain  TEXT NOT NULL
);
