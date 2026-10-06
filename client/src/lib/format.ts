import { formatShortDay, todayIn } from "./period";

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

/**
 * Like formatDuration, but rounded to the minute from one minute up ("16m 55s" reads "17m"). For headline
 * numbers, where seconds are noise and make the figure longer than it needs to be.
 */
export function formatDurationCoarse(totalSeconds: number): string {
  const total = Number.isFinite(totalSeconds) ? Math.max(0, totalSeconds) : 0;
  return formatDuration(total >= 60 ? Math.round(total / 60) * 60 : total);
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
  return formatShortDay(todayIn(timeZone, date));
}

/** "just now", "5 min ago", "3 h ago", or a short date once it is older than a day. */
export function formatAgo(iso: string | null, nowMs: number = Date.now()): string {
  const then = iso ? Date.parse(iso) : Number.NaN;
  if (Number.isNaN(then)) return "never";
  const seconds = Math.max(0, Math.round((nowMs - then) / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${Math.max(1, minutes)} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(then);
}
