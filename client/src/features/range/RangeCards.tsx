import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { siteDelta } from "@/features/day/insight";
import { SiteName } from "@/features/sites/SiteName";
import { formatDuration, formatDurationCoarse } from "@/lib/format";
import type { RangeSummary } from "./types";

const muted = "text-sm text-ink-muted";

/** The distraction sites that took the most time in the period, each against what it was in the previous one. */
export function RangeTopSites({ sites, view }: { sites: RangeSummary["topSites"]; view: RangeSummary["view"] }) {
  const biggest = Math.max(1, ...sites.map((site) => site.seconds));
  const against = view === "week" ? "last week" : "last month";
  return (
    <Card>
      <CardTitle>Top distractions</CardTitle>
      {sites.length === 0 ? (
        <p className={`${muted} mt-3`}>No site you marked as a distraction was visited.</p>
      ) : (
        <ul className="mt-3 space-y-4">
          {sites.map((site) => {
            const delta = siteDelta(site.seconds, site.previousSeconds, against);
            return (
              <li key={site.domain}>
                <div className="flex items-center gap-3">
                  <SiteName domain={site.domain} className="flex-1 font-semibold" />
                  {site.type === "checking" ? <Badge tone="purple">checking habit</Badge> : null}
                  {site.type === "binge" ? <Badge tone="coral">binge</Badge> : null}
                </div>
                <div className="mt-1.5 h-2 rounded-full bg-raised" aria-hidden="true">
                  <div className="h-2 rounded-full bg-coral" style={{ width: `${(site.seconds / biggest) * 100}%` }} />
                </div>
                <p className={`${muted} mt-1`}>
                  {formatDurationCoarse(site.seconds)} · {site.visits} {site.visits === 1 ? "visit" : "visits"} · avg {formatDuration(site.avgSeconds)}
                  {delta ? (
                    <>
                      {" · "}
                      <span className={`whitespace-nowrap ${delta.more ? "text-coral" : "text-teal"}`} aria-label={delta.spoken}>
                        {delta.text}
                      </span>
                    </>
                  ) : null}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/** The sites whose time changed most against the previous period: where to look. Hidden when nothing moved. */
export function Movers({ movers, view }: { movers: RangeSummary["movers"]; view: RangeSummary["view"] }) {
  if (movers.up.length === 0 && movers.down.length === 0) return null;
  const against = view === "week" ? "last week" : "last month";
  const row = (m: RangeSummary["movers"]["up"][number], more: boolean) => (
    <li key={m.domain} className="flex items-center gap-3">
      <SiteName domain={m.domain} className="flex-1" />
      <span
        className={`shrink-0 text-sm whitespace-nowrap ${more ? "text-coral" : "text-teal"}`}
        aria-label={`${formatDurationCoarse(Math.abs(m.change))} ${more ? "more" : "less"} than ${against}`}
      >
        {more ? "▲" : "▼"} {formatDurationCoarse(Math.abs(m.change))}
      </span>
    </li>
  );

  return (
    <Card>
      <CardTitle>Biggest changes</CardTitle>
      <p className={`${muted} mt-1`}>Against {against}.</p>
      <ul className="mt-3 space-y-2">
        {movers.up.map((m) => row(m, true))}
        {movers.down.map((m) => row(m, false))}
      </ul>
    </Card>
  );
}
