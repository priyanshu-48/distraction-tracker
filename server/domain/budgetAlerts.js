/** Budget levels that raise an alert, as fractions of the daily budget, lowest first. */
export const BUDGET_LEVELS = [0.8, 1];

/**
 * The highest level today's distraction time has reached, or null. Only the highest is returned: a long visit that takes
 * someone from 50% straight to 120% should hear "over budget", not "80%" and then "over budget" a moment apart.
 */
export function reachedBudgetLevel(distractedSeconds, budgetSeconds) {
  if (!(budgetSeconds > 0)) return null;
  return [...BUDGET_LEVELS].reverse().find((level) => distractedSeconds >= budgetSeconds * level) ?? null;
}

/**
 * "40m", "1h", "1h 5m", "45s": a short duration. Minutes round DOWN: 4m40s is "4m", so an alert saying "80% used" never
 * shows "5m of 5m", which would read as the whole budget.
 */
export function formatDuration(seconds) {
  const total = Math.max(0, Math.round(seconds));
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h === 0 ? `${m}m` : m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/**
 * The alert for a level. It names the site and the time only: never a URL or a page title, which is all that has to
 * leave the machine for this to be useful (decisions.md, D-39).
 */
export function budgetAlert(level, { distractedSeconds, budgetSeconds, topSite }) {
  const over = level >= 1;
  const percent = Math.round(level * 100);
  const lead = topSite ? `${topSite.domain} is your biggest distraction today: ${formatDuration(topSite.seconds)}. ` : "";
  return {
    kind: over ? "budget-over" : "budget-warning",
    title: over ? "You are over today's distraction budget" : `${percent}% of today's distraction budget used`,
    body: `${lead}${formatDuration(distractedSeconds)} of ${formatDuration(budgetSeconds)} so far.`,
  };
}
