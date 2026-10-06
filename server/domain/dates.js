// Calendar-date helpers. Dates are "YYYY-MM-DD" strings in the user's own calendar, so there is
// no time-zone arithmetic here; only "today" depends on a zone.

/** The last 90 days, today included, can be requested (the history we keep and aggregate). */
export const HISTORY_DAYS = 90;

const DAY_MS = 86_400_000;
const parse = (date) => Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10));
const format = (ms) => new Date(ms).toISOString().slice(0, 10);

/** True for a real calendar date written as YYYY-MM-DD (so 2026-02-30 is rejected). */
export function isCalendarDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && format(parse(value)) === value;
}

export const addDays = (date, days) => format(parse(date) + days * DAY_MS);

/** Today's date in the given IANA zone. */
export function todayIn(timeZone, now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** The time of day in the given IANA zone as "HH:MM:SS" (24-hour clock). */
export function timeOfDayIn(timeZone, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (type) => parts.find((part) => part.type === type).value;
  return `${get("hour")}:${get("minute")}:${get("second")}`;
}

export const earliestDate = (today) => addDays(today, -(HISTORY_DAYS - 1));
