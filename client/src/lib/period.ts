/**
 * The period the dashboard is showing: a day, a week (Monday to Sunday) or a calendar month.
 * Dates are plain "YYYY-MM-DD" strings in the user's own calendar, so there is no time-zone
 * arithmetic here; "today" is the only thing that depends on a zone (see todayIn).
 */
export type View = "day" | "week" | "month";
export const VIEWS: readonly View[] = ["day", "week", "month"];

/** The last 90 days, today included, can be shown (the history we keep and aggregate). */
export const HISTORY_DAYS = 90;

/** `date` is any day inside the period; the period is derived from it and the view. */
export interface Period {
  view: View;
  date: string;
}

const DAY_MS = 86_400_000;
const parse = (date: string) => Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10));
const format = (ms: number) => new Date(ms).toISOString().slice(0, 10);

function isDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && format(parse(value)) === value;
}

export const addDays = (date: string, days: number) => format(parse(date) + days * DAY_MS);

/** Today's date in the given IANA zone (the browser's by default). */
export function todayIn(timeZone?: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export const earliestDate = (today: string) => addDays(today, -(HISTORY_DAYS - 1));

/** First and last day of the period, inclusive. */
export function periodBounds({ view, date }: Period): { start: string; end: string } {
  if (view === "day") return { start: date, end: date };
  const ms = parse(date);
  if (view === "week") {
    const sinceMonday = (new Date(ms).getUTCDay() + 6) % 7;
    const start = ms - sinceMonday * DAY_MS;
    return { start: format(start), end: format(start + 6 * DAY_MS) };
  }
  const d = new Date(ms);
  return {
    start: format(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)),
    end: format(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)),
  };
}

/** Reads untrusted URL values: unknown view becomes "day", a bad or out-of-range date is pulled into range. */
export function normalizePeriod(raw: { view?: string | null; date?: string | null }, today: string): Period {
  const view = VIEWS.find((v) => v === raw.view) ?? "day";
  let date = isDate(raw.date) ? raw.date : today;
  if (date > today) date = today;
  if (date < earliestDate(today)) date = earliestDate(today);
  return { view, date };
}

/** The period before (-1) or after (1) this one, whatever the view. */
function neighbour(period: Period, direction: -1 | 1): Period {
  const { start } = periodBounds(period);
  switch (period.view) {
    case "day":
      return { view: "day", date: addDays(period.date, direction) };
    case "week":
      return { view: "week", date: addDays(start, direction * 7) };
    case "month": {
      const d = new Date(parse(start));
      return { view: "month", date: format(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + direction, 1)) };
    }
  }
}

/** Can the user step that way without leaving the 90 days of history or entering the future? */
export function canShift(period: Period, direction: -1 | 1, today: string): boolean {
  const target = periodBounds(neighbour(period, direction));
  return direction > 0 ? target.start <= today : target.end >= earliestDate(today);
}

/** Steps to the previous or next period; returns the same period if that is not allowed. */
export function shiftPeriod(period: Period, direction: -1 | 1, today: string): Period {
  if (!canShift(period, direction, today)) return period;
  return normalizePeriod(neighbour(period, direction), today);
}

export function isCurrent(period: Period, today: string): boolean {
  const { start, end } = periodBounds(period);
  return start <= today && today <= end;
}

/** Changes the view, staying on today if the current period contains it. */
export function changeView(period: Period, view: View, today: string): Period {
  return normalizePeriod({ view, date: isCurrent(period, today) ? today : period.date }, today);
}

// Fixed name tables: Intl output for short names differs between runtimes ("Sep" vs "Sept").
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "5 Oct" */
const dayMonth = (date: string) => `${+date.slice(8)} ${MONTHS[+date.slice(5, 7) - 1]}`;

/** "Mon, 5 Oct" for a "YYYY-MM-DD" date. */
export function formatShortDay(date: string): string {
  return `${WEEKDAYS[new Date(parse(date)).getUTCDay()]}, ${dayMonth(date)}`;
}

/** "Mon, 5 Oct", "5 to 11 Oct", "28 Sep to 4 Oct" or "October 2026". */
export function periodLabel(period: Period): string {
  const { start, end } = periodBounds(period);
  if (period.view === "day") return formatShortDay(start);
  if (period.view === "week") {
    const sameMonth = start.slice(0, 7) === end.slice(0, 7);
    return sameMonth ? `${+start.slice(8)} to ${dayMonth(end)}` : `${dayMonth(start)} to ${dayMonth(end)}`;
  }
  return `${MONTHS_LONG[+start.slice(5, 7) - 1]} ${start.slice(0, 4)}`;
}
