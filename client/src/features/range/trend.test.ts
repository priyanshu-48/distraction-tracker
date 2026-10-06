import { describe, expect, it } from "vitest";
import { slipSentence, slipSummary } from "./trend";

const day = (date: string, first: number | null) => ({
  date,
  distractedSeconds: 0,
  trackedSeconds: 0,
  visits: 0,
  firstDistractionAfterSeconds: first,
});

describe("slipSummary", () => {
  it("averages the days that have a value and names the longest", () => {
    const result = slipSummary([day("2026-10-05", 600), day("2026-10-06", null), day("2026-10-07", 3000), day("2026-10-08", 1200)]);
    expect(result).toEqual({ count: 3, averageSeconds: 1600, longest: { date: "2026-10-07", seconds: 3000 } });
  });

  it("is null when no day has a value", () => {
    expect(slipSummary([day("2026-10-05", null)])).toBeNull();
    expect(slipSummary([])).toBeNull();
  });

  it("counts a first distraction at the very start (0 seconds) as a value, not a missing day", () => {
    expect(slipSummary([day("2026-10-05", 0), day("2026-10-06", 600)])).toMatchObject({ count: 2, averageSeconds: 300 });
  });

  it("prefers the earlier day when two are tied for longest", () => {
    expect(slipSummary([day("2026-10-05", 900), day("2026-10-06", 900)])!.longest.date).toBe("2026-10-05");
  });
});

describe("slipSentence", () => {
  // 2026-10-05 is a Monday
  it("says the usual time and the longest day", () => {
    expect(slipSentence(slipSummary([day("2026-10-05", 600), day("2026-10-07", 3000)]))).toBe(
      "Usually 30m after you start. Longest on Wednesday (50m)."
    );
  });

  it("words a single day differently", () => {
    expect(slipSentence(slipSummary([day("2026-10-06", 4320)]))).toBe("On Tuesday it took 1h 12m after you started.");
  });

  it("says nothing without a value", () => {
    expect(slipSentence(null)).toBeNull();
  });
});
