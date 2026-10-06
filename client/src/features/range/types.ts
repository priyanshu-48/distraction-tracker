import type { SiteType } from "@/features/sites/types";

export type RangeViewName = "week" | "month";

export interface Mover {
  domain: string;
  seconds: number;
  previousSeconds: number;
  /** Positive: more time than in the previous period. */
  change: number;
}

/** What `GET /api/range` returns for one week or month (see server/domain/rangeSummary.js). */
export interface RangeSummary {
  view: RangeViewName;
  /** The whole period; `through` is how far it has got (its last day, or today if it is still going). */
  start: string;
  end: string;
  through: string;
  timeZone: string;
  budgetSeconds: number;
  days: Array<{
    date: string;
    distractedSeconds: number;
    trackedSeconds: number;
    visits: number;
    firstDistractionAfterSeconds: number | null;
  }>;
  totals: {
    distractedSeconds: number;
    trackedSeconds: number;
    visits: number;
    daysTracked: number;
    daysUnderBudget: number;
    avgDistractedSeconds: number | null;
  };
  /** The previous week or month, cut to the same number of days as the current one has had. */
  previous: {
    start: string;
    end: string;
    distractedSeconds: number;
    trackedSeconds: number;
    visits: number;
    daysTracked: number;
  };
  best: { date: string; distractedSeconds: number } | null;
  worst: { date: string; distractedSeconds: number } | null;
  /** As of today, over the last 30 days; days with nothing tracked are skipped. */
  streak: { current: number; longest: number };
  topSites: Array<{
    domain: string;
    seconds: number;
    visits: number;
    avgSeconds: number;
    type: SiteType;
    previousSeconds: number | null;
  }>;
  movers: { up: Mover[]; down: Mover[] };
  /** 7 weekdays (Monday first) by 24 hours of distraction seconds. */
  heatmap: number[][];
}
