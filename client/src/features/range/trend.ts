import { formatDurationCoarse } from "@/lib/format";
import { weekdayName } from "@/lib/period";
import type { RangeSummary } from "./types";

/**
 * How soon after starting a session you usually slip, over the days that have a value (a day with no distraction,
 * or none tracked, has none). Longer is better. Null when no day has one.
 */
export function slipSummary(days: RangeSummary["days"]) {
  const values = days.filter((day) => day.firstDistractionAfterSeconds !== null) as Array<
    RangeSummary["days"][number] & { firstDistractionAfterSeconds: number }
  >;
  if (values.length === 0) return null;
  const average = Math.round(values.reduce((sum, day) => sum + day.firstDistractionAfterSeconds, 0) / values.length);
  // on a tie the earlier day is the "longest"
  const longest = values.reduce((best, day) => (day.firstDistractionAfterSeconds > best.firstDistractionAfterSeconds ? day : best), values[0]);
  return { count: values.length, averageSeconds: average, longest: { date: longest.date, seconds: longest.firstDistractionAfterSeconds } };
}

/** One calm sentence about it, or null when there is nothing to say. */
export function slipSentence(summary: ReturnType<typeof slipSummary>): string | null {
  if (!summary) return null;
  if (summary.count === 1) {
    return `On ${weekdayName(summary.longest.date)} it took ${formatDurationCoarse(summary.longest.seconds)} after you started.`;
  }
  return `Usually ${formatDurationCoarse(summary.averageSeconds)} after you start. Longest on ${weekdayName(summary.longest.date)} (${formatDurationCoarse(summary.longest.seconds)}).`;
}
