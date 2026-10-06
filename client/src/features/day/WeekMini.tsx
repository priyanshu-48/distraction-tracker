import { formatDuration } from "@/lib/format";
import { formatShortDay } from "@/lib/period";
import type { DaySummary } from "./types";

const HEIGHT = 96;

/** The last seven days as bars against the budget: teal within it, coral over it, the viewed day (the last) bright. */
export function WeekMini({ days, budgetSeconds }: { days: DaySummary["recentDays"]; budgetSeconds: number }) {
  const top = Math.max(budgetSeconds, ...days.map((day) => day.distractedSeconds), 1);
  const label = (date: string) => formatShortDay(date).slice(0, 3);

  return (
    <figure>
      <figcaption className="text-xs font-medium tracking-wide text-ink-muted uppercase">Last 7 days</figcaption>
      <div className="relative mt-3" style={{ height: HEIGHT }} aria-hidden="true">
        <div className="absolute inset-x-0 border-t border-dashed border-ink-muted" style={{ bottom: `${(budgetSeconds / top) * 100}%` }} />
        <div className="relative flex h-full items-end gap-2">
          {days.map((day, index) => {
            const percent = (day.distractedSeconds / top) * 100;
            const viewed = index === days.length - 1;
            return (
              <div key={day.date} className="flex h-full flex-1 items-end rounded-sm bg-raised/30" title={`${formatShortDay(day.date)}: ${formatDuration(day.distractedSeconds)}`}>
                <div
                  className={`w-full rounded-sm ${day.distractedSeconds > budgetSeconds ? "bg-coral" : "bg-teal"} ${viewed ? "" : "opacity-55"}`}
                  style={{ height: `${day.distractedSeconds > 0 ? Math.max(percent, 3) : 0}%` }}
                />
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-1 flex gap-2 text-xs text-ink-muted" aria-hidden="true">
        {days.map((day) => (
          <span key={day.date} className="flex-1 text-center">
            {label(day.date)}
          </span>
        ))}
      </div>
      {/* The wrapper is what is hidden: a table with sr-only on it is not clipped and widens the page on a phone. */}
      <div className="sr-only">
        <table>
          <caption>Distraction time in the last 7 days, against a budget of {formatDuration(budgetSeconds)}</caption>
          <thead>
            <tr>
              <th scope="col">Day</th>
              <th scope="col">Distractions</th>
            </tr>
          </thead>
          <tbody>
            {days.map((day) => (
              <tr key={day.date}>
                <th scope="row">{formatShortDay(day.date)}</th>
                <td>{day.trackedSeconds === 0 ? "not tracked" : formatDuration(day.distractedSeconds)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
