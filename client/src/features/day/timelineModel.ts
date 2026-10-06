import { formatDuration } from "@/lib/format";
import type { DaySummary } from "./types";

type Timeline = DaySummary["timeline"];

const DAY_MINUTES = 24 * 60;
/** The cropped axis never shows less than this, so one short session is not stretched across the whole chart. */
const MIN_AXIS_MINUTES = 4 * 60;
/** A span is never narrower than this share of the axis, so a 30 second visit still shows as a tick. */
const MIN_WIDTH = 0.006;

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
  startMinute: number;
  endMinute: number;
  ticks: Array<{ label: string; left: number }>;
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

/**
 * Turns sessions and spans into positions along one axis. By default the axis is cropped to the hours that have
 * activity (whole hours, at least four of them); `fullDay` shows midnight to midnight. A span that runs past
 * midnight stops at midnight, because visits belong to the day they started.
 */
export function buildTimelineModel(timeline: Timeline, { timeZone, isToday, nowMs, fullDay }: Options): TimelineModel {
  const range = (startIso: string, endIso: string | null) => {
    const start = localMinutes(new Date(startIso).getTime(), timeZone);
    const end = endIso === null ? (isToday ? localMinutes(nowMs, timeZone) : DAY_MINUTES) : localMinutes(new Date(endIso).getTime(), timeZone);
    return { start, end: end < start ? DAY_MINUTES : end }; // an end "before" the start means it crossed midnight
  };

  const sessionRanges = timeline.sessions.map((s) => range(s.start, s.end));
  const spanRanges = timeline.spans.map((s) => range(s.start, s.end));
  const all = [...sessionRanges, ...spanRanges];

  let lo = 0;
  let hi = DAY_MINUTES;
  if (!fullDay && all.length > 0) {
    lo = Math.floor(Math.min(...all.map((r) => r.start)) / 60) * 60;
    hi = Math.ceil(Math.max(...all.map((r) => r.end)) / 60) * 60;
    while (hi - lo < MIN_AXIS_MINUTES) {
      if (lo > 0) lo -= 60;
      if (hi - lo < MIN_AXIS_MINUTES && hi < DAY_MINUTES) hi += 60;
    }
  }

  const size = hi - lo;
  const place = ({ start, end }: { start: number; end: number }): Placed => {
    const width = Math.min(1, Math.max((end - start) / size, MIN_WIDTH));
    return { left: Math.min((start - lo) / size, 1 - width), width };
  };

  const step = size <= 6 * 60 ? 60 : size <= 12 * 60 ? 120 : 180;
  const ticks = [];
  for (let minute = Math.ceil(lo / step) * step; minute <= hi; minute += step) {
    ticks.push({ label: `${String(minute / 60).padStart(2, "0")}:00`, left: (minute - lo) / size });
  }

  return {
    startMinute: lo,
    endMinute: hi,
    ticks,
    sessions: sessionRanges.map(place),
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
