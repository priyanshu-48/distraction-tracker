import { Card, CardTitle } from "@/components/ui/card";
import { formatDurationCoarse } from "@/lib/format";
import { formatShortDay } from "@/lib/period";
import { slipSentence, slipSummary } from "./trend";
import type { RangeSummary } from "./types";

const HEIGHT = 96;

/**
 * How soon after you start a session you first slip, one bar per day: taller is better (you held out longer).
 * A day with no distraction, or nothing tracked, has no bar. Hidden when no day has a value at all.
 */
export function FirstDistractionTrend({ days, through }: { days: RangeSummary["days"]; through: string }) {
  const summary = slipSummary(days);
  if (!summary) return null;
  const top = Math.max(...days.map((day) => day.firstDistractionAfterSeconds ?? 0), 1);
  const dense = days.length > 10;
  const label = (date: string, index: number) => {
    if (!dense) return formatShortDay(date).slice(0, 3);
    const day = +date.slice(8);
    return day % 5 === 1 || index === days.length - 1 ? String(day) : "";
  };

  return (
    <Card>
      <CardTitle>How soon you slip</CardTitle>
      <p className="mt-2">{slipSentence(summary)}</p>
      <p className="mt-1 text-sm text-ink-muted">Median time from starting a session to the first distraction. Taller is better.</p>

      <div className={`mt-4 flex items-end ${dense ? "gap-0.5" : "gap-2"}`} style={{ height: HEIGHT }} aria-hidden="true">
        {days.map((day) => {
          const value = day.firstDistractionAfterSeconds;
          return (
            <div
              key={day.date}
              className={`flex h-full min-w-0 flex-1 items-end rounded-sm bg-raised/30 ${day.date > through ? "opacity-40" : ""}`}
              title={`${formatShortDay(day.date)}: ${value === null ? "no first distraction" : formatDurationCoarse(value)}`}
            >
              {value === null ? null : (
                <span className="block w-full rounded-sm bg-teal" style={{ height: `${Math.max((value / top) * 100, 4)}%` }} />
              )}
            </div>
          );
        })}
      </div>
      <div className={`mt-1 flex text-xs text-ink-muted ${dense ? "gap-0.5" : "gap-2"}`} aria-hidden="true">
        {days.map((day, index) => (
          <span key={day.date} className="flex-1 text-center">
            {label(day.date, index)}
          </span>
        ))}
      </div>

      {/* A wrapper is hidden, not the table: a table with sr-only on it is not clipped and widens a phone page. */}
      <div className="sr-only">
        <table>
          <caption>Time from starting a session to the first distraction, by day</caption>
          <thead>
            <tr>
              <th scope="col">Day</th>
              <th scope="col">First distraction after</th>
            </tr>
          </thead>
          <tbody>
            {days
              .filter((day) => day.date <= through)
              .map((day) => (
                <tr key={day.date}>
                  <th scope="row">{formatShortDay(day.date)}</th>
                  <td>{day.firstDistractionAfterSeconds === null ? "none" : formatDurationCoarse(day.firstDistractionAfterSeconds)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
