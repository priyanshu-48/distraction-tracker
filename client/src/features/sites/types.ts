/** How a site's visits look: many short ones ("checking") or long ones ("binge"). */
export type SiteType = "checking" | "binge" | null;

export interface Site {
  domain: string;
  /** Whether the user counts this site as a distraction. */
  marked: boolean;
  seconds: number;
  visits: number;
  avgSeconds: number;
  lastSeen: string | null;
  type: SiteType;
}

export type RangeDays = 7 | 30 | 90;
export type SiteFilter = "all" | "distractions" | "unmarked";
export type SiteSort = "time" | "visits" | "name";

export interface SitesParams {
  days: RangeDays;
  filter: SiteFilter;
  q: string;
  sort: SiteSort;
  limit: number;
  offset: number;
}

export interface SitesResponse {
  days: RangeDays;
  /** Matches across all pages, not just this one. */
  total: number;
  sites: Site[];
}
