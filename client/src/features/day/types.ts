import type { SiteType } from "@/features/sites/types";

/** What `GET /api/summary` returns for one day (see server/models/summaryModel.js). */
export interface DaySummary {
  date: string;
  timeZone: string;
  budgetSeconds: number;
  totals: {
    distractedSeconds: number;
    otherSeconds: number;
    trackedSeconds: number;
    visits: number;
    avgVisitSeconds: number;
    type: SiteType;
  };
  /** `usualSeconds` is null when there is no earlier same-weekday data to compare with. */
  topSites: Array<{
    domain: string;
    seconds: number;
    visits: number;
    avgSeconds: number;
    type: SiteType;
    marked: true;
    usualSeconds: number | null;
  }>;
  toClassify: Array<{ domain: string; seconds: number; visits: number }>;
  recent: Array<{ domain: string; startedAt: string; seconds: number; marked: boolean }>;
  focus: { longestStretchSeconds: number; firstDistractionAfterSeconds: number | null };
  timeline: {
    sessions: Array<{ start: string; end: string | null; distractedSeconds: number }>;
    spans: Array<{ kind: "distraction" | "other"; domain: string | null; start: string; end: string; visits: number; seconds: number }>;
  };
  /** The seven local days ending at `date`, oldest first. */
  recentDays: Array<{ date: string; distractedSeconds: number; trackedSeconds: number }>;
  triggers: Array<{ from: string; to: string; count: number }>;
  /**
   * Average over the last four same weekdays that had tracking; `days` is how many there were. `paceSeconds` is how
   * much of it had usually built up by this time of day (only for a day in progress).
   */
  usual: { days: number; distractedSeconds: number | null; paceSeconds: number | null };
}
