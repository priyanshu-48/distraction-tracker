import { describe, expect, it } from "vitest";
import { HEAT_LEVELS, hourRange, heatmapModel, peakSentence } from "./heatmapModel";

const grid = (cells: Array<[dow: number, hour: number, seconds: number]> = []) => {
  const g = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const [dow, hour, seconds] of cells) g[dow][hour] = seconds;
  return g;
};

describe("heatmapModel", () => {
  it("has a cell for every weekday and hour, Monday first", () => {
    const { cells } = heatmapModel(grid());
    expect(cells).toHaveLength(7 * 24);
    expect(cells[0]).toMatchObject({ dow: 0, hour: 0 });
    expect(cells[24]).toMatchObject({ dow: 1, hour: 0 });
    expect(cells[167]).toMatchObject({ dow: 6, hour: 23 });
  });

  it("scales the level to the busiest cell: that one is the top level, anything above zero is at least 1", () => {
    const { cells, max } = heatmapModel(grid([[0, 10, 1000], [1, 11, 500], [2, 12, 1]]));
    expect(max).toBe(1000);
    const level = (dow: number, hour: number) => cells.find((c) => c.dow === dow && c.hour === hour)!.level;
    expect(level(0, 10)).toBe(HEAT_LEVELS);
    expect(level(1, 11)).toBe(2); // half way
    expect(level(2, 12)).toBe(1); // a single second is still visible
    expect(level(3, 3)).toBe(0);
  });

  it("makes a lone small value the top level too (it is the busiest there is)", () => {
    expect(heatmapModel(grid([[4, 4, 1]])).cells.find((c) => c.seconds === 1)!.level).toBe(HEAT_LEVELS);
  });

  it("finds the peak and the five busiest, ties going to the earlier weekday and hour", () => {
    const { peak, top } = heatmapModel(grid([[3, 10, 900], [0, 9, 900], [0, 8, 900], [5, 22, 100], [1, 1, 50], [2, 2, 40], [4, 4, 30]]));
    expect(peak).toMatchObject({ dow: 0, hour: 8 });
    expect(top.map((c) => [c.dow, c.hour])).toEqual([[0, 8], [0, 9], [3, 10], [5, 22], [1, 1]]);
  });

  it("has no peak for a grid with nothing in it, including an empty or short one", () => {
    expect(heatmapModel(grid()).peak).toBeNull();
    expect(heatmapModel([]).peak).toBeNull();
    expect(heatmapModel([[5, 5]]).cells).toHaveLength(168);
    expect(heatmapModel([[5, 5]]).peak).toMatchObject({ dow: 0, hour: 0, seconds: 5 });
  });

  it("ignores a negative number rather than drawing it", () => {
    const { cells, peak } = heatmapModel(grid([[0, 0, -50]]));
    expect(peak).toBeNull();
    expect(cells.every((c) => c.seconds === 0 && c.level === 0)).toBe(true);
  });
});

describe("hourRange and peakSentence", () => {
  it("writes an hour as a range, including the last hour of the day", () => {
    expect(hourRange(9)).toBe("09:00 to 10:00");
    expect(hourRange(23)).toBe("23:00 to 24:00");
  });

  it("names the busiest weekday and hour, plural for a month", () => {
    const peak = { dow: 3, hour: 10, seconds: 1400, level: 4 };
    expect(peakSentence(peak, false)).toBe("Most distraction time: Thursday 10:00 to 11:00 (23m).");
    expect(peakSentence(peak, true)).toBe("Most distraction time: Thursdays 10:00 to 11:00 (23m).");
  });

  it("says nothing without a peak", () => {
    expect(peakSentence(null, false)).toBeNull();
  });
});
