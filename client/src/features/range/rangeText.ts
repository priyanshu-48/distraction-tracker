import { formatDurationCoarse } from "@/lib/format";
import type { RangeSummary } from "./types";

/** Within this much of the previous period's number it counts as "about the same". */
const SAME_WITHIN = 0.05;
const against = { week: "last week", month: "last month" } as const;

/**
 * One calm sentence comparing the period with the one before it, or null if the previous period had nothing
 * tracked. A period still going is compared over the same days ("same days"), which the server already cut to
 * length, so a half-finished week is not set against a whole one.
 */
export function comparisonLine(summary: Pick<RangeSummary, "view" | "end" | "through" | "totals" | "previous">): string | null {
  if (summary.previous.daysTracked === 0) return null;
  const now = summary.totals.distractedSeconds;
  const before = summary.previous.distractedSeconds;
  const to = against[summary.view] + (summary.through < summary.end ? ", same days" : "");

  const difference = now - before;
  // five percent, but never tighter than a minute
  if (Math.abs(difference) < Math.max(60, before * SAME_WITHIN)) return `About the same as ${to}.`;
  return difference < 0
    ? `${formatDurationCoarse(-difference)} less than ${to}.`
    : `${formatDurationCoarse(difference)} more than ${to}.`;
}

/** The streak's length as the hero words it ("4 days", under a "Streak" label): only for a period that includes today, and only if there is one. */
export function streakText(streak: RangeSummary["streak"], isCurrent: boolean): string | null {
  if (!isCurrent || streak.current === 0) return null;
  return `${streak.current} ${streak.current === 1 ? "day" : "days"}`;
}
