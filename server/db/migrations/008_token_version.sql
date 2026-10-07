-- Lets a login token be revoked. The version is copied into every token when it is issued and compared on every
-- request; bumping it (logout) makes every token issued before that stop working. Existing tokens carry no version
-- and count as 0, so they keep working until someone logs out or they expire.
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;
