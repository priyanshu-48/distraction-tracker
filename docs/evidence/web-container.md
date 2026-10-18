# The production web container

The Docker `web` service used to run the Vite dev server. It now serves the production build of the dashboard with nginx
(`client/Dockerfile`, `client/nginx.conf`). Built and checked on 2026-10-18.

## What changed

| | Before | After |
|---|---|---|
| What runs | Vite dev server (Node, source, `node_modules`) | nginx serving the built files only |
| Image size | 715 MB (233 MB of it `node_modules`) | 92.3 MB (7.7x smaller) |
| User | root | non-root (`nginx-unprivileged`, port 8080 inside the container) |
| API address | never passed in: with `API_PORT=3100` the dashboard still called port 3000 | baked in at build time from `API_PORT` |
| Extension id | never reached the container (`client/.env` is in `.dockerignore`), so the dashboard always said the extension was not connected | `VITE_EXTENSION_ID` from a `.env` next to `docker-compose.yml`, passed as a build argument |
| Content-Security-Policy | none (dev server) | the one the production build adds, plus `frame-ancestors 'none'` as a header |
| Reload on `/login` etc. | handled by the dev server | `try_files ... /index.html` (single-page-app fallback) |

Why it was possible: the production build used to take about six minutes and that was the reason for running the dev server in
Docker. See `build-time-investigation.md`; the build inside the image takes about 2 seconds.

## How it was checked

1. `docs/evidence/check-web-container.sh` (26 checks; output in `raw/web-container-checks.txt`): the app is served on `/`,
   `/login`, `/register`, a deep link and an unknown path; a missing file under `/assets/` is a real 404; `/healthz`; the page carries
   a Content-Security-Policy naming the API; it is a production build with a hashed script and no dev client; `index.html` is not
   cached and hashed assets are cached for a year; gzip; four security headers on both the page and an asset; no nginx version
   announced; the container runs as non-root; no Node and no source in the image; Docker reports it healthy. **26 of 26 pass.**
2. The script was shown to be able to fail: four deliberate breaks of `nginx.conf` (no single-page-app fallback, no asset caching,
   no security headers, no gzip) were each caught (3, 1, 8 and 1 checks failed). Restored: 26 of 26 again. The first versions of
   the script had two bugs of their own (a quoting problem, and `grep -q` aborting `curl` on this Windows shell); both were found
   because checks failed that the container had already passed, and the script was rewritten.
3. In a real browser, against the containerised API: sign-in works, the Day view loads data, a full reload of `/?view=week` while
   signed in works, there are no Content-Security-Policy violations in the console, nothing is stored in `localStorage`. The only
   console error is the expected 401 from the logged-out check on the login page.

## What this does not cover

- No hot reload in Docker any more: development uses `npm run dev` in `client/` as before.
- The API address and extension id are fixed when the image is built, so changing them needs `docker compose up --build`.
- The extension's manifest still only allows a dashboard on port 5173, so the extension does not connect if `WEB_PORT` is changed
  (see "Running it on your own domain" in the README for building an extension for other addresses).
- The check script runs in CI as the `web-container` job (`docker compose up -d --build --wait`, then the script), so the Dockerfile and
  `nginx.conf` cannot rot unnoticed. The same commands were run locally in a separate compose project first (22 s to start, 26 of 26 checks).
  That job's first run on GitHub had not been seen when this was written.
- Served over plain http on localhost (no TLS); the compose API runs with `COOKIE_SECURE=false` for that reason.
