import { describe, it, expect } from "vitest";
import {
  BREAK_SECONDS,
  MAX_SPANS,
  RECENT_VISITS,
  TOP_SITES,
  buildTimeline,
  longestFocusStretch,
  medianTimeToFirstDistraction,
  summarizeDay,
  usualBaseline,
} from "../domain/daySummary.js";
import { addDays, earliestDate, isCalendarDate, todayIn } from "../domain/dates.js";

const DAY = "2026-10-05";
const t = (hhmm, sec = 0) => new Date(`${DAY}T${hhmm}:${String(sec).padStart(2, "0")}Z`);

/** A visit from `start` ("HH:MM") for `secondsLong`. */
const visit = (domain, start, secondsLong, marked = false) => {
  const started_at = t(start);
  return { domain, started_at, ended_at: new Date(started_at.getTime() + secondsLong * 1000), duration: secondsLong, marked };
};

describe("longestFocusStretch", () => {
  it("is zero for an empty day or a day of only distractions", () => {
    expect(longestFocusStretch([])).toBe(0);
    expect(longestFocusStretch([visit("reddit.com", "10:00", 600, true)])).toBe(0);
  });

  it("adds up consecutive non-distraction visits", () => {
    const rows = [visit("a.com", "10:00", 600), visit("b.com", "10:10", 300)];
    expect(longestFocusStretch(rows)).toBe(900);
  });

  it("ends a stretch at a distraction and starts a new one after it", () => {
    const rows = [
      visit("a.com", "10:00", 1200), // 20 min
      visit("reddit.com", "10:20", 300, true),
      visit("b.com", "10:25", 600), // 10 min
    ];
    expect(longestFocusStretch(rows)).toBe(1200);
  });

  it("keeps a stretch going across a short pause", () => {
    const rows = [visit("a.com", "12:00", 600), visit("b.com", "12:11", 600)]; // 60 s pause
    expect(longestFocusStretch(rows)).toBe(1200);
  });

  it("treats a pause longer than the break limit as the end of the stretch", () => {
    const rows = [visit("a.com", "12:00", 600), visit("b.com", "12:16", 300)]; // 6 min pause
    expect(BREAK_SECONDS).toBe(300);
    expect(longestFocusStretch(rows)).toBe(600);
  });

  it("allows a pause of exactly the limit", () => {
    const rows = [visit("a.com", "12:00", 600), visit("b.com", "12:15", 300)]; // exactly 5 min pause
    expect(longestFocusStretch(rows)).toBe(900);
  });

  it("counts only time on the pages, not the pauses", () => {
    const rows = [visit("a.com", "09:00", 60), visit("b.com", "09:04", 60)]; // 3 min pause
    expect(longestFocusStretch(rows)).toBe(120);
  });

  it("does not let a distraction's gap leak into the next stretch", () => {
    const rows = [visit("a.com", "10:00", 600), visit("reddit.com", "10:10", 60, true), visit("b.com", "10:11", 120)];
    expect(longestFocusStretch(rows)).toBe(600);
  });
});

describe("medianTimeToFirstDistraction", () => {
  const session = (start, end) => ({ start_time: t(start), end_time: end ? t(end) : null });

  it("is null when no session had a distraction", () => {
    expect(medianTimeToFirstDistraction([visit("a.com", "10:05", 60)], [session("10:00", "11:00")])).toBeNull();
    expect(medianTimeToFirstDistraction([], [])).toBeNull();
  });

  it("measures from the start of the session to the first distraction in it", () => {
    const rows = [visit("a.com", "10:05", 60), visit("reddit.com", "10:20", 60, true), visit("reddit.com", "10:40", 60, true)];
    expect(medianTimeToFirstDistraction(rows, [session("10:00", "11:00")])).toBe(1200);
  });

  it("takes the middle value across sessions, averaging the two middle ones", () => {
    const rows = [visit("reddit.com", "10:10", 60, true), visit("reddit.com", "14:20", 60, true)];
    const sessions = [session("10:00", "11:00"), session("14:00", "15:00")];
    expect(medianTimeToFirstDistraction(rows, sessions)).toBe(900); // between 600 and 1200
  });

  it("takes the middle one of three", () => {
    const rows = [visit("r.com", "10:05", 60, true), visit("r.com", "12:20", 60, true), visit("r.com", "14:45", 60, true)];
    const sessions = [session("10:00", "11:00"), session("12:00", "13:00"), session("14:00", "15:00")];
    expect(medianTimeToFirstDistraction(rows, sessions)).toBe(1200);
  });

  it("ignores distractions outside the session, and handles a session still running", () => {
    const rows = [visit("reddit.com", "09:50", 60, true), visit("reddit.com", "10:30", 60, true)];
    expect(medianTimeToFirstDistraction(rows, [session("10:00", null)])).toBe(1800);
    expect(medianTimeToFirstDistraction([visit("reddit.com", "11:30", 60, true)], [session("10:00", "11:00")])).toBeNull();
  });
});

describe("summarizeDay", () => {
  const rows = [
    visit("github.com", "09:00", 1800),
    visit("youtube.com", "09:30", 600, true),
    visit("youtube.com", "10:00", 300, true),
    visit("reddit.com", "10:10", 60, true),
    visit("docs.dev", "10:15", 900),
    visit("news.site", "10:40", 120),
  ];
  const summary = summarizeDay(rows, [{ start_time: t("09:00"), end_time: t("12:00") }]);

  it("splits tracked time into distraction and other", () => {
    expect(summary.totals).toMatchObject({ distractedSeconds: 960, otherSeconds: 2820, trackedSeconds: 3780, visits: 3 });
    expect(summary.totals.avgVisitSeconds).toBe(320);
  });

  it("lists distractions by time with visits, average and pattern", () => {
    expect(summary.topSites.map((s) => [s.domain, s.seconds, s.visits])).toEqual([
      ["youtube.com", 900, 2],
      ["reddit.com", 60, 1],
    ]);
    expect(summary.topSites[0]).toMatchObject({ avgSeconds: 450, marked: true, type: null });
  });

  it("lists the unmarked sites with the most time for classifying", () => {
    expect(summary.toClassify.map((s) => s.domain)).toEqual(["github.com", "docs.dev", "news.site"]);
  });

  it("gives recent visits newest first", () => {
    expect(summary.recent.map((r) => r.domain)).toEqual(["news.site", "docs.dev", "reddit.com", "youtube.com", "youtube.com", "github.com"]);
    expect(summary.recent[0]).toEqual({ domain: "news.site", startedAt: "2026-10-05T10:40:00.000Z", seconds: 120, marked: false });
  });

  it("includes the focus numbers", () => {
    expect(summary.focus).toEqual({ longestStretchSeconds: 1800, firstDistractionAfterSeconds: 1800 });
  });

  it("is all zeros and empty lists for an empty day", () => {
    const empty = summarizeDay([], []);
    expect(empty.totals).toMatchObject({ distractedSeconds: 0, otherSeconds: 0, trackedSeconds: 0, visits: 0, avgVisitSeconds: 0, type: null });
    expect(empty.topSites).toEqual([]);
    expect(empty.toClassify).toEqual([]);
    expect(empty.recent).toEqual([]);
    expect(empty.focus).toEqual({ longestStretchSeconds: 0, firstDistractionAfterSeconds: null });
  });

  it("keeps only the top few sites and the most recent visits", () => {
    const many = Array.from({ length: 30 }, (_, i) => visit(`site${i}.com`, "08:00", 60 + i, true));
    const result = summarizeDay(many, []);
    expect(result.topSites).toHaveLength(TOP_SITES);
    expect(result.topSites[0].domain).toBe("site29.com"); // longest
    expect(result.recent).toHaveLength(RECENT_VISITS);
  });

  it("treats a visit with no duration as zero instead of failing", () => {
    const result = summarizeDay([{ ...visit("a.com", "10:00", 0), duration: null }], []);
    expect(result.totals.otherSeconds).toBe(0);
  });

  it("labels the day's distraction pattern like a single site", () => {
    const habit = Array.from({ length: 12 }, (_, i) => visit("x.com", `1${i % 10}:00`, 30, true));
    expect(summarizeDay(habit, []).totals.type).toBe("checking");
    expect(summarizeDay([visit("x.com", "10:00", 2400, true)], []).totals.type).toBe("binge");
  });
});

describe("date helpers", () => {
  it("recognises only real calendar dates", () => {
    expect(isCalendarDate("2026-10-05")).toBe(true);
    expect(isCalendarDate("2028-02-29")).toBe(true);
    for (const bad of ["2026-02-30", "2026-13-01", "2026-1-05", "yesterday", "", null, undefined, 20261005]) {
      expect(isCalendarDate(bad)).toBe(false);
    }
  });

  it("adds days across month and year ends", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("works out today in a zone, and the oldest allowed day", () => {
    const instant = new Date("2026-10-05T20:00:00Z");
    expect(todayIn("UTC", instant)).toBe("2026-10-05");
    expect(todayIn("Asia/Kolkata", instant)).toBe("2026-10-06");
    expect(earliestDate("2026-10-05")).toBe("2026-07-08");
  });
});

describe("buildTimeline", () => {
  const v = (domain, start, seconds, marked = false) => ({
    domain,
    marked,
    duration: seconds,
    started_at: new Date(Date.UTC(2026, 9, 5, 10, 0, start)),
    ended_at: new Date(Date.UTC(2026, 9, 5, 10, 0, start + seconds)),
  });

  it("merges same-site distraction visits less than a minute apart into one burst and keeps the count", () => {
    const rows = [v("reddit.com", 0, 5, true), v("reddit.com", 20, 5, true), v("reddit.com", 50, 5, true)];
    const { spans } = buildTimeline(rows, []);
    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({ kind: "distraction", domain: "reddit.com", visits: 3, seconds: 15 });
    expect(spans[0].end).toBe(new Date(Date.UTC(2026, 9, 5, 10, 0, 55)).toISOString());
  });

  it("does not merge different sites, different kinds, or visits more than a minute apart", () => {
    const rows = [v("a.com", 0, 5, true), v("b.com", 6, 5, true), v("c.com", 12, 5), v("d.com", 200, 5)];
    expect(buildTimeline(rows, []).spans.map((s) => [s.kind, s.domain, s.visits])).toEqual([
      ["distraction", "a.com", 1],
      ["distraction", "b.com", 1],
      ["other", null, 1],
      ["other", null, 1],
    ]);
  });

  it("merges other time across sites into one anonymous burst", () => {
    const { spans } = buildTimeline([v("a.com", 0, 30), v("b.com", 40, 30)], []);
    expect(spans).toEqual([expect.objectContaining({ kind: "other", domain: null, visits: 2, seconds: 60 })]);
  });

  it("widens the gap until a very busy day fits in MAX_SPANS", () => {
    const rows = Array.from({ length: MAX_SPANS * 3 }, (_, i) => v(`s${i % 2}.com`, i * 100, 5, true));
    const { spans } = buildTimeline(rows, []);
    expect(spans.length).toBeLessThanOrEqual(MAX_SPANS);
    expect(spans.reduce((sum, s) => sum + s.visits, 0)).toBe(rows.length); // nothing dropped
  });

  it("reports sessions, the distraction time inside each, and null for a running one", () => {
    const s = (h1, h2) => ({ start_time: new Date(Date.UTC(2026, 9, 5, h1)), end_time: h2 === null ? null : new Date(Date.UTC(2026, 9, 5, h2)) });
    const rows = [v("r.com", 0, 60, true), v("r.com", 7200, 30, true)]; // 10:00 and 12:00
    const { sessions } = buildTimeline(rows, [s(9, 11), s(11, null)]);
    expect(sessions.map((x) => [x.end === null, x.distractedSeconds])).toEqual([[false, 60], [true, 30]]);
  });

  it("returns nothing for an empty day", () => {
    expect(buildTimeline([], [])).toEqual({ sessions: [], spans: [] });
  });
});

describe("usualBaseline", () => {
  const r = (day, domain, marked, seconds) => ({ day, domain, marked, seconds });

  it("averages over the days that had tracking, including days with no distraction", () => {
    const usual = usualBaseline([r("d1", "a", true, 600), r("d1", "x", false, 100), r("d2", "x", false, 100)]);
    expect(usual.days).toBe(2);
    expect(usual.distractedSeconds).toBe(300);
    expect(usual.siteSeconds("a")).toBe(300);
    expect(usual.siteSeconds("never")).toBe(0);
  });

  it("has nothing to compare with when there is no history", () => {
    const usual = usualBaseline([]);
    expect(usual).toMatchObject({ days: 0, distractedSeconds: null });
    expect(usual.siteSeconds("a")).toBeNull();
  });
});
