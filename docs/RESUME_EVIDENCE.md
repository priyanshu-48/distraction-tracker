# Resume evidence

Every resume claim for this project, re-checked. Measured 2026-10-07/08 on branch `evidence/resume-metrics`, which starts
from `main` at commit `3362e9b`; the changes on the branch (new tests and scripts, the 7 legacy endpoints removed, CI coverage,
docs) are not yet committed, so numbers marked "branch" include them. Environment (CPU, RAM, OS, Node, Docker, PostgreSQL): `docs/evidence/ENVIRONMENT.md`.
Raw outputs: `docs/evidence/raw/`. Where a number got worse than the resume said, it says so below.

## Summary: what changed from the draft resume

| Draft claim | Verdict | What to say instead |
|---|---|---|
| "1,176 ms to 5.7 ms (206x) on 1M rows" | **Does not reproduce.** Re-measured: 396 ms to 11.95 ms, **33x**. | "about 400 ms to about 12 ms (33x)", with the setup named |
| "986 automated tests" | **True on `main`** (571 + 365 + 50, three clean-clone runs, no flaky test). **991 on the branch** (553 + 386 + 52): 27 tests were removed with the legacy endpoints and 32 added. README said 751 (stale). | "990 automated tests" once the branch is merged, "980+" until then |
| "16-route authorization table" | **True on `main`**: 16 rows (`server/test/session.test.js`). On the branch it is **17**: the legacy analytics row was replaced by the two `/notifications/settings` routes, which the table had missed. | "17-route" once merged |
| "4-job GitHub Actions pipeline" | **True**, and `main` is green. | keep |
| Day view: 6 requests to 1 | True as a count. **Not a latency win**: the single request is slower (37 ms vs 12 ms) because it returns much more. | claim fewer round trips, not speed |
| "TypeScript" in the stack line | True for the **client only**. The server and extension are JavaScript. | "TypeScript (React client)" |
| Coverage | Not measured before. On the branch: server **95.0%** lines, client **93.6%**. Extension: not measurable (see B). | quote server and client separately |

## Claims table

| Claim | Verified value | Command | Commit | Date | Raw output | Caveats |
|---|---|---|---|---|---|---|
| Tests, per suite | server 571 (28 files), client 365 (21 files), extension 50; 0 failed, 0 skipped, identical in 3 runs each | `docs/evidence/run-tests.sh` (fresh `git clone`, `npm ci`, each suite x3) | 3362e9b | 2026-10-07 | `raw/tests-*-run{1,2,3}.txt`, `tests-meta.txt` | Server tests need a local PostgreSQL (`DB_*` in `server/.env`) |
| Tests on the branch | server 553 (28 files), client 386 (23 files), extension 52 = **991**; all pass; lint and typecheck clean | `npx vitest run --coverage` (server, client), `node --test "test/*.test.mjs"` | branch (uncommitted) | 2026-10-08 | `raw/final3-server-coverage.txt`, `raw/final2-client-coverage.txt`, `raw/final-extension.txt` | Net change vs `main` (986): 32 tests added (sections B, F and the time-zone test), 27 removed with `analytics.test.js` |
| Server coverage | 95.04% lines, 94.65% statements, 94.09% branches, 96.34% functions (787 lines) | `cd server && npm run coverage` | branch | 2026-10-08 | `raw/final3-server-coverage.txt` | Counts every non-test file under `server/` except `scripts/`, `vendor/`, config |
| Client coverage | 93.64% lines, 93.32% statements, 88.49% branches, 88.36% functions (912 lines); was 91.0% before the two new test files | `cd client && npm run coverage` | branch | 2026-10-08 | `raw/final2-client-coverage.txt` (before: `raw/final-client-coverage.txt`) | Counts every file under `src/` except tests and `src/test/` |
| Extension coverage | **Not measurable as-is** | `node --test --experimental-test-coverage` | 3362e9b | 2026-10-08 | `raw/coverage-extension.txt` | The tests import a temporary copy of `background.js`, so Node reports no files (the "100%" it prints is empty, ignore it). I did not change the tests to fix this. |
| Query speedup | **33x** (sum of p50 over the 7 legacy queries: 396.12 ms to 11.95 ms) | `docs/evidence/run-analytics-states.sh` (uses `server/scripts/bench/analytics.js`, 15 runs after 3 warm-ups) | 3362e9b | 2026-10-08 | `raw/analytics-{A,B,C,D}-{timings,plans,indexes}.txt`, `raw/seed.txt` | Synthetic data (`scripts/seed.js`), one laptop, PostgreSQL 17.11 in Docker, warm cache |
| Index alone / rewrite alone | 1.16x (341.12 ms) / 1.23x (322.12 ms) | same | same | same | same | Only the two together produce the 33x |
| Day view (`/summary`), model + driver | p50 44.7 ms, p95 51.6 ms, max 51.8 ms; 2,149 visits that day; 30 runs | `node scripts/bench/summary.js --runs 30` | 3362e9b | 2026-10-08 | `raw/summary-bench.txt` | 1M rows, heaviest user, server side only |
| Day view over HTTP | new `/summary`: p50 36.7 ms, p95 46.7 ms, 3,446 bytes. Old six requests at once: p50 12.4 ms, p95 17.5 ms, 1,205 bytes. One after another: p50 28.6 ms | `node scripts/bench/requests.js --runs 30` (the version that still had the six old requests) | 3362e9b | 2026-10-08 | `raw/requests-bench.txt` | Measured **before** the legacy endpoints were removed, so it cannot be re-run: the script now times only `/summary` and `/range`. The old six used the **already optimised** queries, so this is not the original dashboard's latency. The new response carries far more (usual baseline, timeline, 7 days, triggers). |
| Week / Month (`/range`) | week p50 41.7 to 46.1 ms; month p50 53.7 to 97.6 ms (worst case: 33,355 distraction visits) | `node scripts/bench/range.js --runs 20` | 3362e9b | 2026-10-08 | `raw/range-bench.txt` | Server side, localhost, heaviest synthetic user. Not what a browser user experiences. |
| Production client build time | 369 s, 349 s, 331 s (mean 350 s, about 5.8 min); 1,894 modules; exit 0 each | `npm run build` x3, timed | 3362e9b | 2026-10-08 | `raw/build-times.txt`, `raw/build-run{1,2,3}.txt` | Cause not investigated (you asked not to spend long). README said five minutes, an earlier note six: six is right. |
| CSP in the production build | `dist/index.html` contains the Content-Security-Policy meta tag | inspected after build run 3 | 3362e9b | 2026-10-08 | `raw/build-run3.txt` | The built app was not loaded in a browser to check for violations |
| Auth mutations | **23 of 23 caught**, 0 survived, 0 not applied; unmutated tests pass (123/123) | `cd server && node scripts/mutate-auth.mjs` | 3362e9b | 2026-10-08 | `raw/auth-mutations.txt`; table in `auth-mutations.md` | Hand-picked, not a mutation score over the code base |
| CI | 4 jobs: server tests (PostgreSQL 17 service), client (lint, typecheck, test, build), extension tests, production dependency audit (server and client). Latest run on `main` succeeded | `gh run list --branch main` | 3362e9b | 2026-10-08 | URL below | On the branch the server and client jobs run `npm run coverage` and upload the summary. **That workflow change has not run yet**: it can only be tested by pushing. No coverage threshold is set. |
| New client tests | `src/api.test.ts` (15 tests) and `src/app/ExtensionTokenSync.test.tsx` (6 tests); 10 of 10 deliberate breaks of `api.js` and `ExtensionTokenSync.tsx` were caught | `npx vitest run src/api.test.ts src/app/ExtensionTokenSync.test.tsx` | branch | 2026-10-08 | `raw/client-new-tests-mutations.txt` | |

Latest successful CI run on `main`: https://github.com/priyanshu-48/distraction-tracker/actions/runs/37649413384 (commit `3362e9b`).

## A. Test count: why 751, 986 and 990

- README's "751 (362 server, 349 client, 40 extension)" is **stale**: it was last edited in `e127a6a` and tests have been added since (notifications, login hardening, data controls).
- The 986 figure (571 + 365 + 50) is correct for `main` at `3362e9b`: three clean-clone runs of each suite gave the same counts.
- The branch has 990 because this work added 2 server and 2 extension tests (section F). README now says 990.

## B. Coverage

Server 95.04% lines, client 93.64% (after the two client test files below). Least covered files (lines): server `server.js` 0%
and `db/migrate.js` 0% (entry points, exercised only by running the app and Docker), `controllers/registerController.js` 83.3%;
client `App.jsx`, `main.jsx`, `DesignPage.tsx` (dev only) 0%, `features/sites/SiteRow.tsx` 40%, `AddSiteForm.tsx` 50%,
`SitesManager.tsx` 70%. Lists: `raw/least-covered-final.txt` (and `raw/least-covered.txt` from before).

Added at your request: `client/src/api.test.ts` (cookie setting, `X-Requested-With` on writes only, time zone added to the three
routed paths, 401 redirects but not on `/auth/` calls, other statuses do not) and `ExtensionTokenSync.test.tsx` (syncs on load when
signed in, not when signed out or pending, at most once every 10 s on focus, stops on unmount, starts when sign-in happens later).
They were not written to chase the number; they cover the security-relevant client code that every other test mocks away.
Still open: the extension's coverage cannot be measured until the test harness loads `background.js` in a way Node's coverage can
see (a harness change; not done), and the sites screens (`SiteRow`, `AddSiteForm`, `SitesManager`) are the weakest client files.
CI: the server and client jobs now run `npm run coverage` and upload `coverage-summary.json` as an artifact. No threshold (add one
if you want regressions to fail the build).

## C. Query performance

- **What "original queries" are:** the seven queries in `server/scripts/bench/legacy.js` (kept for this benchmark), which are the
  pre-rewrite versions of what the `/api/analytics/*` endpoints ran (those endpoints are now removed; the "after" SQL is frozen in
  `server/scripts/bench/rewritten.js`, so the benchmark still runs): `timeSpentToday`, `mostVisitedToday`, `totalSwitchesToday`,
  `todayCount`, `todaySession`, `timeSpentDaily`, `tabSwitchesDaily`. Confirmed: the dashboard used six of them (see D); the README
  says it no longer calls any of them.
- **How to word it honestly:** the original dashboard's analytics queries were optimised, then the dashboard was rebuilt around two
  newer endpoints, so what you can truthfully claim is the query optimisation itself, not the current dashboard's speed.
- **Rounding:** the old page said 1175.52 ms in its table; README said 1,176 ms (same number rounded). Both are now superseded:
  the benchmark page has a re-measurement section and a pointer at the top, and the README says 396 ms to 12 ms (33x).
- **Which change mattered:** neither alone (1.16x and 1.23x); only the two together (33x). See the table in the benchmark page.
- **Why 206x did not reproduce:** unknown. The scripts did not change; the earlier run used a local Windows PostgreSQL 17.5. You
  chose not to run it locally now. The Docker run is the reproducible one (`docs/evidence/run-analytics-states.sh`).

## D. Request consolidation and dashboard latency

Over HTTP on the same 1M rows (30 runs, measured before the old endpoints were removed): the old six requests sent at once took p50 12.4 ms; the single `/summary` took p50 36.7 ms.
**No speed-up can be claimed from consolidation.** What is true: six round trips became one, and the one response carries
more (3.4 kB vs 1.2 kB: usual baseline, timeline, last 7 days, triggers). On a real network, five fewer round trips would matter more
than on localhost, but I did not measure that. Week/Month latencies are in the table above (server side).

## E. Security claims (claim, implementation, tests)

| Claim | Implementation | Tests that prove it |
|---|---|---|
| JWT in httpOnly cookie, SameSite=Strict, Path=/api, 1 day | `server/domain/session.js` `cookieOptions`, `controllers/loginController.js` | `session.test.js`: "is HttpOnly, SameSite=Strict, limited to /api and lasts a day"; "is not set for a failed sign-in"; mutations 11 to 14 |
| bcrypt hashing | `server/models/loginModel.js` (bcrypt, dummy hash for unknown emails) | `auth.test.js`: "creates a user and stores a hash, not the password" (hash matches `^$2[aby]$`); "gives the same answer for a wrong password and an unknown email" |
| Token revocation | `users.token_version` (migration 008), `middleware/auth.js`, `sessionController.logout` | `session.test.js`: "clears the cookie, and the old cookie and old bearer token stop working"; "also ends the extension's token"; "rejects a token whose version is not the user's current one"; account deletion test; mutations 1, 2, 10, 15 |
| CSRF protection | `X-Requested-With: dt` required for cookie-authenticated writes, `middleware/auth.js`; CORS allowlist with credentials | `session.test.js` "the cookie needs the X-Requested-With header to change anything" (5 tests); CORS tests; mutations 6 to 8, 23 |
| Extension token is least-privilege | scope `ingest`, accepted only by `authenticateIngest` on `POST /intervals` and `GET /is-tracking` | the **16-row** `it.each` table: summary, range, sites (GET and PUT), settings (GET and PUT), start, stop, export (JSON and CSV), delete data, delete account, `/auth/me`, logout, extension-token, analytics: each returns 403 "Insufficient scope". Plus "can upload visits and read whether tracking is on" (the 2 allowed routes). Mutations 3, 4, 5, 17, 22 |

Scope note: on `main` the table has 16 rows and misses the newer `/notifications/settings` routes. On this branch the two notification
routes replaced the removed analytics row, so the table has **17** rows and covers every user-only route.

## F. Ingestion (batched, UUID-deduplicated uploads make retries safe)

- Batch size 50 on both sides: extension `BATCH_SIZE = 50` (`extension/background.js`), server `intervals: z.array(...).min(1).max(50)`
  (`server/validation/schemas.js`). Client-generated UUID per visit (`clientEventId`). Unique index `uq_tab_activity_user_event`
  on `(user_id, client_event_id)` (migration 003) and `INSERT ... ON CONFLICT DO NOTHING` (`server/models/tabModel.js`).
- Existing tests: re-uploading the same batch stores nothing new; a partly overlapping batch stores only the new part; ids are
  scoped per user (`server/test/intervals.test.js`); the extension keeps visits offline and uploads each exactly once.
- **Gaps found and closed by new tests** (all pass; each was checked by deliberately breaking the code and watching it fail):
  `intervals.test.js` "accepts a full batch of 50 and refuses 51"; "a retry after a lost response leaves the totals exact" (same batch
  sent 3 times: exactly 2 visits and 120 s); `background.test.mjs` "uploads a long backlog in batches of 50, oldest first" (120 queued
  gives batches 50, 50, 20) and "when the server fails part-way through a backlog, keeps the rest and later sends each visit exactly once".
  The harness now records batch sizes and can fail after N batches.

## G. CI

`.github/workflows/ci.yml`, triggered on push to `main` and on pull requests, Node 22, concurrency cancellation:
1. **Server tests**: PostgreSQL 17 service container, `npm ci`, `npm test`.
2. **Client**: `npm ci`, lint, typecheck, tests, production build.
3. **Extension tests**: `node --test "test/*.test.mjs"`.
4. **Dependency audit**: `npm audit --omit=dev --audit-level=high`, for server and client (a matrix of two).
`gh run list` shows the last five runs on `main` all succeeded; latest URL above.

## H. Smaller checks

- **Build time:** six minutes (above). README fixed.
- **Endpoints:** on `main`, 28 route handlers under `server/routes/` (`grep` of `router.get|post|put|delete`) = 21 current + 7 legacy
  (5 in `analyticsRoute.js`, 2 in `statBlockRoute.js`). The legacy 7 are now removed, so the branch has **21** (20 API endpoints plus
  the health check). The README table listed 18 of the 21; `/auth/me`, `/auth/logout` and `/auth/extension-token` were missing and
  are now added.
- **Stack line:** TypeScript: **client only** (96 `.ts/.tsx` files there; server has none, extension has none). Server and extension: JavaScript.
  Tailwind CSS 4.1 (client). Docker: genuinely used (`docker-compose.yml` with `db`, `api`, `web` services and healthchecks; Dockerfiles in
  `server/` and `client/`). Express 5.1, PostgreSQL 17, JWT, Manifest V3 all confirmed in code. Nothing to remove, one qualifier to add.
- **The 7 legacy endpoints: removed** (your approval). Deleted `routes/analyticsRoute.js`, `routes/statBlockRoute.js`,
  `test/analytics.test.js` (27 tests); `models/analyticsModel.js` moved to `scripts/bench/rewritten.js` (SQL only) so the benchmark still
  runs. Two tests that used an analytics URL as a convenient route now use `/api/settings` (the 500 test) and the notification
  routes (the authorization table). The removed tests also exercised the time-zone rules used by every other endpoint, so
  `test/timezone.test.js` (6 tests) now covers them directly; without it `validation/timezone.js` dropped to 81% coverage.
  Trade-off: the optimisation claim now rests on the benchmark scripts, not on live endpoints.

## Recommended final resume wording

- *Full-stack platform:* "Built a full-stack browsing-analytics platform: Chrome extension (Manifest V3), React/TypeScript dashboard, and an Express.js/PostgreSQL API; visits upload in batches of up to 50 with client-generated UUIDs and a database unique constraint, so retries never double-count (covered by tests for repeated, overlapping, lost-response and part-way-failed uploads)."
- *Performance:* "Cut the original dashboard's analytics queries from about 400 ms to about 12 ms (33x, sum of p50 over seven queries on 1M synthetic rows, PostgreSQL 17) by adding a composite index and rewriting date filters as range queries; showed that neither change helps alone." Do not use 206x.
- *Security and quality:* "Hardened authentication with httpOnly SameSite=Strict cookie sessions, bcrypt, server-side token revocation, CSRF protection and a least-privilege extension token (17-route authorization test table; 23 of 23 deliberate auth-logic breaks caught); 991 automated tests (95% server and 94% client line coverage) run in a 4-job GitHub Actions pipeline." Use the `main` figures (986 tests, 16 routes) until the branch is merged.
- *Stack line:* React, TypeScript (client), Tailwind CSS, Node.js, Express.js, PostgreSQL, Manifest V3, JWT, Docker. All backed.

## I. Questions only you can answer

1. How many real users or installs does it have (even just you and friends), and is there any real-usage data? Nothing in the repo shows any.
2. Do you want a hosted demo or Chrome Web Store listing? Not built. Effort, if yes: **a day or two for a hosted demo and a week or
   more of elapsed time for the store.** Needed: HTTPS and one site for the API and dashboard (the cookie is SameSite=Strict, so they must
   share a registrable domain); a hosted PostgreSQL; making the extension's API URL and `externally_connectable` configurable (both are
   fixed to localhost); a privacy policy, because the extension records full URLs and needs the `tabs` permission, which slows store review;
   the one-off store developer fee. I have not planned or started any of it.
3. Do you want the local-PostgreSQL benchmark run later, to explain the 206x gap? (You said to leave it.)
4. Do you want a coverage threshold in CI, so a drop fails the build?
5. May I commit the work on `evidence/resume-metrics`? Nothing is committed yet. After a push, check that the CI run is green
   (the workflow change cannot be tested locally).
