import { describe, expect, it } from "vitest";
import { siteDelta, usualLine } from "./insight";

// 2026-10-05 is a Monday.
const summary = (now: number, usual: number | null, pace: number | null = null, days = usual === null ? 0 : 3) => ({
  date: "2026-10-05",
  totals: { distractedSeconds: now } as never,
  usual: { days, distractedSeconds: usual, paceSeconds: pace },
});

describe("usualLine", () => {
  it("says nothing without history or with a usual of nothing", () => {
    expect(usualLine(summary(1200, null), false)).toBeNull();
    expect(usualLine(summary(1200, 0), false)).toBeNull();
  });

  it("says how much less or more than the usual weekday", () => {
    expect(usualLine(summary(900, 1800), false)).toBe("15m less than your usual Monday.");
    expect(usualLine(summary(2520, 1800), false)).toBe("12m more than your usual Monday.");
    expect(usualLine(summary(0, 1800), false)).toBe("30m less than your usual Monday.");
  });

  it("calls anything within 5% about the usual", () => {
    expect(usualLine(summary(1810, 1800), false)).toBe("About your usual Monday.");
    expect(usualLine(summary(1720, 1800), false)).toBe("About your usual Monday.");
  });

  it("does not compare a day in progress as a difference", () => {
    expect(usualLine(summary(600, 3600), true)).toBe("10m so far. Your usual Monday is 1h.");
  });
});

describe("usualLine for a day in progress, with a pace", () => {
  it("compares with what is usual by this time of day", () => {
    expect(usualLine(summary(1800, 3600, 900), true)).toBe("15m more than usual by now.");
    expect(usualLine(summary(300, 3600, 900), true)).toBe("10m less than usual by now.");
  });

  it("calls anything close to the pace about usual, with a minute of slack even when the pace is nothing", () => {
    expect(usualLine(summary(930, 3600, 900), true)).toBe("About what's usual by now.");
    expect(usualLine(summary(30, 3600, 0), true)).toBe("About what's usual by now.");
    expect(usualLine(summary(600, 3600, 0), true)).toBe("10m more than usual by now.");
  });

  it("uses the full usual day when the history is too thin for a pace, or the day is over", () => {
    expect(usualLine(summary(600, 3600, 900, 1), true)).toBe("10m so far. Your usual Monday is 1h.");
    expect(usualLine(summary(1800, 3600, 900), false)).toBe("30m less than your usual Monday.");
  });
});

describe("siteDelta against something other than usual", () => {
  it("names what it is compared with", () => {
    expect(siteDelta(1800, 600, "last week")).toEqual({ text: "▲ 20m vs last week", spoken: "20m more than last week", more: true });
    expect(siteDelta(600, 1800, "last month")?.spoken).toBe("20m less than last month");
  });
});

describe("siteDelta", () => {
  it("has nothing to say without history", () => {
    expect(siteDelta(1200, null)).toBeNull();
  });

  it("says more or less than usual, with the amount", () => {
    expect(siteDelta(1800, 600)).toEqual({ text: "▲ 20m vs usual", spoken: "20m more than usual", more: true });
    expect(siteDelta(600, 1800)).toEqual({ text: "▼ 20m vs usual", spoken: "20m less than usual", more: false });
  });

  it("ignores differences under a minute", () => {
    expect(siteDelta(600, 630)).toBeNull();
    expect(siteDelta(600, 540)).not.toBeNull(); // exactly a minute counts
  });

  it("rounds the amount to the minute so it stays short", () => {
    expect(siteDelta(1800 + 219, 600)?.text).toBe("▲ 24m vs usual"); // 23m 39s
  });

  it("treats a site that is not usually visited as all new", () => {
    expect(siteDelta(900, 0)?.text).toBe("▲ 15m vs usual");
  });
});
