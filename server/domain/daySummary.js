import { siteType } from "./sites.js";

// Pure calculations behind the Day view. They take plain rows (already fetched for one day) so every
// rule can be tested without a database. Visits belong to the day they started.

/** A pause longer than this between two visits is a break (idle or away), not part of a focus stretch. */
export const BREAK_SECONDS = 300;
export const TOP_SITES = 5;
export const RECENT_VISITS = 20;

const seconds = (row) => Number(row.duration ?? 0);
const at = (value) => (value instanceof Date ? value : new Date(value));

function groupByDomain(rows) {
  const groups = new Map();
  for (const row of rows) {
    const group = groups.get(row.domain) ?? { domain: row.domain, seconds: 0, visits: 0 };
    group.seconds += seconds(row);
    group.visits += 1;
    groups.set(row.domain, group);
  }
  return [...groups.values()].sort((a, b) => b.seconds - a.seconds || a.domain.localeCompare(b.domain));
}

/**
 * The longest run of tracked time with no distraction in it. A distraction ends a run, and so does a pause
 * of more than BREAK_SECONDS between visits. Only the time on the pages counts, not the pauses.
 * `rows` must be in start order.
 */
export function longestFocusStretch(rows) {
  let longest = 0;
  let current = 0;
  let previousEnd = null;
  for (const row of rows) {
    const start = at(row.started_at).getTime();
    const brokeByGap = previousEnd !== null && (start - previousEnd) / 1000 > BREAK_SECONDS;
    if (row.marked) {
      current = 0;
    } else {
      current = brokeByGap ? seconds(row) : current + seconds(row);
      longest = Math.max(longest, current);
    }
    previousEnd = at(row.ended_at).getTime();
  }
  return longest;
}

/**
 * How long after a session started the first distraction came, for each session that had one; the middle
 * value of those (or null if no session had a distraction). `rows` must be in start order.
 */
export function medianTimeToFirstDistraction(rows, sessions) {
  const distractions = rows.filter((row) => row.marked).map((row) => at(row.started_at).getTime());
  const delays = [];
  for (const session of sessions) {
    const start = at(session.start_time).getTime();
    const end = session.end_time ? at(session.end_time).getTime() : Infinity;
    const first = distractions.find((time) => time >= start && time < end);
    if (first !== undefined) delays.push(Math.round((first - start) / 1000));
  }
  if (delays.length === 0) return null;
  delays.sort((a, b) => a - b);
  const mid = Math.floor(delays.length / 2);
  return delays.length % 2 ? delays[mid] : Math.round((delays[mid - 1] + delays[mid]) / 2);
}

/** Visits closer together than this (same site for distractions) are drawn as one burst on the timeline. */
export const BURST_GAP_SECONDS = 60;
/** The timeline never sends more spans than this; the gap widens until the day fits. */
export const MAX_SPANS = 400;

function mergeBursts(rows, gapSeconds, bySite) {
  const spans = [];
  for (const row of rows) {
    const start = at(row.started_at).getTime();
    const end = at(row.ended_at).getTime();
    const kind = row.marked ? "distraction" : "other";
    const domain = row.marked && bySite ? row.domain : null;
    const last = spans[spans.length - 1];
    if (last && last.kind === kind && last.domain === domain && (start - last.end) / 1000 <= gapSeconds) {
      last.end = Math.max(last.end, end);
      last.visits += 1;
      last.seconds += seconds(row);
    } else {
      spans.push({ kind, domain, start, end, visits: 1, seconds: seconds(row) });
    }
  }
  return spans;
}

/**
 * What the "When" chart draws. `sessions` keep the time tracking ran (a running one has end null) with the
 * distraction time inside each; `spans` are the visits merged into bursts so a flurry of short visits stays
 * readable. Distraction bursts keep their site (so the chart can highlight it) unless the day is so busy that
 * sites had to be combined; other time is anonymous.
 * `rows` must be in start order.
 */
export function buildTimeline(rows, sessions) {
  let gap = BURST_GAP_SECONDS;
  let bySite = true;
  let spans = mergeBursts(rows, gap, bySite);
  while (spans.length > MAX_SPANS && gap < 86_400) {
    // widen the gap; past 8 minutes also stop keeping distraction sites apart (alternating sites never merge otherwise)
    if (bySite && gap >= 480) bySite = false;
    else gap *= 2;
    spans = mergeBursts(rows, gap, bySite);
  }
  return {
    sessions: sessions.map((session) => {
      const start = at(session.start_time).getTime();
      const end = session.end_time ? at(session.end_time).getTime() : null;
      const distractedSeconds = rows
        .filter((row) => row.marked && at(row.started_at).getTime() >= start && (end === null || at(row.started_at).getTime() < end))
        .reduce((sum, row) => sum + seconds(row), 0);
      return { start: new Date(start).toISOString(), end: end === null ? null : new Date(end).toISOString(), distractedSeconds };
    }),
    spans: spans.map((span) => ({ ...span, start: new Date(span.start).toISOString(), end: new Date(span.end).toISOString() })),
  };
}

/**
 * What a day usually looks like: the average over the given earlier days that had any tracking (days with
 * nothing tracked are not zeros, they are missing). `rows` are per-day, per-site totals
 * { day, domain, marked, seconds }. Returns days: 0 and nulls when there is nothing to compare with.
 */
export function usualBaseline(rows) {
  const days = new Set(rows.map((row) => row.day));
  const sites = {};
  let total = 0;
  for (const row of rows) {
    if (!row.marked) continue;
    total += Number(row.seconds);
    sites[row.domain] = (sites[row.domain] ?? 0) + Number(row.seconds);
  }
  const n = days.size;
  return {
    days: n,
    distractedSeconds: n ? Math.round(total / n) : null,
    siteSeconds: (domain) => (n ? Math.round((sites[domain] ?? 0) / n) : null),
  };
}

/**
 * `rows`: the day's visits in start order, each { domain, started_at, ended_at, duration, marked }.
 * `sessions`: the day's tracking sessions, each { start_time, end_time }.
 */
export function summarizeDay(rows, sessions) {
  const distractions = rows.filter((row) => row.marked);
  const others = rows.filter((row) => !row.marked);

  const distractedSeconds = distractions.reduce((sum, row) => sum + seconds(row), 0);
  const otherSeconds = others.reduce((sum, row) => sum + seconds(row), 0);
  const visits = distractions.length;

  return {
    totals: {
      distractedSeconds,
      otherSeconds,
      trackedSeconds: distractedSeconds + otherSeconds,
      visits,
      avgVisitSeconds: visits ? distractedSeconds / visits : 0,
      type: siteType(visits, distractedSeconds),
    },
    topSites: groupByDomain(distractions)
      .slice(0, TOP_SITES)
      .map((site) => ({
        ...site,
        avgSeconds: site.seconds / site.visits,
        type: siteType(site.visits, site.seconds),
        marked: true,
      })),
    toClassify: groupByDomain(others).slice(0, TOP_SITES),
    recent: rows
      .slice(-RECENT_VISITS)
      .reverse()
      .map((row) => ({
        domain: row.domain,
        startedAt: at(row.started_at).toISOString(),
        seconds: seconds(row),
        marked: row.marked,
      })),
    focus: {
      longestStretchSeconds: longestFocusStretch(rows),
      firstDistractionAfterSeconds: medianTimeToFirstDistraction(rows, sessions),
    },
  };
}
