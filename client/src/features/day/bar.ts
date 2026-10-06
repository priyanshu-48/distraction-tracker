export interface BarModel {
  /** Share of the bar (0 to 1) filled up to the limit. */
  withinFraction: number;
  /** Share of the bar filled beyond the limit; the bar grows to make room instead of overflowing. */
  overFraction: number;
  /** Where the limit sits on the bar (1 when the day is within budget). */
  limitFraction: number;
  leftSeconds: number;
  overSeconds: number;
  /** Where "usually this much by now" sits on the bar, or null when there is no pace to show. */
  paceFraction: number | null;
}

/**
 * Lays out the budget bar. Within budget the bar is the budget; over budget the scale stretches to the day's
 * total and the limit becomes a tick part-way along, so 130% looks like 130% and not a full bar.
 */
export function budgetBar(distractedSeconds: number, budgetSeconds: number, paceSeconds: number | null = null): BarModel {
  const used = Math.max(0, distractedSeconds);
  // A zero budget never comes from the server, but dividing by it would draw nothing sensible.
  const scale = Math.max(budgetSeconds, used, paceSeconds ?? 0, 1);
  const within = Math.min(used, budgetSeconds);
  return {
    withinFraction: within / scale,
    overFraction: (used - within) / scale,
    limitFraction: Math.min(budgetSeconds, scale) / scale,
    leftSeconds: Math.max(0, budgetSeconds - used),
    overSeconds: Math.max(0, used - budgetSeconds),
    paceFraction: paceSeconds === null ? null : Math.max(0, paceSeconds) / scale,
  };
}
