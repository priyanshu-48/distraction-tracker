# Why the production client build took about six minutes

Investigated 2026-10-18. Result: a performance problem in the Rollup version the lockfile pinned (4.64.0). Updating the lockfile to
Rollup 4.64.10 takes the build from about 350 seconds to about 5 seconds.

## What was measured

| Step | Result |
|---|---|
| Build time before, three runs on the laptop | 369 s, 349 s, 331 s (`raw/build-times.txt`) |
| Build step on GitHub's Linux CI, four recent runs | 244 s, 405 s, 321 s, 337 s. Every other step in the job (`npm ci`, lint, typecheck, tests with coverage) takes 2 to 21 s, so this is not a slow laptop or antivirus |
| Hypothesis 1: the icon library (`lucide-react` ships 1,810 icon files; the app uses 22). Build with only those 22 icons | 316 modules instead of 1,894, **still 311 s**. Refuted |
| CPU profile of that build (`raw/build-profile-summary.txt`) | 94% of the busy time inside Rollup's tree-shaking phase; 15 s garbage collection; Vite, Tailwind and PostCSS under 2 s together |
| Same build with Rollup 4.64.10 (4.64.0 before) | **4 s** (2.5 s as Vite reports it) |
| The real build (all 1,895 modules) with Rollup 4.64.10, three runs | 16.4 s (cold first run), 4.1 s, 4.3 s (`raw/build-times-fixed.txt`) |
| Clean clone, `npm ci` from the updated lockfile, then build | 8 s (`npm ci` took 31 s) |

## The fix

`npm update rollup` in `client/`: only Rollup and its 26 platform packages change in `package-lock.json` (4.64.0 to 4.64.10);
`package.json` is untouched, since Vite already allows `^4.34.9`. CI also gets `timeout-minutes: 3` on the build step, so a
return of the slowdown fails the build instead of quietly adding minutes.

## What this does not establish

- **Which patch release fixed it** was not found: I tested 4.64.0 (slow) and 4.64.10 (fast), not the nine in between.
- **No upstream report** was found for this exact slowdown (one web search). The conclusion rests on the profile and the before and
  after timings, not on a known issue.
- The slowdown may have been present earlier than 4.64.0: the old audit (P-07) recorded 3 min 25 s locally and 5 min 55 s in CI
  months ago, so it may have come from a different Rollup version or the same behaviour. Not checked.
- The lockfile pins the fixed version, but a fresh dependency resolution within `^4.34.9` could pick a slow release again. The CI
  timeout is the guard for that.
