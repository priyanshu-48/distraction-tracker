import { CalendarOff } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { BestWorst } from "./BestWorst";
import { FirstDistractionTrend } from "./FirstDistractionTrend";
import { Heatmap } from "./Heatmap";
import { useRangeSummary } from "./queries";
import { RangeHero } from "./RangeHero";
import { Movers, RangeTopSites } from "./RangeCards";
import type { RangeViewName } from "./types";

interface RangeViewProps {
  view: RangeViewName;
  date: string;
  /** What the period is called in the header ("5 to 11 Oct"). */
  label: string;
  /** The period includes today (so it is still going, and a streak is meaningful). */
  isCurrent: boolean;
  today: string;
  onOpenDay: (date: string) => void;
}

function Loading({ view }: { view: RangeViewName }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3" aria-busy="true" aria-label={`Loading the ${view}`}>
      <Skeleton className="h-56 rounded-(--radius-card) lg:col-span-3" />
      <Skeleton className="h-64 rounded-(--radius-card) lg:col-span-2" />
      <Skeleton className="h-64 rounded-(--radius-card)" />
    </div>
  );
}

/** A week or a month: how it went against the budget, day by day, which sites, and what changed. */
export function RangeView({ view, date, label, isCurrent, today, onOpenDay }: RangeViewProps) {
  const query = useRangeSummary(view, date, isCurrent);

  if (query.isPending) return <Loading view={view} />;
  if (query.isError) return <ErrorState title={`Couldn't load this ${view}`} onRetry={() => void query.refetch()} />;

  const summary = query.data;
  if (summary.totals.daysTracked === 0) {
    return (
      <EmptyState
        icon={<CalendarOff aria-hidden="true" />}
        title={`Nothing tracked ${isCurrent ? `yet this ${view}` : `in ${label}`}`}
        description={isCurrent ? "Press Start session and browse; your days fill in here as you go." : `No browsing was recorded in this ${view}.`}
      />
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="lg:col-span-3">
        <RangeHero summary={summary} label={label} isCurrent={isCurrent} today={today} onSelectDay={onOpenDay} />
      </div>
      <div className="lg:col-span-2">
        <RangeTopSites sites={summary.topSites} view={view} />
      </div>
      <div className="space-y-4">
        <Movers movers={summary.movers} view={view} />
        <BestWorst best={summary.best} worst={summary.worst} />
      </div>
      <div className="lg:col-span-2">
        <Heatmap heatmap={summary.heatmap} view={view} />
      </div>
      <FirstDistractionTrend days={summary.days} through={summary.through} />
    </div>
  );
}
