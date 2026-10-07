import { describe, it, expect } from "vitest";
import { budgetAlert, formatDuration, reachedBudgetLevel } from "../domain/budgetAlerts.js";

describe("reachedBudgetLevel", () => {
  const budget = 3600;

  it.each([
    ["nothing yet", 0, null],
    ["just under 80%", 2879, null],
    ["exactly 80%", 2880, 0.8],
    ["between 80% and the budget", 3599, 0.8],
    ["exactly the budget", 3600, 1],
    ["well over", 9000, 1],
  ])("%s -> %s", (_label, seconds, expected) => {
    expect(reachedBudgetLevel(seconds, budget)).toBe(expected);
  });

  it("returns only the highest level, so one long visit does not raise two alerts", () => {
    expect(reachedBudgetLevel(5000, budget)).toBe(1);
  });

  it("never raises an alert for a budget that makes no sense", () => {
    expect(reachedBudgetLevel(100, 0)).toBeNull();
    expect(reachedBudgetLevel(100, -5)).toBeNull();
    expect(reachedBudgetLevel(100, undefined)).toBeNull();
  });
});

describe("formatDuration", () => {
  it.each([
    [0, "0s"], [45, "45s"], [60, "1m"], [89, "1m"], [2400, "40m"], [3600, "1h"], [3900, "1h 5m"], [7200, "2h"], [7229, "2h"], [-5, "0s"],
  ])("%s seconds -> %s", (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected);
  });
});

describe("budgetAlert", () => {
  const facts = { distractedSeconds: 2900, budgetSeconds: 3600, topSite: { domain: "youtube.com", seconds: 2400 } };

  it("warns at 80% and names the biggest site and the time", () => {
    expect(budgetAlert(0.8, facts)).toEqual({
      kind: "budget-warning",
      title: "80% of today's distraction budget used",
      body: "youtube.com is your biggest distraction today: 40m. 48m of 1h so far.",
    });
  });

  it("says plainly when the budget is passed", () => {
    expect(budgetAlert(1, { ...facts, distractedSeconds: 3700 })).toMatchObject({
      kind: "budget-over",
      title: "You are over today's distraction budget",
    });
  });

  it("works without a top site", () => {
    expect(budgetAlert(0.8, { ...facts, topSite: undefined }).body).toBe("48m of 1h so far.");
  });

  it("carries only a site name and times: no URL or page title can get in", () => {
    const text = JSON.stringify(budgetAlert(1, facts));
    expect(text).not.toMatch(/https?:|\/\//);
  });
});
