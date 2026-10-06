-- "www.youtube.com" and "youtube.com" are the same site. Domains are now stored lower-cased
-- without a leading "www." (see domain/sites.js); this brings existing rows in line.
-- Subdomains such as m.youtube.com are left alone.

-- A user may already have marked both spellings; keep the oldest row so the unique index holds.
DELETE FROM distraction_sites a
USING distraction_sites b
WHERE a.user_id = b.user_id
  AND a.id > b.id
  AND regexp_replace(lower(a.domain), '^www\.', '') = regexp_replace(lower(b.domain), '^www\.', '');

UPDATE distraction_sites
SET domain = regexp_replace(lower(domain), '^www\.', '')
WHERE domain <> regexp_replace(lower(domain), '^www\.', '');

UPDATE tab_activity
SET domain = regexp_replace(lower(domain), '^www\.', '')
WHERE domain <> regexp_replace(lower(domain), '^www\.', '');
