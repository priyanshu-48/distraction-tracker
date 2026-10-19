# In-the-moment nudges: what was checked and what was not

Decision record: D-48 (local `decisions.md`). Extension 0.5.0.

## What it does
When a visit to a site the user marked starts, during a tracking session, and the extension's popup switch is on, the extension sends
`POST /api/nudges?tz=` with `{site, visit}` (the site name and the visit's id, never an address or title). The server answers with a
nudge when today's distraction time has reached the budget, or the site was opened 5 times in 30 minutes, and no nudge about that site
was decided in the last 10 minutes. 20% of would-be nudges are recorded but held back (the roll is taken from the visit id, so a retry
gets the same answer). The visit later uploads with the same id, so "left within a minute" is known without any extra traffic.

## Checked
| Check | Result |
|---|---|
| Decision rules as pure functions | `server/test/nudgesDomain.test.js` |
| Route: budget edge, repeat edge, cooldown (held-out rows count), `site_key` matching, session, holdout, retries, concurrency, auth, validation, export, erasure | `server/test/nudges.test.js` |
| Week/Month summary numbers | `server/test/range.test.js`, `client/src/features/range/NudgesCard.test.tsx` |
| Extension behaviour with a fake Chrome (off by default, only literal `true`, stale answer, failures, badge clearing) | `extension/test/background.test.mjs` |
| Real extension + real API + real database | `server/test/extensionFlow.test.js` (4 tests: shown, held back, switch off, unmarked site) |
| 18 deliberate breaks | all caught, `raw/nudges-mutations.txt` |

## Not checked, and limits
- Not tried in a real Chrome by the automated tooling (it cannot load the extension). Operating-system settings such as Windows Focus
  Assist can hide the notification while the badge still shows, so "shown" means "decided to show".
- The comparison is only as good as the numbers: for one person the groups are small, so the card says "not enough to compare yet"
  until each has at least 5 visits. It reports what happened, and does not claim the nudge caused it.
- The repeat trigger can over-fire if one stay is split into several stored visits (for example by going idle).
- A leaked extension token can weakly probe whether a site is marked and in trigger; it cannot read any data.
