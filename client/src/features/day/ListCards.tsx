import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { formatDuration } from "@/lib/format";
import { MarkSwitch } from "@/features/sites/MarkSwitch";
import { useMarkSite } from "@/features/sites/queries";
import { siteInfo } from "@/lib/siteInfo";
import { SiteName } from "@/features/sites/SiteName";
import { siteDelta } from "./insight";
import type { DaySummary } from "./types";

const muted = "text-sm text-ink-muted";

/** The sites you marked as distractions, biggest first, each with how it was used. */
export function TopSitesCard({
  sites,
  onOpenSites,
  pinned,
  onHover,
  onPick,
}: {
  sites: DaySummary["topSites"];
  onOpenSites: () => void;
  /** The site picked to light up on the timeline, if any. Hovering or focusing a row lights it up briefly. */
  pinned: string | null;
  onHover: (domain: string | null) => void;
  onPick: (domain: string) => void;
}) {
  const biggest = Math.max(1, ...sites.map((site) => site.seconds));
  return (
    <Card>
      <CardTitle>Top distractions</CardTitle>
      {sites.length === 0 ? (
        <div className="mt-3 space-y-3">
          <p className={muted}>No site you marked as a distraction was visited.</p>
          <Button variant="secondary" size="sm" onClick={onOpenSites}>
            Manage sites
          </Button>
        </div>
      ) : (
        <ul className="mt-3 space-y-4">
          {sites.map((site) => {
            const delta = siteDelta(site.seconds, site.usualSeconds);
            return (
            <li key={site.domain} onMouseEnter={() => onHover(site.domain)} onMouseLeave={() => onHover(null)}>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  aria-pressed={pinned === site.domain}
                  title={`${site.domain}. Show on the timeline`}
                  onClick={() => onPick(site.domain)}
                  onFocus={() => onHover(site.domain)}
                  onBlur={() => onHover(null)}
                  className="min-w-0 flex-1 cursor-pointer truncate rounded-md text-left font-semibold underline-offset-4 hover:underline aria-pressed:underline"
                >
                  <SiteName domain={site.domain} />
                </button>
                {site.type === "checking" ? <Badge tone="purple">checking habit</Badge> : null}
                {site.type === "binge" ? <Badge tone="coral">binge</Badge> : null}
                <MarkSwitch domain={site.domain} marked />
              </div>
              <div className="mt-1.5 h-2 rounded-full bg-raised" aria-hidden="true">
                <div className="h-2 rounded-full bg-coral" style={{ width: `${(site.seconds / biggest) * 100}%` }} />
              </div>
              <p className={`${muted} mt-1`}>
                {formatDuration(site.seconds)} · {site.visits} {site.visits === 1 ? "visit" : "visits"} · avg {formatDuration(site.avgSeconds)}
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

/** "github.com to reddit.com, 5 times": what you were on right before you drifted. */
export function TriggersCard({ triggers }: { triggers: DaySummary["triggers"] }) {
  return (
    <Card>
      <CardTitle>What set it off</CardTitle>
      {triggers.length === 0 ? (
        <p className={`${muted} mt-3`}>Not enough yet. This fills in once you have marked some sites and browsed for a while.</p>
      ) : (
        <>
          <ul className="mt-3 space-y-2">
            {triggers.map((trigger) => (
              <li key={`${trigger.from}>${trigger.to}`} className="flex items-center gap-2 text-sm">
                <SiteName domain={trigger.from} className="max-w-[40%]" />
                <ArrowRight aria-label="then" className="size-4 shrink-0 text-ink-muted" />
                <SiteName domain={trigger.to} className="flex-1 font-semibold" />
                <span className="shrink-0 text-ink-muted">{trigger.count}×</span>
              </li>
            ))}
          </ul>
          <p className={`${muted} mt-3`}>Last 7 days.</p>
        </>
      )}
    </Card>
  );
}

const SHOWN_AT_FIRST = 8;

/** Newest visits first, in the user's own clock, each with the same mark switch. */
export function RecentVisits({ visits, timeZone }: { visits: DaySummary["recent"]; timeZone: string }) {
  const [all, setAll] = useState(false);
  const clock = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone });
  const shown = all ? visits : visits.slice(0, SHOWN_AT_FIRST);

  return (
    <Card>
      <CardTitle>Recent visits</CardTitle>
      {visits.length === 0 ? (
        <p className={`${muted} mt-3`}>No visits recorded.</p>
      ) : (
        <>
          <ul className="mt-3 space-y-2">
            {shown.map((visit) => (
              <li key={visit.startedAt + visit.domain} className="flex items-center gap-3">
                <span className="w-12 shrink-0 text-sm text-ink-muted">{clock.format(new Date(visit.startedAt))}</span>
                <SiteName domain={visit.domain} className="flex-1" />
                <span className="shrink-0 text-sm text-ink-muted">{formatDuration(visit.seconds)}</span>
                <MarkSwitch domain={visit.domain} marked={visit.marked} />
              </li>
            ))}
          </ul>
          {visits.length > SHOWN_AT_FIRST ? (
            <Button variant="ghost" size="sm" className="mt-3" onClick={() => setAll(!all)}>
              {all ? "Show fewer" : `Show all ${visits.length}`}
            </Button>
          ) : null}
        </>
      )}
    </Card>
  );
}

/**
 * Unmarked sites with the most time: one tap to start counting them as distractions. A marked site leaves the
 * list straight away, so the card says what just happened and offers to undo it. Marking is retroactive (the
 * flag is applied when a day is read), and the card says so.
 */
export function ClassifyCard({ sites }: { sites: DaySummary["toClassify"] }) {
  const [justMarked, setJustMarked] = useState<string | null>(null);
  const unmark = useMarkSite();
  if (sites.length === 0 && !justMarked) return null;

  return (
    <Card>
      <CardTitle>To classify</CardTitle>
      <p className={`${muted} mt-1`}>Switch on the ones that pull you away. This also changes past days.</p>
      {justMarked ? (
        <p role="status" className="mt-3 flex flex-wrap items-center gap-x-2 text-sm">
          <span>Counting {siteInfo(justMarked).name} as a distraction.</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              unmark.mutate({ domain: justMarked, marked: false });
              setJustMarked(null);
            }}
          >
            Undo
          </Button>
        </p>
      ) : null}
      <ul className="mt-3 space-y-2">
        {sites.map((site) => (
          <li key={site.domain} className="flex items-center gap-3">
            <SiteName domain={site.domain} className="flex-1" />
            <span className="shrink-0 text-sm text-ink-muted">{formatDuration(site.seconds)}</span>
            <MarkSwitch domain={site.domain} marked={false} onChange={(marked) => setJustMarked((current) => (marked ? site.domain : current === site.domain ? null : current))} />
          </li>
        ))}
      </ul>
    </Card>
  );
}
