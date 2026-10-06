import { describe, expect, it } from "vitest";
import { formatDayHeading, formatDuration, formatPercent, siteLabel } from "./format";

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
