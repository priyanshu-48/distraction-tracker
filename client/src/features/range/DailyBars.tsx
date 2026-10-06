import { formatDurationCoarse } from "@/lib/format";
import { formatShortDay } from "@/lib/period";
import type { RangeSummary } from "./types";

const HEIGHT = 112;

interface DailyBarsProps {
  days: RangeSummary["days"];
  budgetSeconds: number;
  /** Days after this one have not happened yet. */
  through: string;
  today: string;
  onSelectDay: (date: string) => void;
}

/**
 * One bar per day against the budget: teal within it, coral over it. Each bar is a button that opens that day.
 * A week labels every bar with its weekday; a month (many bars) labels every fifth day number.
 */
export function DailyBars({ days, budgetSeconds, through, today, onSelectDay }: DailyBarsProps) {
  const top = Math.max(budgetSeconds, ...days.map((day) => day.distractedSeconds), 1);
  const dense = days.length > 10;
  const label = (date: string, index: number) => {
    if (!dense) return formatShortDay(date).slice(0, 3);
    const day = +date.slice(8);
    return day % 5 === 1 || index === days.length - 1 ? String(day) : "";
  };

  return (
    <figure>
      <figcaption className="text-xs font-medium tracking-wide text-ink-muted uppercase">Each day</figcaption>
      <div className="relative mt-3" style={{ height: HEIGHT }}>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 border-t border-dashed border-ink-muted"
          style={{ bottom: `${(budgetSeconds / top) * 100}%` }}
        />
        <div role="group" aria-label="Distraction time for each day" className={`relative flex h-full items-end ${dense ? "gap-0.5" : "gap-2"}`}>
          {days.map((day) => {
            const future = day.date > through;
            const tracked = day.trackedSeconds > 0;
            const over = day.distractedSeconds > budgetSeconds;
            const percent = (day.distractedSeconds / top) * 100;
            const text = future
              ? "not yet"
              : tracked
                ? `${formatDurationCoarse(day.distractedSeconds)} of distractions${over ? ", over budget" : ""}`
                : "nothing tracked";
            return (
              <button
                key={day.date}
                type="button"
                disabled={future}
                aria-current={day.date === today ? "date" : undefined}
                aria-label={`${formatShortDay(day.date)}: ${text}`}
                title={`${formatShortDay(day.date)}: ${text}`}
                onClick={() => onSelectDay(day.date)}
                className={`flex h-full min-w-0 flex-1 items-end rounded-sm bg-raised/30 outline-offset-2 focus-visible:outline-2 focus-visible:outline-ink enabled:cursor-pointer enabled:hover:bg-raised/60 ${future ? "opacity-40" : ""}`}
              >
                <span
                  aria-hidden="true"
                  className={`block w-full rounded-sm ${over ? "bg-coral" : "bg-teal"}`}
                  style={{ height: `${day.distractedSeconds > 0 ? Math.max(percent, 3) : 0}%` }}
                />
              </button>
            );
          })}
        </div>
      </div>
      <div className={`mt-1 flex text-xs text-ink-muted ${dense ? "gap-0.5" : "gap-2"}`} aria-hidden="true">
        {days.map((day, index) => (
          <span key={day.date} className={`flex-1 text-center ${day.date === today ? "font-semibold text-ink" : ""}`}>
            {label(day.date, index)}
          </span>
        ))}
      </div>
    </figure>
  );
}
