import { describe, expect, it } from "vitest";
import { buildTimelineModel, clockTime, describeSession, listSessions } from "./timelineModel";
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
    const m = model({ sessions: [], spans: [span("10:00", "11:00"), span("11:30", "12:30")] });
    // activity 10:00 to 12:30 widened to four hours: 09:00 to 13:00
    expect([m.startMinute, m.endMinute]).toEqual([9 * 60, 13 * 60]);
    expect(m.spans[0].left).toBeCloseTo(0.25);
    expect(m.spans[0].width).toBeCloseTo(0.25);
    expect(m.spans[1].left).toBeCloseTo(0.625);
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

describe("bands", () => {
  it("draws sessions less than ten minutes apart as one band", () => {
    const m = model({ sessions: [session("11:55", "11:56"), session("12:03", "12:04"), session("12:30", "12:31")], spans: [] });
    expect(m.sessions).toHaveLength(2); // the first two merge, the third is 26 minutes later
    expect(m.sessions[0].width).toBeCloseTo(9 / (m.endMinute - m.startMinute)); // 11:55 to 12:04
  });

  it("keeps sessions that are further apart as separate bands", () => {
    expect(model({ sessions: [session("09:00", "09:30"), session("10:00", "10:30")], spans: [] }).sessions).toHaveLength(2);
  });

  it("merges an overlapping or contained session into the one that holds it", () => {
    const m = model({ sessions: [session("09:00", "11:00"), session("09:30", "10:00")], spans: [] });
    expect(m.sessions).toHaveLength(1);
    expect(m.sessions[0].width).toBeCloseTo(120 / (m.endMinute - m.startMinute));
  });

  it("merges sessions given out of order", () => {
    expect(model({ sessions: [session("12:03", "12:04"), session("11:55", "11:56")], spans: [] }).sessions).toHaveLength(1);
  });
});

describe("listSessions", () => {
  const now = Date.parse(z("15:00"));
  const sec = (start: string, seconds: number, distracted = 0) => ({
    start: z(start),
    end: new Date(Date.parse(z(start)) + seconds * 1000).toISOString(),
    distractedSeconds: distracted,
  });

  it("lists normal sessions and counts the stray ones", () => {
    const { lines, hidden } = listSessions([sec("11:55", 44, 14), sec("15:31", 1), sec("15:31", 15), sec("15:36", 76, 12)], "UTC", now, false);
    expect(lines.map((l) => l.text)).toEqual([
      "11:55 to 11:55 · 44s · 14s on distractions (32%)",
      "15:36 to 15:37 · 1m 16s · 12s on distractions (16%)",
    ]);
    expect(hidden).toBe(2);
  });

  it("always lists a session with a distraction, even a short one, and a running one", () => {
    const { lines, hidden } = listSessions([sec("10:00", 5, 3), { start: z("14:59"), end: null, distractedSeconds: 0 }], "UTC", now, true);
    expect(lines).toHaveLength(2);
    expect(hidden).toBe(0);
  });

  it("keeps a session of exactly thirty seconds", () => {
    expect(listSessions([sec("10:00", 30)], "UTC", now, false)).toMatchObject({ hidden: 0, lines: [{}] });
  });

  it("counts everything as hidden when all sessions are stray", () => {
    expect(listSessions([sec("10:00", 2), sec("11:00", 4)], "UTC", now, false)).toEqual({ lines: [], hidden: 2 });
  });
});

describe("breaks in the axis", () => {
  // The day from a real screenshot: a stray minute before noon, then a short burst mid-afternoon.
  const sparse = {
    sessions: [session("11:55", "11:56"), session("15:31", "15:32"), session("15:59", "16:04")],
    spans: [span("11:55", "11:56", "distraction", "a.com"), span("15:59", "16:04", "distraction", "b.com")],
  };

  it("cuts a long gap out of the axis and puts a break where it was", () => {
    const m = model(sparse);
    expect(m.breaks).toHaveLength(1);
    // stretches 11:00 to 12:00 and 15:00 to 17:00, laid side by side with a gap between
    expect([m.startMinute, m.endMinute]).toEqual([11 * 60, 17 * 60]);
    expect(m.breaks[0].left).toBeCloseTo((60 / 180) * 0.95);
    expect(m.breaks[0].width).toBeCloseTo(0.05);
  });

  it("gives each stretch width in proportion to its own length, so a busy afternoon is not squeezed by a quiet morning", () => {
    const m = model(sparse);
    const [morning, afternoon] = m.spans;
    expect(morning.left).toBeLessThan(m.breaks[0].left);
    expect(afternoon.left).toBeGreaterThan(m.breaks[0].left + m.breaks[0].width);
    // 15:59 to 16:04 is five minutes of a two-hour stretch that takes about 63% of the axis
    expect(afternoon.width).toBeCloseTo((5 / 120) * 0.95 * (120 / 180), 2);
  });

  it("does not need four hours of axis when there is more than one stretch", () => {
    const m = model(sparse);
    expect(m.endMinute - m.startMinute).toBe(6 * 60); // 11-12 and 15-17 plus the cut-out gap
  });

  it("keeps everything inside the axis and inside its own stretch", () => {
    const m = model(sparse);
    for (const item of [...m.spans, ...m.sessions]) {
      expect(item.left).toBeGreaterThanOrEqual(0);
      expect(item.left + item.width).toBeLessThanOrEqual(1 + 1e-9);
    }
    const [first, , third] = m.sessions.length === 3 ? m.sessions : [m.sessions[0], null, m.sessions[1]];
    expect(first.left + first.width).toBeLessThanOrEqual(m.breaks[0].left + 1e-9);
    expect(third!.left).toBeGreaterThanOrEqual(m.breaks[0].left + m.breaks[0].width - 1e-9);
  });

  it("breaks only when the gap is longer than 45 minutes", () => {
    const at45 = model({ sessions: [session("10:00", "10:30"), session("11:15", "11:30")], spans: [] });
    const at46 = model({ sessions: [session("10:00", "10:30"), session("11:16", "11:30")], spans: [] });
    expect(at45.breaks).toHaveLength(0);
    expect(at46.breaks).toHaveLength(0); // they break apart but the rounded stretches touch (10-11 and 11-12), so they join again
    const apart = model({ sessions: [session("10:00", "10:30"), session("12:30", "12:40")], spans: [] });
    expect(apart.breaks).toHaveLength(1);
  });

  it("shows midnight to midnight with no breaks when asked for the full day", () => {
    const m = model(sparse, { fullDay: true });
    expect(m.breaks).toEqual([]);
    expect([m.startMinute, m.endMinute]).toEqual([0, 1440]);
  });

  it("has no breaks for one stretch of activity, even a long one", () => {
    expect(model({ sessions: [session("09:00", "17:00")], spans: [] }).breaks).toEqual([]);
  });
});

describe("tick labels", () => {
  const sparse = { sessions: [session("11:55", "11:56"), session("15:31", "16:04")], spans: [] };

  it("keeps every label out of the break, with the edge labels hanging inward", () => {
    const m = model(sparse);
    const gap = m.breaks[0];
    for (const tick of m.ticks) expect(tick.left > gap.left + 1e-9 && tick.left < gap.left + gap.width - 1e-9).toBe(false);
    const beforeBreak = m.ticks.filter((t) => t.left <= gap.left + 1e-9);
    expect(beforeBreak[0].align).toBe("start");
    expect(beforeBreak[beforeBreak.length - 1]).toMatchObject({ align: "end", label: "12:00" });
    const afterBreak = m.ticks.filter((t) => t.left >= gap.left + gap.width - 1e-9);
    expect(afterBreak[0]).toMatchObject({ align: "start", label: "15:00" });
  });

  it("labels a stretch that is too narrow for more with just where it starts", () => {
    const narrow = model({ sessions: [session("04:10", "04:20"), session("10:00", "20:00")], spans: [] });
    const first = narrow.ticks.filter((t) => t.left < narrow.breaks[0].left);
    expect(first.map((t) => t.label)).toEqual(["04:00"]);
  });

  it("never puts two labels at the same place", () => {
    const m = model(sparse);
    const lefts = m.ticks.map((t) => t.left.toFixed(4));
    expect(new Set(lefts).size).toBe(lefts.length);
  });
});
