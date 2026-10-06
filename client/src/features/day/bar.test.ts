import { describe, expect, it } from "vitest";
import { budgetBar } from "./bar";

describe("budgetBar", () => {
  it("fills part of the bar within budget, with the limit at the end", () => {
    expect(budgetBar(1800, 7200)).toEqual({ withinFraction: 0.25, overFraction: 0, limitFraction: 1, leftSeconds: 5400, overSeconds: 0, paceFraction: null });
  });

  it("is exactly full at the budget, with nothing left or over", () => {
    expect(budgetBar(7200, 7200)).toEqual({ withinFraction: 1, overFraction: 0, limitFraction: 1, leftSeconds: 0, overSeconds: 0, paceFraction: null });
  });

  it("stretches the scale past the budget so 130% reads as 130%", () => {
    const bar = budgetBar(9360, 7200); // 130%
    expect(bar.overSeconds).toBe(2160);
    expect(bar.withinFraction + bar.overFraction).toBeCloseTo(1);
    expect(bar.limitFraction).toBeCloseTo(1 / 1.3);
    expect(bar.overFraction).toBeCloseTo(0.3 / 1.3);
  });

  it("is empty with no distractions, and never negative", () => {
    expect(budgetBar(0, 7200)).toMatchObject({ withinFraction: 0, overFraction: 0, leftSeconds: 7200 });
    expect(budgetBar(-5, 7200).withinFraction).toBe(0);
  });

  it("places the usual-by-now tick as a share of the bar", () => {
    expect(budgetBar(1800, 7200, 3600).paceFraction).toBe(0.5);
    expect(budgetBar(1800, 7200, 0).paceFraction).toBe(0);
    expect(budgetBar(1800, 7200).paceFraction).toBeNull();
  });

  it("makes room for a pace beyond the budget so the tick never leaves the bar", () => {
    const bar = budgetBar(600, 3600, 7200);
    expect(bar.paceFraction).toBe(1);
    expect(bar.withinFraction).toBeCloseTo(600 / 7200);
  });

  it("copes with a zero budget", () => {
    const bar = budgetBar(600, 0);
    expect(bar.withinFraction).toBe(0);
    expect(bar.overFraction).toBe(1);
    expect(bar.overSeconds).toBe(600);
  });
});
