# Accessibility scan

An automated scan of every screen of the dashboard, the problems it found, and what was fixed. Run on 2026-10-18 at commit
`020051f` (before) and `2f163f5` (after).

## Method

- **Tool:** axe-core 4.14.0, injected into the page in a real Chrome-based browser (1440x900, the app's one dark theme). It was
  installed in a scratch folder and served from `localhost`, so it is not a dependency of the project.
- **Data:** a throwaway PostgreSQL database with 3,000 seeded visits over 30 days (`server/scripts/seed.js --rows 3000 --users 1
  --days 30`) and four sites marked as distractions. Dropped afterwards.
- **Colour contrast:** axe reported white behind text that is visibly on a dark panel (it cannot always resolve backgrounds), so every
  contrast finding was re-checked with `docs/evidence/a11y-scan.js`, which walks up the real computed colours. A finding only counted
  if both methods agreed.
- **"Needs review" items** (axe's `incomplete`) were checked by hand, not ignored. Two of them turned out to be real defects.
- To reproduce: serve `axe.min.js` and `a11y-scan.js` from a local static server, load both into the page, then run `await __scan()`.

## Results

| Screen | Before | After |
|---|---|---|
| Sign in | No violations. 4 contrast flags from axe, all false (real ratios about 6.7:1 and 10:1) | unchanged |
| Create account | No violations. 3 contrast flags, all false | unchanged |
| Day | No violations. 4 items to review: `aria-label` on a plain `<span>` | 0 violations, 0 to review |
| Week | 8 of the same | 0 violations, 0 to review |
| Month | 7 of the same | 0 violations, 0 to review |
| Sites panel | 5 duplicate ids; **5 of 20 switches had no accessible name**; 6 `aria-hidden-focus` | 0 duplicate ids, 0 unnamed switches; the 6 `aria-hidden-focus` remain (see below) |
| Settings panel | 6 `aria-hidden-focus` | unchanged (see below) |

## Real problems found and fixed

1. **Switches without a name.** The same site can be on the page twice: in the Day view's top distractions and in the Sites panel
   in front of it. Both switches had a label tied to the id `mark-<domain>`, and a label resolves to the first element with that id,
   which is the one behind the panel. The panel's copy had no accessible name, so a screen reader would say "switch" and nothing
   else. Each switch now carries its own `aria-label` (`SiteRow.tsx`, `MarkSwitch.tsx`). Axe filed this only as "needs review"; the
   missing names were confirmed by reading `element.labels` on each switch.
2. **Comparisons announced unreliably.** "▲ 24m vs usual" had an `aria-label` on a plain `<span>`, which is not reliably announced,
   so a screen reader could read the arrow's name instead. A new `Delta` component hides the arrow text from assistive technology and
   gives it the sentence as real text ("24m more than usual").

## Left alone on purpose

`aria-hidden-focus` (6 on the Sites and Settings panels): while a panel is open the dialog library marks the page behind it
`aria-hidden` and traps focus inside the panel, so those controls cannot be reached. Axe lists this for review on any such modal.
It is the standard modal pattern, not a defect.

## Tests added

`delta.test.tsx` (4 tests) and a stricter switch-name test in `sites.test.tsx` (the same site rendered twice through both
components, so a label-and-id in either one fails). All five original defects were put back one at a time and each was caught.

## What this does not cover

Automated tools find only a share of real accessibility problems. Not done: testing with a real screen reader, a keyboard-only
walk through every control, 200% zoom and reflow, reduced-motion settings, or the phone layout (the scan ran at desktop width).
