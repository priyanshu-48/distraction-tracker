// Rules about sites that both the API and the tests rely on. Keep them in one place.

/** Lower-case, trimmed, without a leading "www.". Subdomains are kept as they are. */
export function normalizeDomain(domain) {
  return domain.trim().toLowerCase().replace(/^www\./, "");
}

// How a site is labelled from its visit pattern (decisions.md, D-24). Fixed thresholds:
// simple to explain and test, deliberately not relative to the user's own history.
export const CHECKING_MIN_VISITS = 10;
export const CHECKING_MAX_AVG_SECONDS = 120; // average visit under 2 minutes
export const BINGE_MIN_AVG_SECONDS = 900; // average visit over 15 minutes

/**
 * "checking": many short visits (a habit of glancing at it). "binge": long visits.
 * Anything else is null (no label). `seconds` is the total time across `visits`.
 */
export function siteType(visits, seconds) {
  if (!visits) return null;
  const average = seconds / visits;
  if (average > BINGE_MIN_AVG_SECONDS) return "binge";
  if (visits >= CHECKING_MIN_VISITS && average < CHECKING_MAX_AVG_SECONDS) return "checking";
  return null;
}
