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
  /** How the nudges did in this period; null when none were decided in it (see server/domain/nudges.js). */
  nudges: {
    /** Nudges that were shown. */
    nudged: number;
    /** Of the shown ones whose visit reached the server, and how many of those lasted a minute or less. */
    shown: number;
    shownLeft: number;
    /** The same for nudges held back on purpose, the comparison group. */
    heldOut: number;
    heldOutLeft: number;
    /** Decided for visits that never reached the server; counted in neither group. */
    unmatched: number;
    /** True when both groups have at least 5, so comparing them means something. */
    comparable: boolean;
  } | null;
}
