import { StatTile } from "@/components/ui/stat-tile";
import { formatDurationCoarse } from "@/lib/format";
import type { DaySummary } from "./types";

const patternLabel = { checking: "checking habit", binge: "binge" } as const;

/** The two habit numbers: how often you reached for a distraction, and your longest clean stretch. */
export function DayTiles({ summary }: { summary: DaySummary }) {
  const { totals, focus } = summary;

  return (
    <div className="grid grid-cols-2 gap-4">
      <StatTile
        label="Distraction visits"
        value={totals.visits}
        hint={totals.visits ? (totals.type ? patternLabel[totals.type] : "marked sites") : "none yet"}
      />
      <StatTile
        label="Longest clean stretch"
        value={focus.longestStretchSeconds ? formatDurationCoarse(focus.longestStretchSeconds) : "–"}
        hint="without a distraction"
      />
    </div>
  );
}
