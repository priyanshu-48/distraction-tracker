import { Card, CardTitle } from "@/components/ui/card";
import { formatDurationCoarse } from "@/lib/format";
import { HEAT_LEVELS, WEEKDAYS, heatmapModel, hourRange, peakSentence } from "./heatmapModel";
import type { RangeSummary } from "./types";

// Opacity of the coral square for each level; level 0 is a quiet track colour.
const OPACITY = [0, 0.3, 0.5, 0.75, 1];
const HOUR_LABELS = [0, 6, 12, 18];

/**
 * When distractions happen: a weekday by hour grid where a darker square is more time. Intensity is relative to the
 * busiest square, so it shows the shape of the week, not an amount. The sentence and the list of the busiest hours
 * are the text version; hovering a square gives its exact time.
 */
export function Heatmap({ heatmap, view }: { heatmap: RangeSummary["heatmap"]; view: RangeSummary["view"] }) {
  const { cells, peak, top } = heatmapModel(heatmap);
  if (!peak) return null;

  return (
    <Card>
      <CardTitle>When it happens</CardTitle>
      <p className="mt-2">{peakSentence(peak, view === "month")}</p>

      <div className="mt-4" aria-hidden="true">
        <div className="grid grid-cols-[2.25rem_repeat(24,minmax(0,1fr))] gap-0.5 text-xs text-ink-muted">
          <span />
          {Array.from({ length: 24 }, (_, hour) => (
            <span key={hour} className="relative h-4">
              {HOUR_LABELS.includes(hour) ? <span className="absolute left-0">{String(hour).padStart(2, "0")}</span> : null}
            </span>
          ))}
          {WEEKDAYS.map((weekday, dow) => (
            <div key={weekday} className="contents">
              <span className="self-center">{weekday.slice(0, 3)}</span>
              {cells
                .filter((cell) => cell.dow === dow)
                .map((cell) => (
                  <span
                    key={cell.hour}
                    title={`${weekday} ${hourRange(cell.hour)}: ${cell.seconds > 0 ? formatDurationCoarse(cell.seconds) : "nothing"}`}
                    className={`h-5 rounded-[3px] ${cell.level === 0 ? "bg-raised/40" : "bg-coral"}`}
                    style={cell.level === 0 ? undefined : { opacity: OPACITY[cell.level] }}
                  />
                ))}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2 text-xs text-ink-muted" aria-hidden="true">
        <span>Less</span>
        {Array.from({ length: HEAT_LEVELS + 1 }, (_, level) => (
          <span
            key={level}
            className={`size-3 rounded-[3px] ${level === 0 ? "bg-raised/40" : "bg-coral"}`}
            style={level === 0 ? undefined : { opacity: OPACITY[level] }}
          />
        ))}
        <span>More</span>
      </div>

      {/* The text version of the grid: its busiest hours. */}
      <div className="sr-only">
        <p>Busiest hours:</p>
        <ol>
          {top.map((cell) => (
            <li key={`${cell.dow}-${cell.hour}`}>
              {WEEKDAYS[cell.dow]} {hourRange(cell.hour)}: {formatDurationCoarse(cell.seconds)}
            </li>
          ))}
        </ol>
      </div>
    </Card>
  );
}
