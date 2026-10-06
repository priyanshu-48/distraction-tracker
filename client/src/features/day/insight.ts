import { formatDurationCoarse } from "@/lib/format";
import { weekdayName } from "@/lib/period";
import type { DaySummary } from "./types";

/** Within this much of the usual number it counts as "about your usual". */
const SAME_WITHIN = 0.05;

/** "Usual by now" is an average, so it needs a couple of earlier days behind it before it is shown. */
export const MIN_PACE_DAYS = 2;

/** What the day usually had built up by this time of day, or null if the day is over or the history is too thin. */
export function paceFor(usual: DaySummary["usual"], inProgress: boolean): number | null {
  return inProgress && usual.days >= MIN_PACE_DAYS ? usual.paceSeconds : null;
}

/**
 * One calm sentence comparing a day with what that weekday usually looks like, or null if there is nothing
 * fair to say. A day that is still going is not compared as a difference (it would look better than it is),
 * so it shows what has happened so far next to the usual full day.
 */
export function usualLine(summary: Pick<DaySummary, "date" | "totals" | "usual">, inProgress: boolean): string | null {
  const now = summary.totals.distractedSeconds;
  const usual = summary.usual.distractedSeconds;
  if (!usual) return null; // no history, or a usual of nothing: no fair comparison

  const weekday = weekdayName(summary.date);
  const pace = paceFor(summary.usual, inProgress);
  if (pace !== null) {
    // the same tolerance as a finished day, but never tighter than a minute
    if (Math.abs(now - pace) < Math.max(60, pace * SAME_WITHIN)) return "About what's usual by now.";
    return now < pace
      ? `${formatDurationCoarse(pace - now)} less than usual by now.`
      : `${formatDurationCoarse(now - pace)} more than usual by now.`;
  }
  if (inProgress) return `${formatDurationCoarse(now)} so far. Your usual ${weekday} is ${formatDurationCoarse(usual)}.`;

  if (Math.abs(now - usual) / usual < SAME_WITHIN) return `About your usual ${weekday}.`;
  return now < usual
    ? `${formatDurationCoarse(usual - now)} less than your usual ${weekday}.`
    : `${formatDurationCoarse(now - usual)} more than your usual ${weekday}.`;
}

/** Under this a difference is noise, not "more" or "less". */
const NOTICEABLE_SECONDS = 60;

/** "▲ 20m vs usual" for one site, or null when there is no history or the difference is under a minute. */
export function siteDelta(seconds: number, usualSeconds: number | null): { text: string; spoken: string; more: boolean } | null {
  if (usualSeconds === null) return null;
  const diff = seconds - usualSeconds;
  if (Math.abs(diff) < NOTICEABLE_SECONDS) return null;
  const amount = formatDurationCoarse(Math.abs(diff));
  return diff > 0
    ? { text: `▲ ${amount} vs usual`, spoken: `${amount} more than usual`, more: true }
    : { text: `▼ ${amount} vs usual`, spoken: `${amount} less than usual`, more: false };
}
