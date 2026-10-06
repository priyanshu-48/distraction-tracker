/**
 * Formats a length of time using its two largest units: "1h 12m", "12m 30s", "45s".
 * Zero units are dropped ("2h", "12m"). Bad input (negative, NaN) renders as "0s".
 * Every duration in the UI goes through this, so units never differ between screens.
 */
export function formatDuration(totalSeconds: number): string {
  const total = Number.isFinite(totalSeconds) ? Math.max(0, Math.round(totalSeconds)) : 0;
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  const parts: Array<[number, string]> =
    days > 0 ? [[days, "d"], [hours, "h"]]
    : hours > 0 ? [[hours, "h"], [minutes, "m"]]
    : minutes > 0 ? [[minutes, "m"], [seconds, "s"]]
    : [[seconds, "s"]];

  const shown = parts.filter(([value], index) => value > 0 || index === 0);
  return shown.map(([value, unit]) => `${value}${unit}`).join(" ");
}

/** Whole-number percentage ("45%"); not clamped, so an over-budget day can read "130%". */
export function formatPercent(part: number, whole: number): string {
  if (!whole || !Number.isFinite(part) || !Number.isFinite(whole)) return "0%";
  return `${Math.round((part / whole) * 100)}%`;
}

/** Display name for a domain: lower-cased, without a leading "www.". */
export function siteLabel(domain: string): string {
  return domain.trim().toLowerCase().replace(/^www\./, "");
}

/** "Mon, 5 Oct" in the given IANA time zone (defaults to the browser's). */
export function formatDayHeading(date: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone,
  })
    .format(date)
    .replace(/^(\w+) /, "$1, ");
}
