import { Card, CardTitle } from "@/components/ui/card";
import { formatDuration, formatDurationCoarse } from "@/lib/format";
import { budgetBar } from "./bar";
import { paceFor, usualLine } from "./insight";
import type { DaySummary } from "./types";
import { WeekMini } from "./WeekMini";

/** The answer to "am I within my limit, and is that normal?": what is left, a bar, a usual-day line and the last 7 days. */
export function Hero({ summary, isToday }: { summary: DaySummary; isToday: boolean }) {
  const { distractedSeconds, trackedSeconds } = summary.totals;
  const pace = paceFor(summary.usual, isToday);
  const bar = budgetBar(distractedSeconds, summary.budgetSeconds, pace);
  const over = bar.overSeconds > 0;
  const headline = over ? `${formatDurationCoarse(bar.overSeconds)} over` : `${formatDurationCoarse(bar.leftSeconds)} left`;
  const usual = usualLine(summary, isToday);

  return (
    <Card className="grid gap-6 md:grid-cols-2 md:items-center">
      <div>
        <CardTitle>Distraction budget</CardTitle>
        <p className={`mt-2 text-4xl font-semibold tracking-tight ${over ? "text-coral" : ""}`}>{headline}</p>
        <p className="mt-1 text-sm text-ink-muted">
          {formatDuration(distractedSeconds)} of {formatDuration(summary.budgetSeconds)} · {formatDuration(trackedSeconds)} browsing
        </p>

        <div
          role="meter"
          aria-label="Distraction budget used"
          aria-valuemin={0}
          aria-valuemax={summary.budgetSeconds}
          aria-valuenow={Math.min(distractedSeconds, summary.budgetSeconds)}
          aria-valuetext={`${formatDuration(distractedSeconds)} of ${formatDuration(summary.budgetSeconds)}, ${headline}${pace === null ? "" : `, usually ${formatDurationCoarse(pace)} by now`}`}
          className="relative mt-4 h-3 rounded-full bg-raised"
        >
          <div className="absolute inset-y-0 left-0 rounded-l-full bg-teal" style={{ width: `${bar.withinFraction * 100}%` }} />
          {over ? (
            <>
              <div
                className="absolute inset-y-0 rounded-r-full bg-coral"
                style={{ left: `${bar.withinFraction * 100}%`, width: `${bar.overFraction * 100}%` }}
              />
              {/* The limit, so the part beyond it is easy to see. */}
              <div className="absolute -top-1 h-5 w-0.5 rounded-full bg-ink" style={{ left: `${bar.limitFraction * 100}%` }} />
            </>
          ) : null}
          {bar.paceFraction !== null ? (
            <div
              className="absolute -top-1 h-5 w-0.5 rounded-full bg-purple"
              style={{ left: `${bar.paceFraction * 100}%` }}
              title={`Usually ${formatDurationCoarse(pace ?? 0)} by now`}
            />
          ) : null}
        </div>
        {bar.paceFraction !== null ? (
          <p className="mt-2 flex items-center gap-2 text-xs text-ink-muted" aria-hidden="true">
            <span className="h-3 w-0.5 rounded-full bg-purple" /> usually {formatDurationCoarse(pace ?? 0)} by now
          </p>
        ) : null}

        {usual ? <p className="mt-3">{usual}</p> : null}
      </div>
      <WeekMini days={summary.recentDays} budgetSeconds={summary.budgetSeconds} />
    </Card>
  );
}
