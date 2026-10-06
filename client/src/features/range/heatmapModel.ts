import { formatDurationCoarse } from "@/lib/format";

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
export const HEAT_LEVELS = 4;

export interface HeatCell {
  /** 0 is Monday. */
  dow: number;
  hour: number;
  seconds: number;
  /** 0 for nothing, otherwise 1 to HEAT_LEVELS in proportion to the busiest cell (anything above zero is at least 1). */
  level: number;
}

const pad = (hour: number) => String(hour).padStart(2, "0");

/** "10:00 to 11:00" */
export const hourRange = (hour: number) => `${pad(hour)}:00 to ${pad(hour + 1)}:00`;

/**
 * Turns the server's 7 x 24 grid of distraction seconds into cells with an intensity level, plus the busiest cell
 * and the five busiest. Missing rows or cells count as zero, so a short or empty grid never throws.
 */
export function heatmapModel(grid: number[][]) {
  const cells: HeatCell[] = [];
  let max = 0;
  for (let dow = 0; dow < 7; dow++) {
    for (let hour = 0; hour < 24; hour++) {
      const seconds = Math.max(0, grid[dow]?.[hour] ?? 0);
      max = Math.max(max, seconds);
      cells.push({ dow, hour, seconds, level: 0 });
    }
  }
  for (const cell of cells) {
    cell.level = cell.seconds === 0 ? 0 : Math.min(HEAT_LEVELS, Math.ceil((cell.seconds / max) * HEAT_LEVELS));
  }
  // busiest first; the sort is stable and the cells are in weekday then hour order, so a tie goes to the earlier one
  const busiest = cells.filter((cell) => cell.seconds > 0).sort((a, b) => b.seconds - a.seconds);
  return { cells, max, peak: busiest[0] ?? null, top: busiest.slice(0, 5) };
}

/** "Most distraction time: Thursday 10:00 to 11:00 (23m)." A month adds up several of the same weekday, so it says "Thursdays". */
export function peakSentence(peak: HeatCell | null, plural: boolean): string | null {
  if (!peak) return null;
  return `Most distraction time: ${WEEKDAYS[peak.dow]}${plural ? "s" : ""} ${hourRange(peak.hour)} (${formatDurationCoarse(peak.seconds)}).`;
}
