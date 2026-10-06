import { describe, expect, it } from "vitest";
import { formatAgo, formatDayHeading, formatDuration, formatDurationCoarse, formatPercent, siteLabel } from "./format";

describe("formatDuration", () => {
  it.each([
    [0, "0s"],
    [45, "45s"],
    [59.6, "1m"],
    [60, "1m"],
    [750, "12m 30s"],
    [3600, "1h"],
    [4320, "1h 12m"],
    [7200, "2h"],
    [7260, "2h 1m"],
    [86400, "1d"],
    [93600, "1d 2h"],
  ])("%s seconds -> %s", (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected);
  });

  it("treats negative and non-finite input as zero", () => {
    expect(formatDuration(-5)).toBe("0s");
    expect(formatDuration(Number.NaN)).toBe("0s");
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe("0s");
  });

  it("shows only the two largest units", () => {
    expect(formatDuration(3 * 3600 + 5 * 60 + 9)).toBe("3h 5m");
  });
});

describe("formatPercent", () => {
  it("rounds and does not clamp", () => {
    expect(formatPercent(1, 3)).toBe("33%");
    expect(formatPercent(130, 100)).toBe("130%");
  });
  it("is 0% when the whole is zero or invalid", () => {
    expect(formatPercent(5, 0)).toBe("0%");
    expect(formatPercent(Number.NaN, 10)).toBe("0%");
  });
});

describe("formatDurationCoarse", () => {
  it.each([
    [0, "0s"],
    [45, "45s"],
    [59, "59s"],
    [60, "1m"],
    [1015, "17m"], // 16m 55s
    [2846, "47m"],
    [3580, "1h"], // 59m 40s rounds up to the hour
    [6200, "1h 43m"],
    [-5, "0s"],
    [Number.NaN, "0s"],
  ])("%s seconds is %s", (seconds, expected) => {
    expect(formatDurationCoarse(seconds)).toBe(expected);
  });
});

describe("siteLabel", () => {
  it("lower-cases and drops a leading www.", () => {
    expect(siteLabel("WWW.YouTube.com")).toBe("youtube.com");
    expect(siteLabel(" reddit.com ")).toBe("reddit.com");
    expect(siteLabel("news.www.example.com")).toBe("news.www.example.com");
  });
});

describe("formatDayHeading", () => {
  it("formats in the requested zone, which can change the day", () => {
    const instant = new Date("2026-10-05T20:00:00Z");
    expect(formatDayHeading(instant, "UTC")).toBe("Mon, 5 Oct");
    expect(formatDayHeading(instant, "Asia/Kolkata")).toBe("Tue, 6 Oct");
  });
});

describe("formatAgo", () => {
  const now = Date.parse("2026-10-06T12:00:00Z");
  const before = (seconds: number) => new Date(now - seconds * 1000).toISOString();

  it.each([
    [10, "just now"],
    [44, "just now"],
    [60, "1 min ago"],
    [150, "3 min ago"],
    [59 * 60, "59 min ago"],
    [3 * 3600, "3 h ago"],
    [23 * 3600, "23 h ago"],
  ])("%s seconds ago -> %s", (seconds, expected) => {
    expect(formatAgo(before(seconds), now)).toBe(expected);
  });

  it("falls back to a date after a day", () => {
    expect(formatAgo(before(3 * 86400), now)).toBe("3 Oct");
  });

  it("handles a missing, invalid or future time", () => {
    expect(formatAgo(null, now)).toBe("never");
    expect(formatAgo("garbage", now)).toBe("never");
    expect(formatAgo(before(-30), now)).toBe("just now");
  });
});
