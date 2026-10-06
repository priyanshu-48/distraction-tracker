import { describe, it, expect } from "vitest";
import { daysBetween, periodBounds, previousPeriod } from "../domain/dates.js";
import {
  MOVER_MIN_SECONDS,
  bestAndWorst,
  firstDistractionByDay,
  heatmap,
  rangeWindows,
  streaks,
  summarizeRange,
} from "../domain/rangeSummary.js";

describe("periodBounds", () => {
  it("runs a week from Monday to Sunday, whichever day inside it is asked for", () => {
    // 2026-03-09 is a Monday
    for (const day of ["2026-03-09", "2026-03-11", "2026-03-15"]) {
      expect(periodBounds("week", day)).toEqual({ start: "2026-03-09", end: "2026-03-15" });
    }
  });

  it("puts a Sunday at the end of its own week, not the start of the next", () => {
    expect(periodBounds("week", "2026-03-08")).toEqual({ start: "2026-03-02", end: "2026-03-08" });
  });

  it("covers the calendar month, including February and leap years", () => {
    expect(periodBounds("month", "2026-03-15")).toEqual({ start: "2026-03-01", end: "2026-03-31" });
    expect(periodBounds("month", "2026-02-10")).toEqual({ start: "2026-02-01", end: "2026-02-28" });
    expect(periodBounds("month", "2028-02-10")).toEqual({ start: "2028-02-01", end: "2028-02-29" });
  });

  it("crosses a year boundary", () => {
    expect(periodBounds("week", "2026-01-01")).toEqual({ start: "2025-12-29", end: "2026-01-04" });
  });
});

describe("previousPeriod and daysBetween", () => {
  it("steps back a week, or to the previous calendar month", () => {
    expect(previousPeriod("week", "2026-03-09")).toEqual({ start: "2026-03-02", end: "2026-03-08" });
    expect(previousPeriod("month", "2026-03-01")).toEqual({ start: "2026-02-01", end: "2026-02-28" });
    expect(previousPeriod("month", "2026-01-01")).toEqual({ start: "2025-12-01", end: "2025-12-31" });
  });

  it("counts whole days", () => {
    expect(daysBetween("2026-03-09", "2026-03-09")).toBe(0);
    expect(daysBetween("2026-03-09", "2026-03-15")).toBe(6);
    expect(daysBetween("2026-02-27", "2026-03-02")).toBe(3);
    expect(daysBetween("2026-03-15", "2026-03-09")).toBe(-6);
  });
});

describe("rangeWindows", () => {
  it("compares a finished week with the whole previous week", () => {
    expect(rangeWindows("week", "2026-03-11", "2026-03-20")).toEqual({
      start: "2026-03-09",
      end: "2026-03-15",
      through: "2026-03-15",
      previous: { start: "2026-03-02", end: "2026-03-08" },
    });
  });

  it("compares a week in progress with the same number of days of the previous week", () => {
    // Wednesday: three days so far, so Monday to Wednesday of the week before
    expect(rangeWindows("week", "2026-03-11", "2026-03-11")).toMatchObject({
      through: "2026-03-11",
      previous: { start: "2026-03-02", end: "2026-03-04" },
    });
  });

  it("compares a month in progress with the same days of the previous month", () => {
    expect(rangeWindows("month", "2026-03-15", "2026-03-15")).toMatchObject({
      through: "2026-03-15",
      previous: { start: "2026-02-01", end: "2026-02-15" },
    });
  });

  it("never reaches past the end of a shorter previous month", () => {
    expect(rangeWindows("month", "2026-03-31", "2026-04-05").previous).toEqual({ start: "2026-02-01", end: "2026-02-28" });
  });

  it("on the first day of a period, compares one day with one day", () => {
    expect(rangeWindows("week", "2026-03-09", "2026-03-09").previous).toEqual({ start: "2026-03-02", end: "2026-03-02" });
  });
});

describe("streaks", () => {
  const day = (distractedSeconds, trackedSeconds = 1000) => ({ distractedSeconds, trackedSeconds });

  it("counts consecutive tracked days at or under the budget, ending at the latest day", () => {
    expect(streaks([day(500), day(900), day(1000)], 1000)).toEqual({ current: 3, longest: 3 });
  });

  it("is ended by a tracked day over the budget", () => {
    expect(streaks([day(500), day(500), day(1001), day(500)], 1000)).toEqual({ current: 1, longest: 2 });
  });

  it("is zero if the latest tracked day was over budget", () => {
    expect(streaks([day(500), day(5000)], 1000)).toEqual({ current: 0, longest: 1 });
  });

  it("skips days with nothing tracked: they neither extend nor break a streak", () => {
    expect(streaks([day(500), day(0, 0), day(0, 0), day(500)], 1000)).toEqual({ current: 2, longest: 2 });
  });

  it("counts a tracked day with no distractions at all as a good day", () => {
    expect(streaks([day(0, 600)], 1000)).toEqual({ current: 1, longest: 1 });
  });

  it("is zero with no days", () => {
    expect(streaks([], 1000)).toEqual({ current: 0, longest: 0 });
  });
});

describe("bestAndWorst", () => {
  const day = (date, distractedSeconds, trackedSeconds = 1000) => ({ date, distractedSeconds, trackedSeconds });

  it("picks the lowest and the highest tracked day", () => {
    const result = bestAndWorst([day("a", 500), day("b", 100), day("c", 900), day("d", 0, 0)]);
    expect(result).toEqual({ best: { date: "b", distractedSeconds: 100 }, worst: { date: "c", distractedSeconds: 900 } });
  });

  it("ignores days with nothing tracked, even though they have the lowest total", () => {
    expect(bestAndWorst([day("a", 0, 0), day("b", 300), day("c", 600)]).best.date).toBe("b");
  });

  it("says nothing with fewer than two tracked days, or when every day is the same", () => {
    expect(bestAndWorst([day("a", 300)])).toEqual({ best: null, worst: null });
    expect(bestAndWorst([day("a", 300), day("b", 300)])).toEqual({ best: null, worst: null });
    expect(bestAndWorst([])).toEqual({ best: null, worst: null });
  });

  it("prefers the earlier day when two are tied", () => {
    expect(bestAndWorst([day("a", 100), day("b", 100), day("c", 900), day("d", 900)])).toMatchObject({
      best: { date: "a" },
      worst: { date: "c" },
    });
  });
});

describe("heatmap", () => {
  it("is seven weekdays by 24 hours, Monday first", () => {
    const grid = heatmap([{ dow: 1, hour: 10, seconds: "900" }, { dow: 7, hour: 23, seconds: 60.4 }]);
    expect(grid).toHaveLength(7);
    expect(grid.every((row) => row.length === 24)).toBe(true);
    expect(grid[0][10]).toBe(900);
    expect(grid[6][23]).toBe(60);
    expect(grid.flat().filter((n) => n > 0)).toHaveLength(2);
  });

  it("is all zeros with no rows", () => {
    expect(heatmap([]).flat().every((n) => n === 0)).toBe(true);
  });

  it("adds rows that fall in the same cell", () => {
    expect(heatmap([{ dow: 2, hour: 3, seconds: 10 }, { dow: 2, hour: 3, seconds: 5 }])[1][3]).toBe(15);
  });
});

describe("firstDistractionByDay", () => {
  it("is the median over a day's sessions of the time to their first distraction", () => {
    const result = firstDistractionByDay([
      { day: "d", seconds: 600 },
      { day: "d", seconds: 1800 },
      { day: "d", seconds: 3000 },
    ]);
    expect(result.get("d")).toBe(1800);
  });

  it("averages the two middle sessions when there is an even number", () => {
    expect(firstDistractionByDay([{ day: "d", seconds: 600 }, { day: "d", seconds: 1200 }]).get("d")).toBe(900);
    expect(firstDistractionByDay([{ day: "d", seconds: 601 }, { day: "d", seconds: 1200 }]).get("d")).toBe(901); // rounded
  });

  it("ignores sessions with no distraction, and is null if none had one", () => {
    expect(firstDistractionByDay([{ day: "d", seconds: null }, { day: "d", seconds: 300 }]).get("d")).toBe(300);
    expect(firstDistractionByDay([{ day: "d", seconds: null }]).get("d")).toBeNull();
  });

  it("keeps days apart, and says nothing about a day with no session", () => {
    const result = firstDistractionByDay([{ day: "a", seconds: 10 }, { day: "b", seconds: 20 }]);
    expect([result.get("a"), result.get("b"), result.has("c")]).toEqual([10, 20, false]);
  });

  it("takes the numeric strings Postgres returns for a count of seconds", () => {
    expect(firstDistractionByDay([{ day: "d", seconds: "1799.5" }]).get("d")).toBe(1800);
  });

  it("is empty with no sessions", () => {
    expect(firstDistractionByDay([]).size).toBe(0);
  });
});

describe("summarizeRange", () => {
  const base = {
    view: "week",
    date: "2026-03-11",
    today: "2026-03-20",
    budgetSeconds: 1000,
    streakFrom: "2026-03-01",
    heatRows: [],
    firstDistractions: new Map(),
  };
  const row = (day, distractedSeconds, trackedSeconds = distractedSeconds, visits = 1) => ({ day, distractedSeconds, trackedSeconds, visits });

  it("lists every day of the period, zero-filled, with the window it covers", () => {
    const result = summarizeRange({ ...base, dailyRows: [row("2026-03-10", 500)], siteRows: [] });
    expect(result).toMatchObject({ start: "2026-03-09", end: "2026-03-15", through: "2026-03-15" });
    expect(result.days.map((d) => d.date)).toEqual(["2026-03-09", "2026-03-10", "2026-03-11", "2026-03-12", "2026-03-13", "2026-03-14", "2026-03-15"]);
    expect(result.days[1]).toMatchObject({ distractedSeconds: 500, trackedSeconds: 500 });
    expect(result.days[0]).toMatchObject({ distractedSeconds: 0, trackedSeconds: 0, visits: 0 });
  });

  it("adds up totals, counts tracked days and days under budget, and averages over tracked days only", () => {
    const result = summarizeRange({
      ...base,
      dailyRows: [row("2026-03-09", 900, 1500, 2), row("2026-03-10", 2000, 2000, 3), row("2026-03-11", 0, 600, 0)],
      siteRows: [],
    });
    expect(result.totals).toEqual({
      distractedSeconds: 2900,
      trackedSeconds: 4100,
      visits: 5,
      daysTracked: 3,
      daysUnderBudget: 2, // the clean day counts, the 2000 s day does not
      avgDistractedSeconds: 967,
    });
  });

  it("does not count days after today in a period that is still going", () => {
    const result = summarizeRange({ ...base, today: "2026-03-11", dailyRows: [row("2026-03-10", 500), row("2026-03-13", 7777)], siteRows: [] });
    expect(result.through).toBe("2026-03-11");
    expect(result.totals.distractedSeconds).toBe(500);
    expect(result.days).toHaveLength(7);
  });

  it("compares with the previous period over the same days, and says how many days it had", () => {
    const result = summarizeRange({
      ...base,
      today: "2026-03-11",
      dailyRows: [row("2026-03-09", 600), row("2026-03-02", 300), row("2026-03-04", 100), row("2026-03-06", 9999)],
      siteRows: [],
    });
    expect(result.previous).toMatchObject({ start: "2026-03-02", end: "2026-03-04", distractedSeconds: 400, daysTracked: 2 });
  });

  it("lists the biggest distraction sites with their previous time, and movers in both directions", () => {
    const result = summarizeRange({
      ...base,
      dailyRows: [row("2026-03-09", 100), row("2026-03-02", 100)],
      siteRows: [
        { period: "cur", domain: "reddit.com", seconds: 3200, visits: 3 },
        { period: "cur", domain: "youtube.com", seconds: 200, visits: 1 },
        { period: "cur", domain: "same.com", seconds: 500, visits: 1 },
        { period: "prev", domain: "reddit.com", seconds: 400, visits: 1 },
        { period: "prev", domain: "youtube.com", seconds: 1000, visits: 2 },
        { period: "prev", domain: "same.com", seconds: 480, visits: 1 },
        { period: "prev", domain: "gone.com", seconds: 700, visits: 1 },
      ],
    });
    expect(result.topSites.map((s) => [s.domain, s.seconds, s.previousSeconds])).toEqual([
      ["reddit.com", 3200, 400],
      ["same.com", 500, 480],
      ["youtube.com", 200, 1000],
    ]);
    expect(result.movers.up.map((m) => [m.domain, m.change])).toEqual([["reddit.com", 2800]]);
    expect(result.movers.down.map((m) => [m.domain, m.change])).toEqual([["youtube.com", -800], ["gone.com", -700]]);
    // a 20 second difference is noise
    expect([...result.movers.up, ...result.movers.down].some((m) => m.domain === "same.com")).toBe(false);
    expect(MOVER_MIN_SECONDS).toBe(60);
  });

  it("has no previous time and no movers when the previous period had nothing tracked", () => {
    const result = summarizeRange({
      ...base,
      dailyRows: [row("2026-03-09", 100)],
      siteRows: [{ period: "cur", domain: "reddit.com", seconds: 900, visits: 3 }],
    });
    expect(result.previous.daysTracked).toBe(0);
    expect(result.topSites[0].previousSeconds).toBeNull();
    expect(result.movers).toEqual({ up: [], down: [] });
  });

  it("limits top sites to five and movers to three each way", () => {
    const cur = Array.from({ length: 8 }, (_, i) => ({ period: "cur", domain: `s${i}.com`, seconds: 1000 + i * 100, visits: 1 }));
    const result = summarizeRange({ ...base, dailyRows: [row("2026-03-02", 1)], siteRows: cur });
    expect(result.topSites).toHaveLength(5);
    expect(result.movers.up).toHaveLength(3);
    expect(result.movers.up[0].domain).toBe("s7.com");
  });

  it("gives streaks as of today whatever period is shown, and a first-distraction time only for days that have one", () => {
    const result = summarizeRange({
      ...base,
      streakFrom: "2026-03-01",
      dailyRows: [row("2026-03-01", 500), row("2026-03-02", 500), row("2026-03-10", 500)],
      siteRows: [],
      firstDistractions: new Map([["2026-03-10", 1800]]),
    });
    expect(result.streak).toEqual({ current: 3, longest: 3 });
    expect(result.days[1].firstDistractionAfterSeconds).toBe(1800);
    expect(result.days[0].firstDistractionAfterSeconds).toBeNull();
  });

  it("works for a month", () => {
    const result = summarizeRange({ ...base, view: "month", date: "2026-03-15", dailyRows: [row("2026-03-31", 100)], siteRows: [] });
    expect(result.days).toHaveLength(31);
    expect(result.totals.distractedSeconds).toBe(0); // 31 March is after today (20 March)
  });
});
