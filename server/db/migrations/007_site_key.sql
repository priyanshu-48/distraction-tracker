-- One site, however it is reached. site_key() maps a stored domain to the name its visits and its
-- "distraction" mark are grouped under, so m.youtube.com and youtu.be count as youtube.com.
--
--   * a leading m. / mobile. / old. / touch. is dropped (only when a real domain is left)
--   * a few well-known aliases map to their main domain
--
-- It deliberately does NOT reduce a host to its registrable domain: docs.google.com (work) and
-- mail.google.com must stay separate sites. Nothing in tab_activity is rewritten, so this is
-- reversible: change the function and every read follows (decisions.md, D-33).
-- Both functions are a single expression with no FROM, so Postgres inlines them into the query. (A body with a
-- subquery is not inlined and costs about 10 microseconds per call, which showed up as 300 ms on a week of visits.)
-- Plain string tests, not a regex, because this runs on every row of big queries.
CREATE OR REPLACE FUNCTION strip_mobile_prefix(domain text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE
           WHEN domain LIKE 'm.%.%' THEN substr(domain, 3)
           WHEN domain LIKE 'mobile.%.%' THEN substr(domain, 8)
           WHEN domain LIKE 'old.%.%' THEN substr(domain, 5)
           WHEN domain LIKE 'touch.%.%' THEN substr(domain, 7)
           ELSE domain
         END
$$;

CREATE OR REPLACE FUNCTION site_key(domain text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE strip_mobile_prefix(domain)
           WHEN 'youtu.be' THEN 'youtube.com'
           WHEN 'x.com' THEN 'twitter.com'
           WHEN 'fb.com' THEN 'facebook.com'
           ELSE strip_mobile_prefix(domain)
         END
$$;

-- Existing marks move to the group they belong to (a user who marked m.youtube.com now has youtube.com marked).
INSERT INTO distraction_sites (user_id, domain)
SELECT DISTINCT user_id, site_key(domain) FROM distraction_sites WHERE domain <> site_key(domain)
ON CONFLICT (user_id, domain) DO NOTHING;

DELETE FROM distraction_sites WHERE domain <> site_key(domain);
