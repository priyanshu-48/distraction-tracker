import { Card, CardTitle } from "@/components/ui/card";
import { formatDurationCoarse } from "@/lib/format";
import { DailyBars } from "./DailyBars";
import { comparisonLine, streakText } from "./rangeText";
import type { RangeSummary } from "./types";

interface RangeHeroProps {
  summary: RangeSummary;
  label: string;
  isCurrent: boolean;
  today: string;
  onSelectDay: (date: string) => void;
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}

/** How the period went: the total, the facts that matter (average, days under budget, streak), the comparison and a bar per day. */
export function RangeHero({ summary, label, isCurrent, today, onSelectDay }: RangeHeroProps) {
  const { totals } = summary;
  const comparison = comparisonLine(summary);
  const streak = streakText(summary.streak, isCurrent);
  const unit = totals.daysTracked === 1 ? "day" : "days";

  return (
    <Card className="grid gap-6 md:grid-cols-2 md:items-center">
      <div>
        <CardTitle>Distraction time</CardTitle>
        <p className="mt-2 text-4xl font-semibold tracking-tight">{formatDurationCoarse(totals.distractedSeconds)}</p>
        <p className="mt-1 text-sm text-ink-muted">
          {label} · {totals.daysTracked} {unit} tracked
        </p>

        <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-3 text-sm">
          <Fact label="Average per day" value={totals.avgDistractedSeconds === null ? "–" : formatDurationCoarse(totals.avgDistractedSeconds)} />
          <Fact label="Within budget" value={`${totals.daysUnderBudget} of ${totals.daysTracked} ${unit}`} />
          {streak ? <Fact label="Streak" value={streak} /> : null}
        </dl>

        {comparison ? <p className="mt-4">{comparison}</p> : null}
      </div>
      <DailyBars days={summary.days} budgetSeconds={summary.budgetSeconds} through={summary.through} today={today} onSelectDay={onSelectDay} />
    </Card>
  );
}
