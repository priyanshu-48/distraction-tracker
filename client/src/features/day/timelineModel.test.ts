import { describe, expect, it } from "vitest";
import { buildTimelineModel, clockTime, describeSession } from "./timelineModel";
import type { DaySummary } from "./types";

type Timeline = DaySummary["timeline"];

const z = (hhmm: string, date = "2026-10-05") => `${date}T${hhmm}:00.000Z`;
const span = (start: string, end: string, kind: "distraction" | "other" = "other", domain: string | null = null) => ({
  kind,
  domain,
  start: z(start),
  end: z(end),
  visits: 1,
  seconds: 0,
});
const session = (start: string, end: string | null, distractedSeconds = 0) => ({ start: z(start), end: end ? z(end) : null, distractedSeconds });
const model = (timeline: Timeline, options: Partial<Parameters<typeof buildTimelineModel>[1]> = {}) =>
  buildTimelineModel(timeline, { timeZone: "UTC", isToday: false, nowMs: Date.parse(z("15:00")), fullDay: false, ...options });

describe("axis", () => {
  it("crops to the active hours, rounded out to whole hours", () => {
    const m = model({ sessions: [session("09:20", "13:40")], spans: [span("09:30", "10:00")] });
    expect([m.startMinute, m.endMinute]).toEqual([9 * 60, 14 * 60]);
  });

  it("never shows less than four hours", () => {
    const m = model({ sessions: [session("09:10", "09:50")], spans: [] });
    expect(m.endMinute - m.startMinute).toBe(4 * 60);
    expect(m.startMinute).toBeLessThanOrEqual(9 * 60);
    expect(m.endMinute).toBeGreaterThanOrEqual(10 * 60);
  });

  it("stays inside the day when it has to widen near midnight", () => {
    const m = model({ sessions: [session("23:10", "23:50")], spans: [] });
    expect([m.startMinute, m.endMinute]).toEqual([20 * 60, 24 * 60]);
  });

  it("shows midnight to midnight when asked, and for a day with nothing to place", () => {
    const busy = { sessions: [session("09:00", "10:00")], spans: [] };
    expect([model(busy, { fullDay: true }).startMinute, model(busy, { fullDay: true }).endMinute]).toEqual([0, 1440]);
    expect(model({ sessions: [], spans: [] }).endMinute).toBe(1440);
  });

  it("puts ticks on whole hours, spaced by how much is shown", () => {
    expect(model({ sessions: [session("09:00", "12:00")], spans: [] }).ticks.map((t) => t.label)).toEqual(["08:00", "09:00", "10:00", "11:00", "12:00"]);
    expect(model({ sessions: [], spans: [] }).ticks.map((t) => t.label)).toEqual(["00:00", "03:00", "06:00", "09:00", "12:00", "15:00", "18:00", "21:00", "24:00"]);
  });
});

describe("placing things", () => {
  it("places a span by its share of the axis", () => {
    const m = model({ sessions: [], spans: [span("10:00", "11:00"), span("12:00", "13:00")] });
    // axis 10:00 to 13:00 widened to four hours: 09:00 to 13:00
    expect([m.startMinute, m.endMinute]).toEqual([9 * 60, 13 * 60]);
    expect(m.spans[0].left).toBeCloseTo(0.25);
    expect(m.spans[0].width).toBeCloseTo(0.25);
    expect(m.spans[1].left).toBeCloseTo(0.75);
  });

  it("keeps a very short visit visible, inside the axis", () => {
    const m = model({ sessions: [session("09:00", "13:00")], spans: [{ ...span("12:59", "12:59", "distraction", "a.com"), end: z("13:00") }, span("09:00", "09:00")] });
    expect(m.spans[0].width).toBeGreaterThanOrEqual(0.006);
    expect(m.spans[0].left + m.spans[0].width).toBeLessThanOrEqual(1);
    expect(m.spans[1].width).toBe(0.006);
  });

  it("keeps the site on distraction spans so the chart can highlight it", () => {
    const m = model({ sessions: [], spans: [span("10:00", "10:05", "distraction", "reddit.com")] });
    expect(m.spans[0]).toMatchObject({ kind: "distraction", domain: "reddit.com" });
  });

  it("ends a running session now on today, and at the end of the day on a past day", () => {
    const running = { sessions: [session("14:00", null)], spans: [] };
    const today = model(running, { isToday: true });
    expect(today.sessions[0].left + today.sessions[0].width).toBeCloseTo((15 * 60 - today.startMinute) / (today.endMinute - today.startMinute));
    const past = model(running, { isToday: false });
    expect(past.endMinute).toBe(1440);
  });

  it("stops a span that crosses midnight at midnight", () => {
    const m = model({ sessions: [], spans: [{ ...span("23:50", "23:55"), end: "2026-10-06T00:10:00.000Z" }] }, { fullDay: true });
    expect(m.spans[0].left + m.spans[0].width).toBeCloseTo(1);
  });

  it("uses the user's wall clock", () => {
    // 04:00Z is 09:30 in Kolkata (UTC+5:30)
    const m = model({ sessions: [session("04:00", "05:00")], spans: [] }, { timeZone: "Asia/Kolkata" });
    expect(m.spans.length + m.sessions.length).toBe(1);
    expect(m.startMinute).toBe(8 * 60); // 09:30 to 10:30, widened to four hours: 08:00 to 12:00
  });
});

describe("describeSession", () => {
  const now = Date.parse(z("15:00"));

  it("gives the times, the length and the share spent on distractions", () => {
    expect(describeSession(session("09:00", "11:30", 1500), "UTC", now, false)).toBe("09:00 to 11:30 · 2h 30m · 25m on distractions (17%)");
  });

  it("says so when a session had no distractions", () => {
    expect(describeSession(session("09:00", "09:45"), "UTC", now, false)).toBe("09:00 to 09:45 · 45m · no distractions");
  });

  it("describes a running session up to now", () => {
    expect(describeSession(session("14:00", null, 300), "UTC", now, true)).toBe("14:00 to now · 1h · 5m on distractions (8%)");
  });

  it("does not invent an end for an open session on a past day", () => {
    expect(describeSession(session("14:00", null), "UTC", now, false)).toBe("14:00 · no end was recorded");
  });
});

describe("clockTime", () => {
  it("formats on the user's clock", () => {
    expect(clockTime(z("04:00"), "Asia/Kolkata")).toBe("09:30");
    expect(clockTime(z("09:05"), "UTC")).toBe("09:05");
  });
});
