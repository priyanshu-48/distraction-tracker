import { useEffect, useState } from "react";
import { Globe, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { useDebouncedValue } from "@/lib/hooks";
import { AddSiteForm } from "./AddSiteForm";
import { useMarkSite, useSites } from "./queries";
import { LIST_GRID, ROW_GRID, SiteRow } from "./SiteRow";
import type { RangeDays, SiteFilter, SiteSort } from "./types";

const PAGE_SIZE = 25;

const filterOptions = [
  { value: "all", label: "All" },
  { value: "distractions", label: "Distractions" },
  { value: "unmarked", label: "Unmarked" },
] as const;

const rangeOptions = [
  { value: "7", label: "7d" },
  { value: "30", label: "30d" },
  { value: "90", label: "90d" },
] as const;

const sortOptions: ReadonlyArray<{ value: SiteSort; label: string }> = [
  { value: "time", label: "Most time" },
  { value: "visits", label: "Most visits" },
  { value: "name", label: "Name" },
];

/** Every site you have visited, and which ones you count as distractions. Shown in the Sites panel. */
export default function SitesManager() {
  const [filter, setFilter] = useState<SiteFilter>("all");
  const [days, setDays] = useState<RangeDays>(7);
  const [sort, setSort] = useState<SiteSort>("time");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const q = useDebouncedValue(search.trim(), 300);

  // A new filter, range, sort or search starts again from the first page.
  useEffect(() => setPage(0), [filter, days, sort, q]);

  const sites = useSites({ days, filter, q, sort, limit: PAGE_SIZE, offset: page * PAGE_SIZE });
  const markSite = useMarkSite();
  const toggle = (domain: string, marked: boolean) => markSite.mutate({ domain, marked });

  const total = sites.data?.total ?? 0;
  const first = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const last = Math.min(total, (page + 1) * PAGE_SIZE);
  const narrowed = filter !== "all" || q !== "";

  return (
    // The panel is narrow on a wide screen, so the layout reacts to the panel width, not the window width.
    <div className="@container space-y-5">
        <p className="text-ink-muted">
          Switch a site on to count its time as a distraction. Everything else counts as other time.
        </p>

        <AddSiteForm />

        <div className="flex flex-wrap items-center gap-3">
          <Segmented label="Show" value={filter} onValueChange={setFilter} options={filterOptions} />
          <Segmented
            label="Time range in days"
            value={String(days) as "7" | "30" | "90"}
            onValueChange={(value) => setDays(Number(value) as RangeDays)}
            options={rangeOptions}
          />
          <div className="relative min-w-48 flex-1">
            <Search aria-hidden="true" className="pointer-events-none absolute top-3 left-3 size-5 text-ink-muted" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search sites"
              aria-label="Search sites"
              className="h-11 w-full rounded-xl bg-card pr-4 pl-10 text-ink placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-teal"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-ink-muted">
            Sort
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as SiteSort)}
              className="h-11 rounded-xl bg-card px-3 text-ink focus-visible:outline-2 focus-visible:outline-teal"
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {sites.isPending ? (
          <div className="space-y-2" aria-busy="true" aria-label="Loading sites">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : sites.isError ? (
          <ErrorState title="Couldn't load your sites" onRetry={() => void sites.refetch()} />
        ) : sites.data.sites.length === 0 ? (
          narrowed ? (
            <EmptyState
              icon={<Search aria-hidden="true" />}
              title="No matching sites"
              description="Nothing matches this filter or search in the selected range."
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setFilter("all");
                    setSearch("");
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={<Globe aria-hidden="true" />}
              title="No sites yet"
              description="Start a session and browse. Sites you visit show up here so you can mark the distracting ones, or add one above."
            />
          )
        ) : (
          <>
            <ul className={LIST_GRID} aria-label={`Sites, last ${days} days`}>
              {/* Column titles for sighted users; every cell in a row is already labelled for screen readers. */}
              <li className={`${ROW_GRID} hidden px-4 text-xs font-semibold tracking-wider text-ink-muted uppercase @2xl:grid`} aria-hidden="true">
                <span>Site</span>
                <span>Time</span>
                <span>Visits</span>
                <span>Avg visit</span>
                <span>Pattern</span>
                <span className="text-right">Distraction</span>
              </li>
              {sites.data.sites.map((site) => (
                <SiteRow key={site.domain} site={site} onToggle={toggle} />
              ))}
            </ul>
            <div className="flex items-center justify-between gap-3 text-sm text-ink-muted">
              <p aria-live="polite">
                Showing {first} to {last} of {total}
              </p>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
                  Previous
                </Button>
                <Button variant="secondary" size="sm" disabled={last >= total} onClick={() => setPage(page + 1)}>
                  Next
                </Button>
              </div>
            </div>
          </>
        )}

        {markSite.isError ? (
          <p role="alert" className="text-sm text-coral">
            Couldn't save that change, so it was undone. Try again.
          </p>
        ) : null}
    </div>
  );
}
