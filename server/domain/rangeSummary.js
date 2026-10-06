import { addDays, daysBetween, periodBounds, previousPeriod } from "./dates.js";
import { siteType } from "./sites.js";

// Pure calculations behind the Week and Month views. They take plain rows (already fetched) so every rule can
// be tested without a database. A day with nothing tracked is missing, not a zero: it neither counts as a good
// day nor breaks a streak, and it is left out of averages.

export const TOP_SITES = 5;
export const MOVERS = 3;
/** A site has to move by at least this much against the previous period to count as a mover. */
export const MOVER_MIN_SECONDS = 60;

const sum = (items, pick) => items.reduce((total, item) => total + pick(item), 0);

/** Every date from `from` to `to`, inclusive. */
function eachDate(from, to) {
  const dates = [];
  for (let date = from; date <= to; date = addDays(date, 1)) dates.push(date);
  return dates;
}

/**
 * Consecutive tracked days under (or at) the budget, over `days` in date order up to today. Days with nothing
 * tracked are skipped; a tracked day over budget ends the run. "current" counts back from the most recent day,
 * "longest" is the best run in the list.
 */
export function streaks(days, budgetSeconds) {
  let longest = 0;
  let run = 0;
  for (const day of days) {
    if (day.trackedSeconds === 0) continue;
    run = day.distractedSeconds <= budgetSeconds ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  return { current: run, longest };
}

/** The lowest and highest distraction day among tracked days; null unless there are at least two different ones. */
export function bestAndWorst(days) {
  const tracked = days.filter((day) => day.trackedSeconds > 0);
  if (tracked.length < 2) return { best: null, worst: null };
  const pick = (better) =>
    tracked.reduce((chosen, day) => (better(day.distractedSeconds, chosen.distractedSeconds) ? day : chosen), tracked[0]);
  const best = pick((a, b) => a < b);
  const worst = pick((a, b) => a > b);
  if (best.date === worst.date) return { best: null, worst: null };
  const slim = (day) => ({ date: day.date, distractedSeconds: day.distractedSeconds });
  return { best: slim(best), worst: slim(worst) };
}

/** 7 weekdays (Monday first) by 24 hours of distraction seconds. `rows`: { dow: 1 (Monday) to 7, hour: 0 to 23, seconds }. */
export function heatmap(rows) {
  const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const row of rows) grid[row.dow - 1][row.hour] += Math.round(Number(row.seconds));
  return grid;
}

/**
 * The median time from a session starting to the first distraction in it, for each day that has a session.
 * `rows`: one per session, { day, seconds }, where `seconds` is null if the session had no distraction. A day whose
 * sessions had none maps to null.
 */
export function firstDistractionByDay(rows) {
  const byDay = new Map();
  for (const row of rows) {
    const list = byDay.get(row.day) ?? [];
    if (row.seconds !== null && row.seconds !== undefined) list.push(Math.round(Number(row.seconds)));
    byDay.set(row.day, list);
  }
  const result = new Map();
  for (const [day, list] of byDay) {
    if (list.length === 0) {
      result.set(day, null);
      continue;
    }
    list.sort((a, b) => a - b);
    const mid = Math.floor(list.length / 2);
    result.set(day, list.length % 2 ? list[mid] : Math.round((list[mid - 1] + list[mid]) / 2));
  }
  return result;
}

/**
 * The period for `date`, how far it has got (`through`: its last day, or today if it is still going) and the
 * previous period cut to the same number of days, so a week or month in progress is not set against a finished one.
 */
export function rangeWindows(view, date, today) {
  const { start, end } = periodBounds(view, date);
  const through = end < today ? end : today;
  const elapsed = daysBetween(start, through) + 1;
  const previousFull = previousPeriod(view, start);
  const previousThrough = addDays(previousFull.start, elapsed - 1);
  return { start, end, through, previous: { start: previousFull.start, end: previousThrough < previousFull.end ? previousThrough : previousFull.end } };
}

/**
 * `view`: "week" (Monday to Sunday) or "month"; `date`: any day inside it; `today`: the user's today.
 * `dailyRows`: per-day totals { day, trackedSeconds, distractedSeconds, visits }, which must cover the previous period,
 *   the current one and the days from `streakFrom` to today (the streak window).
 * `siteRows`: distraction sites per period { period: "cur" | "prev", domain, seconds, visits }.
 * `heatRows`: see heatmap(). `firstDistractions`: the Map from firstDistractionByDay().
 * The current period is compared with the previous one over the same number of days (see rangeWindows).
 */
export function summarizeRange({ view, date, today, budgetSeconds, streakFrom, dailyRows, siteRows, heatRows, firstDistractions }) {
  const { start, end, through, previous } = rangeWindows(view, date, today);

  const byDay = new Map(dailyRows.map((row) => [row.day, row]));
  const dayOf = (day) => {
    const row = byDay.get(day);
    return {
      date: day,
      distractedSeconds: row ? Math.round(Number(row.distractedSeconds)) : 0,
      trackedSeconds: row ? Math.round(Number(row.trackedSeconds)) : 0,
      visits: row ? Number(row.visits) : 0,
    };
  };

  const days = eachDate(start, end).map((day) => ({
    ...dayOf(day),
    firstDistractionAfterSeconds: day <= through ? (firstDistractions.get(day) ?? null) : null,
  }));
  const elapsedDays = days.filter((day) => day.date <= through);

  const totalsOf = (list) => {
    const tracked = list.filter((day) => day.trackedSeconds > 0);
    return {
      distractedSeconds: sum(list, (d) => d.distractedSeconds),
      trackedSeconds: sum(list, (d) => d.trackedSeconds),
      visits: sum(list, (d) => d.visits),
      daysTracked: tracked.length,
    };
  };
  const totals = totalsOf(elapsedDays);
  const previousTotals = totalsOf(eachDate(previous.start, previous.end).map(dayOf));

  // Streaks are as of today whatever period is shown, so they use the history up to today.
  const history = eachDate(streakFrom, today).map(dayOf);

  const hasPrevious = previousTotals.daysTracked > 0;
  const priorSeconds = new Map(siteRows.filter((r) => r.period === "prev").map((r) => [r.domain, Number(r.seconds)]));
  const current = siteRows
    .filter((r) => r.period === "cur")
    .map((r) => ({ domain: r.domain, seconds: Number(r.seconds), visits: Number(r.visits) }))
    .sort((a, b) => b.seconds - a.seconds || a.domain.localeCompare(b.domain));
  const currentSeconds = new Map(current.map((site) => [site.domain, site.seconds]));

  const changes = hasPrevious
    ? [...new Set([...currentSeconds.keys(), ...priorSeconds.keys()])].map((domain) => {
        const seconds = currentSeconds.get(domain) ?? 0;
        const before = priorSeconds.get(domain) ?? 0;
        return { domain, seconds, previousSeconds: before, change: seconds - before };
      })
    : [];
  const order = (a, b) => a.domain.localeCompare(b.domain);

  return {
    view,
    start,
    end,
    through,
    budgetSeconds,
    days,
    totals: {
      ...totals,
      daysUnderBudget: elapsedDays.filter((d) => d.trackedSeconds > 0 && d.distractedSeconds <= budgetSeconds).length,
      avgDistractedSeconds: totals.daysTracked ? Math.round(totals.distractedSeconds / totals.daysTracked) : null,
    },
    previous: { ...previous, ...previousTotals },
    ...bestAndWorst(elapsedDays),
    streak: streaks(history, budgetSeconds),
    topSites: current.slice(0, TOP_SITES).map((site) => ({
      ...site,
      avgSeconds: site.visits ? site.seconds / site.visits : 0,
      type: siteType(site.visits, site.seconds),
      previousSeconds: hasPrevious ? (priorSeconds.get(site.domain) ?? 0) : null,
    })),
    movers: {
      up: changes.filter((c) => c.change >= MOVER_MIN_SECONDS).sort((a, b) => b.change - a.change || order(a, b)).slice(0, MOVERS),
      down: changes.filter((c) => c.change <= -MOVER_MIN_SECONDS).sort((a, b) => a.change - b.change || order(a, b)).slice(0, MOVERS),
    },
    heatmap: heatmap(heatRows),
  };
}
