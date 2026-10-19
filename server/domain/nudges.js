// The in-the-moment nudge (decisions.md, D-48). Pure: no database, no clock of its own, so every rule can be tested.
import { formatDuration } from "./budgetAlerts.js";

export const NUDGE = Object.freeze({
  /** Opening the same marked site this many times (the current open included) within the window counts as repeat checking. */
  REPEAT_OPENS: 5,
  REPEAT_WINDOW_MINUTES: 30,
  /** After a nudge about a site, whether it was shown or held out, stay quiet about that site for this long. */
  COOLDOWN_MINUTES: 10,
  /** Share of would-be nudges that are recorded but deliberately not shown, so "did nudges help?" has a comparison group. */
  HOLDOUT_RATE: 0.2,
  /** Leaving the site within this many seconds of opening it counts as "left". */
  LEFT_WITHIN_SECONDS: 60,
  /** The two groups are only compared once each has at least this many nudges to look at. */
  MIN_PER_ARM: 5,
});

/**
 * A number in [0, 1) taken from the visit's UUID (its first 32 bits). The same visit always gets the same roll, so a retried
 * request gets the same decision, and a test chooses the outcome by choosing the id. It is not secret and need not be.
 */
export function holdoutRoll(visitId) {
  const n = Number.parseInt(String(visitId).replaceAll("-", "").slice(0, 8), 16);
  return Number.isNaN(n) ? 1 : n / 0x1_0000_0000;
}

/** The notification text. It names the site and numbers only, never a URL or a page title (same rule as the budget alerts). */
function nudgeText(kind, { site, distractedSeconds, budgetSeconds, opensInWindow }) {
  const used = budgetSeconds > 0 ? `${formatDuration(distractedSeconds)} of ${formatDuration(budgetSeconds)} used today.` : "";
  if (kind === "over-budget") {
    return {
      title: `Over budget, and you just opened ${site}`,
      body: `${used} Is this visit worth it?`.trim(),
    };
  }
  return {
    title: `${opensInWindow} visits to ${site} in ${NUDGE.REPEAT_WINDOW_MINUTES} minutes`,
    body: `${used} Checking again?`.trim(),
  };
}

/**
 * Should opening `site` now produce a nudge? Returns null (no), or { kind, shown, title, body }; `shown` is false for a held-out
 * nudge, which is recorded but not displayed. Order of the rules:
 *   1. cooldown: a recent nudge about this site (shown or not) silences everything, or held-out sites would re-roll every time;
 *   2. over budget (a budget of 0 or less never counts: it would mean "always over");
 *   3. repeat opens;
 *   4. the holdout, last, so it only ever thins out nudges that would otherwise have been shown.
 */
export function decideNudge({ site, distractedSeconds, budgetSeconds, opensInWindow, lastNudgeAt = null, now = new Date(), visitId }) {
  if (lastNudgeAt && now.getTime() - new Date(lastNudgeAt).getTime() < NUDGE.COOLDOWN_MINUTES * 60_000) return null;

  let kind = null;
  if (budgetSeconds > 0 && distractedSeconds >= budgetSeconds) kind = "over-budget";
  else if (opensInWindow >= NUDGE.REPEAT_OPENS) kind = "repeat";
  if (!kind) return null;

  return {
    kind,
    shown: holdoutRoll(visitId) >= NUDGE.HOLDOUT_RATE,
    ...nudgeText(kind, { site, distractedSeconds, budgetSeconds, opensInWindow }),
  };
}

/**
 * What the dashboard shows. `rows` are { shown, duration }: `duration` is the length in seconds of the visit the nudge was
 * decided for, or null when that visit never reached the server (still waiting to upload, or the browser was closed).
 * Those are counted as `unmatched` and left out of both groups. "Left" is a visit that lasted LEFT_WITHIN_SECONDS or less.
 * `comparable` is true only when both groups are big enough to compare.
 */
export function summarizeNudges(rows) {
  const out = { nudged: 0, shown: 0, shownLeft: 0, heldOut: 0, heldOutLeft: 0, unmatched: 0, comparable: false };
  for (const row of rows) {
    if (row.shown) out.nudged += 1;
    if (row.duration === null || row.duration === undefined) {
      out.unmatched += 1;
      continue;
    }
    const left = Number(row.duration) <= NUDGE.LEFT_WITHIN_SECONDS;
    if (row.shown) {
      out.shown += 1;
      if (left) out.shownLeft += 1;
    } else {
      out.heldOut += 1;
      if (left) out.heldOutLeft += 1;
    }
  }
  out.comparable = out.shown >= NUDGE.MIN_PER_ARM && out.heldOut >= NUDGE.MIN_PER_ARM;
  return out;
}
