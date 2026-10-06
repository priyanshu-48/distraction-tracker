import { describe, expect, it } from "vitest";
import { comparisonLine, streakText } from "./rangeText";

const base = (now: number, before: number, over: Partial<Parameters<typeof comparisonLine>[0]> = {}) => ({
  view: "week" as const,
  end: "2026-10-11",
  through: "2026-10-11",
  totals: { distractedSeconds: now } as never,
  previous: { daysTracked: 3, distractedSeconds: before } as never,
  ...over,
});

describe("comparisonLine", () => {
  it("says how much less or more than last week", () => {
    expect(comparisonLine(base(3000, 3600))).toBe("10m less than last week.");
    expect(comparisonLine(base(5400, 3600))).toBe("30m more than last week.");
  });

  it("names last month for a month", () => {
    expect(comparisonLine(base(5400, 3600, { view: "month" }))).toBe("30m more than last month.");
  });

  it("says 'same days' for a period that is still going, so it is clear the comparison is like for like", () => {
    expect(comparisonLine(base(5400, 3600, { through: "2026-10-07" }))).toBe("30m more than last week, same days.");
  });

  it("calls anything within 5% about the same, with at least a minute of slack", () => {
    expect(comparisonLine(base(3700, 3600))).toBe("About the same as last week.");
    expect(comparisonLine(base(60, 0))).not.toBe("About the same as last week."); // exactly a minute is a difference
    expect(comparisonLine(base(30, 0))).toBe("About the same as last week.");
  });

  it("rounds the amount to the minute", () => {
    expect(comparisonLine(base(3600 + 1015, 3600))).toBe("17m more than last week.");
  });

  it("says nothing when last week had nothing tracked", () => {
    expect(comparisonLine(base(5400, 0, { previous: { daysTracked: 0, distractedSeconds: 0 } as never }))).toBeNull();
  });
});

describe("streakText", () => {
  it("is shown only for a period that includes today, and only when there is a streak", () => {
    expect(streakText({ current: 4, longest: 6 }, true)).toBe("4 days");
    expect(streakText({ current: 1, longest: 6 }, true)).toBe("1 day");
    expect(streakText({ current: 4, longest: 6 }, false)).toBeNull();
    expect(streakText({ current: 0, longest: 6 }, true)).toBeNull();
  });
});
