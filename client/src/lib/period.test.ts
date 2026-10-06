import { describe, expect, it } from "vitest";
import {
  addDays,
  canShift,
  changeView,
  earliestDate,
  isCurrent,
  normalizePeriod,
  periodBounds,
  periodLabel,
  shiftPeriod,
  todayIn,
  type Period,
} from "./period";

// Monday 5 October 2026.
const TODAY = "2026-10-05";
const day = (date: string): Period => ({ view: "day", date });
const week = (date: string): Period => ({ view: "week", date });
const month = (date: string): Period => ({ view: "month", date });

describe("todayIn", () => {
  it("is the calendar date in the given zone, which can differ from UTC", () => {
    const instant = new Date("2026-10-05T20:00:00Z");
    expect(todayIn("UTC", instant)).toBe("2026-10-05");
    expect(todayIn("Asia/Kolkata", instant)).toBe("2026-10-06");
    expect(todayIn("America/Los_Angeles", instant)).toBe("2026-10-05");
  });
});

describe("addDays / earliestDate", () => {
  it("crosses month and year ends", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });
  it("keeps 90 days including today", () => {
    expect(earliestDate(TODAY)).toBe("2026-07-08");
  });
});

describe("periodBounds", () => {
  it("is the day itself", () => {
    expect(periodBounds(day("2026-10-07"))).toEqual({ start: "2026-10-07", end: "2026-10-07" });
  });
  it.each([
    ["2026-10-05", "2026-10-05", "2026-10-11"], // Monday
    ["2026-10-08", "2026-10-05", "2026-10-11"], // Thursday
    ["2026-10-11", "2026-10-05", "2026-10-11"], // Sunday
    ["2026-10-01", "2026-09-28", "2026-10-04"], // week spans two months
  ])("week containing %s runs Monday %s to Sunday %s", (date, start, end) => {
    expect(periodBounds(week(date))).toEqual({ start, end });
  });
  it("covers a whole calendar month, including leap-year February", () => {
    expect(periodBounds(month("2026-10-17"))).toEqual({ start: "2026-10-01", end: "2026-10-31" });
    expect(periodBounds(month("2028-02-10"))).toEqual({ start: "2028-02-01", end: "2028-02-29" });
  });
});

describe("normalizePeriod (untrusted URL values)", () => {
  it("defaults to today's day view", () => {
    expect(normalizePeriod({}, TODAY)).toEqual(day(TODAY));
    expect(normalizePeriod({ view: null, date: null }, TODAY)).toEqual(day(TODAY));
  });
  it("accepts a valid view and date", () => {
    expect(normalizePeriod({ view: "week", date: "2026-09-20" }, TODAY)).toEqual(week("2026-09-20"));
  });
  it.each([["year"], ["WEEK"], [""], ["constructor"]])("ignores the unknown view %j", (view) => {
    expect(normalizePeriod({ view }, TODAY).view).toBe("day");
  });
  it.each([["garbage"], ["2026-13-01"], ["2026-02-30"], ["20261005"], ["2026-10-5"]])("ignores the bad date %j", (date) => {
    expect(normalizePeriod({ date }, TODAY).date).toBe(TODAY);
  });
  it("pulls a future date back to today and an old one forward to the limit", () => {
    expect(normalizePeriod({ date: "2026-12-25" }, TODAY).date).toBe(TODAY);
    expect(normalizePeriod({ date: "2020-01-01" }, TODAY).date).toBe("2026-07-08");
  });
});

describe("shiftPeriod and canShift", () => {
  it("steps a day at a time", () => {
    expect(shiftPeriod(day("2026-10-03"), 1, TODAY)).toEqual(day("2026-10-04"));
    expect(shiftPeriod(day("2026-10-03"), -1, TODAY)).toEqual(day("2026-10-02"));
  });

  it("steps a week at a time", () => {
    expect(periodBounds(shiftPeriod(week("2026-10-05"), -1, TODAY))).toEqual({ start: "2026-09-28", end: "2026-10-04" });
    expect(periodBounds(shiftPeriod(week("2026-09-28"), 1, TODAY))).toEqual({ start: "2026-10-05", end: "2026-10-11" });
  });

  it("steps a month at a time, across a year end", () => {
    expect(periodLabel(shiftPeriod(month("2026-10-05"), -1, TODAY))).toBe("September 2026");
    expect(periodLabel(shiftPeriod(month("2026-01-15"), -1, "2026-01-20"))).toBe("December 2025");
  });

  it("cannot go into the future", () => {
    expect(canShift(day(TODAY), 1, TODAY)).toBe(false);
    expect(shiftPeriod(day(TODAY), 1, TODAY)).toEqual(day(TODAY));
    expect(canShift(week(TODAY), 1, TODAY)).toBe(false); // this week is the latest
    expect(canShift(month("2026-10-01"), 1, TODAY)).toBe(false);
  });

  it("can step to a week that has already started but is not over", () => {
    expect(canShift(week("2026-09-28"), 1, TODAY)).toBe(true);
  });

  it("cannot go past 90 days back", () => {
    const limit = earliestDate(TODAY);
    expect(canShift(day(limit), -1, TODAY)).toBe(false);
    expect(canShift(day(addDays(limit, 1)), -1, TODAY)).toBe(true);
    expect(shiftPeriod(day(limit), -1, TODAY)).toEqual(day(limit));
  });

  it("allows a week or month that is only partly inside the history window", () => {
    expect(canShift(week("2026-07-14"), -1, TODAY)).toBe(true); // previous week ends 12 Jul, inside the window
    expect(canShift(month("2026-08-10"), -1, TODAY)).toBe(true); // July runs to 31 Jul, partly inside
    expect(canShift(month("2026-07-10"), -1, TODAY)).toBe(false); // June ends 30 Jun, before 8 Jul
  });
});

describe("changeView", () => {
  it("stays on today when the current period contains it", () => {
    expect(changeView(week("2026-10-05"), "day", TODAY)).toEqual(day(TODAY));
    expect(changeView(day(TODAY), "month", TODAY)).toEqual(month(TODAY));
  });
  it("keeps the browsed date otherwise", () => {
    expect(changeView(week("2026-09-14"), "day", TODAY)).toEqual(day("2026-09-14"));
    expect(periodBounds(changeView(day("2026-09-14"), "month", TODAY))).toEqual({ start: "2026-09-01", end: "2026-09-30" });
  });
});

describe("isCurrent", () => {
  it("is true for any period containing today", () => {
    expect(isCurrent(day(TODAY), TODAY)).toBe(true);
    expect(isCurrent(week("2026-10-07"), TODAY)).toBe(true);
    expect(isCurrent(month("2026-10-31"), TODAY)).toBe(true);
    expect(isCurrent(day("2026-10-04"), TODAY)).toBe(false);
    expect(isCurrent(week("2026-09-28"), TODAY)).toBe(false);
  });
});

describe("periodLabel", () => {
  it.each([
    [day("2026-10-05"), "Mon, 5 Oct"],
    [week("2026-10-08"), "5 to 11 Oct"],
    [week("2026-10-01"), "28 Sep to 4 Oct"],
    [month("2026-10-17"), "October 2026"],
  ])("%o -> %s", (period, label) => {
    expect(periodLabel(period)).toBe(label);
  });
});
