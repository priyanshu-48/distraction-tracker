import { formatDuration } from "@/lib/format";
import type { DaySummary } from "./types";

type Timeline = DaySummary["timeline"];

const DAY_MINUTES = 24 * 60;
/** The cropped axis never shows less than this, so one short session is not stretched across the whole chart. */
const MIN_AXIS_MINUTES = 4 * 60;
/** A span is never narrower than this share of the axis, so a 30 second visit still shows as a tick. */
const MIN_WIDTH = 0.006;
/** Sessions this close together are drawn as one band; the list under the chart still gives each its own line. */
export const BAND_MERGE_MINUTES = 10;
/** A stretch with nothing tracked for longer than this is cut out of the axis and shown as a break. */
export const BREAK_MINUTES = 45;
/** Width of a break marker as a share of the whole axis. */
const BREAK_SHARE = 0.05;
/** A label needs about this share of the axis; ticks are thinned until they fit their stretch. */
const TICK_SHARE = 0.11;
const TICK_STEPS = [60, 120, 180, 360];
/** A session shorter than this with no distractions is noise in the list. */
export const SHORT_SESSION_SECONDS = 30;

const formatters = new Map<string, Intl.DateTimeFormat>();
function clockFormatter(timeZone: string) {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

/** Minutes since local midnight (fractional) for an instant, on the user's wall clock. */
function localMinutes(ms: number, timeZone: string): number {
  const parts = clockFormatter(timeZone).formatToParts(ms);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return get("hour") * 60 + get("minute") + get("second") / 60;
}

/** "09:05" on the user's clock. */
export function clockTime(iso: string | number, timeZone: string): string {
  const total = Math.floor(localMinutes(new Date(iso).getTime(), timeZone));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export interface Placed {
  /** Position and size along the axis, 0 to 1. */
  left: number;
  width: number;
}

export interface TimelineModel {
  /** First and last minute shown (the ends of the first and last stretch). */
  startMinute: number;
  endMinute: number;
  /** `align` says which side of the position the label hangs on, so labels at a stretch's edge stay inside it. */
  ticks: Array<{ label: string; left: number; align: "start" | "center" | "end" }>;
  /** Where activity was cut out of the axis: a marker goes in each. */
  breaks: Placed[];
  sessions: Placed[];
  spans: Array<Placed & Timeline["spans"][number]>;
}

interface Options {
  timeZone: string;
  /** A session that is still running ends "now" on today and at the end of the day on a past day. */
  isToday: boolean;
  nowMs: number;
  fullDay: boolean;
}

interface Stretch {
  /** Minutes since midnight covered by this stretch, and where it sits on the axis (0 to 1). */
  lo: number;
  hi: number;
  left: number;
  width: number;
}

/**
 * Turns sessions and spans into positions along one axis. By default the axis is cropped to the hours that have
 * activity (whole hours) and any gap of more than BREAK_MINUTES with nothing tracked is cut out and replaced by a
 * break marker, so scattered activity does not shrink into slivers; one stretch alone is at least four hours wide.
 * `fullDay` shows midnight to midnight with no breaks. A span that runs past midnight stops at midnight, because
 * visits belong to the day they started.
 */
export function buildTimelineModel(timeline: Timeline, { timeZone, isToday, nowMs, fullDay }: Options): TimelineModel {
  const range = (startIso: string, endIso: string | null) => {
    const start = localMinutes(new Date(startIso).getTime(), timeZone);
    const end = endIso === null ? (isToday ? localMinutes(nowMs, timeZone) : DAY_MINUTES) : localMinutes(new Date(endIso).getTime(), timeZone);
    return { start, end: end < start ? DAY_MINUTES : end }; // an end "before" the start means it crossed midnight
  };

  const sessionRanges = timeline.sessions.map((s) => range(s.start, s.end));
  const spanRanges = timeline.spans.map((s) => range(s.start, s.end));
  const all = [...sessionRanges, ...spanRanges].sort((a, b) => a.start - b.start);

  // Start and stop a few times and the bands would be slivers with gaps; one band per burst of sessions reads better.
  const bands: Array<{ start: number; end: number }> = [];
  for (const r of [...sessionRanges].sort((a, b) => a.start - b.start)) {
    const last = bands[bands.length - 1];
    if (last && r.start - last.end <= BAND_MERGE_MINUTES) last.end = Math.max(last.end, r.end);
    else bands.push({ ...r });
  }

  // Stretches of activity, rounded out to whole hours (at least one), merged again if rounding made them touch.
  let spans: Array<{ lo: number; hi: number }> = [{ lo: 0, hi: DAY_MINUTES }];
  if (!fullDay && all.length > 0) {
    const clusters: Array<{ start: number; end: number }> = [];
    for (const r of all) {
      const last = clusters[clusters.length - 1];
      if (last && r.start - last.end <= BREAK_MINUTES) last.end = Math.max(last.end, r.end);
      else clusters.push({ ...r });
    }
    spans = [];
    for (const c of clusters) {
      const lo = Math.min(Math.floor(c.start / 60) * 60, DAY_MINUTES - 60);
      const hi = Math.max(Math.ceil(c.end / 60) * 60, lo + 60);
      const last = spans[spans.length - 1];
      if (last && lo <= last.hi) last.hi = Math.max(last.hi, hi);
      else spans.push({ lo, hi });
    }
    if (spans.length === 1) {
      const only = spans[0];
      while (only.hi - only.lo < MIN_AXIS_MINUTES) {
        if (only.lo > 0) only.lo -= 60;
        if (only.hi - only.lo < MIN_AXIS_MINUTES && only.hi < DAY_MINUTES) only.hi += 60;
      }
    }
  }

  // Lay the stretches side by side, with a gap for each break.
  const total = spans.reduce((sum, s) => sum + (s.hi - s.lo), 0);
  const usable = 1 - (spans.length - 1) * BREAK_SHARE;
  let x = 0;
  const stretches: Stretch[] = spans.map((s) => {
    const stretch = { ...s, left: x, width: ((s.hi - s.lo) / total) * usable };
    x += stretch.width + BREAK_SHARE;
    return stretch;
  });

  const place = ({ start, end }: { start: number; end: number }): Placed => {
    const stretch = [...stretches].reverse().find((s) => s.lo <= start) ?? stretches[0];
    const size = stretch.hi - stretch.lo;
    const width = Math.min(stretch.width, Math.max(((Math.min(end, stretch.hi) - start) / size) * stretch.width, MIN_WIDTH));
    return { left: Math.min(stretch.left + ((start - stretch.lo) / size) * stretch.width, stretch.left + stretch.width - width), width };
  };

  const ticks: TimelineModel["ticks"] = [];
  for (const stretch of stretches) {
    const size = stretch.hi - stretch.lo;
    const at = (minute: number) => ({
      label: `${String(minute / 60).padStart(2, "0")}:00`,
      left: stretch.left + ((minute - stretch.lo) / size) * stretch.width,
      align: minute === stretch.lo ? ("start" as const) : minute === stretch.hi ? ("end" as const) : ("center" as const),
    });
    let chosen: number[] = [stretch.lo]; // too narrow for more: just say where it starts
    for (const step of TICK_STEPS) {
      const minutes: number[] = [];
      for (let m = Math.ceil(stretch.lo / step) * step; m <= stretch.hi; m += step) minutes.push(m);
      if (minutes.length > 0 && minutes.length * TICK_SHARE <= stretch.width) {
        chosen = minutes;
        break;
      }
    }
    ticks.push(...chosen.map(at));
  }

  return {
    startMinute: stretches[0].lo,
    endMinute: stretches[stretches.length - 1].hi,
    ticks,
    breaks: stretches.slice(1).map((s, i) => ({ left: stretches[i].left + stretches[i].width, width: s.left - (stretches[i].left + stretches[i].width) })),
    sessions: bands.map(place),
    spans: timeline.spans.map((span, index) => ({ ...span, ...place(spanRanges[index]) })),
  };
}

/** "09:00 to 11:30 · 2h 30m · 25m on distractions (17%)": one session in words. */
export function describeSession(session: Timeline["sessions"][number], timeZone: string, nowMs: number, isToday: boolean): string {
  const start = clockTime(session.start, timeZone);
  const startMs = new Date(session.start).getTime();
  if (session.end === null && !isToday) return `${start} · no end was recorded`;

  const endMs = session.end === null ? nowMs : new Date(session.end).getTime();
  const seconds = Math.max(0, Math.round((endMs - startMs) / 1000));
  const end = session.end === null ? "now" : clockTime(session.end, timeZone);
  const used =
    session.distractedSeconds > 0 && seconds > 0
      ? `${formatDuration(session.distractedSeconds)} on distractions (${Math.round((session.distractedSeconds / seconds) * 100)}%)`
      : "no distractions";
  return `${start} to ${end} · ${formatDuration(seconds)} · ${used}`;
}

/**
 * The session list as lines of text. A session under SHORT_SESSION_SECONDS with no distractions (a stray tap on
 * Start) is counted instead of listed; a running session and any session with a distraction are always listed.
 */
export function listSessions(
  sessions: Timeline["sessions"],
  timeZone: string,
  nowMs: number,
  isToday: boolean
): { lines: Array<{ key: string; text: string }>; hidden: number } {
  const lines: Array<{ key: string; text: string }> = [];
  let hidden = 0;
  for (const session of sessions) {
    const seconds = session.end === null ? null : (new Date(session.end).getTime() - new Date(session.start).getTime()) / 1000;
    if (seconds !== null && seconds < SHORT_SESSION_SECONDS && session.distractedSeconds === 0) hidden += 1;
    else lines.push({ key: session.start, text: describeSession(session, timeZone, nowMs, isToday) });
  }
  return { lines, hidden };
}
