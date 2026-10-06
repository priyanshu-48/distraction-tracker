import { useState } from "react";
import { CalendarOff } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { formatShortDay } from "@/lib/period";
import { DayTiles } from "./DayTiles";
import { Hero } from "./Hero";
import { ClassifyCard, RecentVisits, TopSitesCard, TriggersCard } from "./ListCards";
import { useDaySummary } from "./queries";
import { Timeline } from "./Timeline";
import type { DaySummary } from "./types";

interface DayViewProps {
  date: string;
  isToday: boolean;
  onOpenSites: () => void;
}

function Loading() {
  return (
    <div className="grid gap-4 lg:grid-cols-3" aria-busy="true" aria-label="Loading the day">
      <Skeleton className="h-56 rounded-(--radius-card)" />
      <Skeleton className="h-56 rounded-(--radius-card) lg:col-span-2" />
      <Skeleton className="h-40 rounded-(--radius-card) lg:col-span-3" />
    </div>
  );
}

/** One day: how it went against the budget, when, which sites, and what set them off. */
export function DayView({ date, isToday, onOpenSites }: DayViewProps) {
  const query = useDaySummary(date, isToday);

  if (query.isPending) return <Loading />;
  if (query.isError) return <ErrorState title="Couldn't load this day" onRetry={() => void query.refetch()} />;

  const summary = query.data;
  if (summary.totals.trackedSeconds === 0) {
    return (
      <EmptyState
        icon={<CalendarOff aria-hidden="true" />}
        title={`Nothing tracked on ${formatShortDay(date)}`}
        description={isToday ? "Press Start session and browse; your numbers appear here as you go." : "No browsing was recorded on this day."}
      />
    );
  }

  return <DayContent key={summary.date} summary={summary} isToday={isToday} nowMs={query.dataUpdatedAt} onOpenSites={onOpenSites} />;
}

interface DayContentProps {
  summary: DaySummary;
  isToday: boolean;
  nowMs: number;
  onOpenSites: () => void;
}

/** The loaded day. The site picked in the list is state here (reset for each day) so the list and the timeline can share it. */
function DayContent({ summary, isToday, nowMs, onOpenSites }: DayContentProps) {
  const [pinned, setPinned] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const pick = (domain: string) => setPinned((current) => (current === domain ? null : domain));

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="lg:col-span-3">
        <Hero summary={summary} isToday={isToday} />
      </div>
      <TopSitesCard sites={summary.topSites} onOpenSites={onOpenSites} pinned={pinned} onHover={setHovered} onPick={pick} />
      <div className="lg:col-span-2">
        <Timeline
          timeline={summary.timeline}
          timeZone={summary.timeZone}
          isToday={isToday}
          nowMs={nowMs}
          active={hovered ?? pinned}
          onHover={setHovered}
          onPick={pick}
        />
      </div>
      <div className="lg:col-span-3">
        <DayTiles summary={summary} />
      </div>
      <ClassifyCard sites={summary.toClassify} />
      <TriggersCard triggers={summary.triggers} />
      <RecentVisits visits={summary.recent} timeZone={summary.timeZone} />
    </div>
  );
}
