import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { formatDuration } from "@/lib/format";
import type { Site } from "./types";

interface SiteRowProps {
  site: Site;
  onToggle: (domain: string, marked: boolean) => void;
}

/** Grid shared with the header row in SitesPage so the columns line up on wide screens. */
export const ROW_GRID = "grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 md:grid-cols-[minmax(0,2fr)_1fr_1fr_1fr_8rem_6rem] md:items-center";

export function SiteRow({ site, onToggle }: SiteRowProps) {
  const switchId = `mark-${site.domain}`;
  return (
    <li className={`${ROW_GRID} rounded-xl bg-card px-4 py-3`}>
      <div className="min-w-0">
        <p className="truncate font-semibold" title={site.domain}>
          {site.domain}
        </p>
      </div>

      {/* Visually these are columns on wide screens and a single line on phones. */}
      <dl className="order-last col-span-2 flex flex-wrap gap-x-4 text-sm text-ink-muted md:contents">
        <div>
          <dt className="sr-only">Time</dt>
          <dd className="whitespace-nowrap text-ink">{formatDuration(site.seconds)}</dd>
        </div>
        <div>
          <dt className="sr-only">Visits</dt>
          <dd className="whitespace-nowrap text-ink">{site.visits} {site.visits === 1 ? "visit" : "visits"}</dd>
        </div>
        <div>
          <dt className="sr-only">Average visit</dt>
          <dd className="whitespace-nowrap text-ink">{site.visits ? `avg ${formatDuration(site.avgSeconds)}` : "no visits"}</dd>
        </div>
        <div>
          <dt className="sr-only">Pattern</dt>
          <dd>
            {site.type === "checking" ? <Badge tone="purple">checking habit</Badge> : null}
            {site.type === "binge" ? <Badge tone="coral">binge</Badge> : null}
          </dd>
        </div>
      </dl>

      <div className="flex items-center justify-end gap-3">
        <label htmlFor={switchId} className="sr-only">
          Count {site.domain} as a distraction
        </label>
        <Switch id={switchId} checked={site.marked} onCheckedChange={(marked) => onToggle(site.domain, marked)} />
      </div>
    </li>
  );
}
