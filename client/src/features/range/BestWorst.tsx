import { StatTile } from "@/components/ui/stat-tile";
import { formatDurationCoarse } from "@/lib/format";
import { formatShortDay } from "@/lib/period";
import type { RangeSummary } from "./types";

/** The calmest and the hardest tracked day, shown only when there are at least two different ones to compare. */
export function BestWorst({ best, worst }: Pick<RangeSummary, "best" | "worst">) {
  if (!best || !worst) return null;
  return (
    <div className="grid grid-cols-2 gap-4">
      <StatTile label="Best day" value={best.distractedSeconds === 0 ? "None" : formatDurationCoarse(best.distractedSeconds)} hint={formatShortDay(best.date)} />
      <StatTile label="Hardest day" value={formatDurationCoarse(worst.distractedSeconds)} hint={formatShortDay(worst.date)} />
    </div>
  );
}
