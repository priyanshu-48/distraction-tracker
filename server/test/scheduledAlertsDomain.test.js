import { describe, it, expect } from "vitest";
import { currentRun, streakAlert, streakMilestoneReached, weeklyAlert, weeklySummaryDue } from "../domain/scheduledAlerts.js";
import { streaks } from "../domain/rangeSummary.js";
import { addDays } from "../domain/dates.js";

// 2026-03-09 is a Monday; the week to summarise then is Monday 2026-03-02.
describe("weeklySummaryDue", () => {
  it.each([
    ["Monday just before 09:00", "2026-03-09", "08:59:59", null],
    ["Monday at 09:00", "2026-03-09", "09:00:00", "2026-03-02"],
    ["Monday evening", "2026-03-09", "21:30:00", "2026-03-02"],
    ["Tuesday morning (catching up)", "2026-03-10", "03:00:00", "2026-03-02"],
    ["Wednesday (last day to catch up)", "2026-03-11", "23:59:59", "2026-03-02"],
    ["Thursday (too late: stale)", "2026-03-12", "10:00:00", null],
    ["Saturday", "2026-03-14", "10:00:00", null],
    ["Sunday", "2026-03-15", "10:00:00", null],
    ["the next Monday", "2026-03-16", "09:00:00", "2026-03-09"],
  ])("%s", (_label, today, time, expected) => {
    expect(weeklySummaryDue(today, time)).toBe(expected);
  });
});

const day = (date, distractedSeconds, trackedSeconds = 3600) => ({ date, distractedSeconds, trackedSeconds });
const run = (dates) => ({ length: dates.length, dates });

describe("currentRun", () => {
  const budget = 3600;

  it("counts consecutive tracked days at or under the budget, and lists their dates", () => {
    const days = [day("2026-03-01", 100), day("2026-03-02", 3600), day("2026-03-03", 0)];
    expect(currentRun(days, budget)).toEqual({ length: 3, dates: ["2026-03-01", "2026-03-02", "2026-03-03"] });
  });

  it("is broken by a day over budget and starts again after it", () => {
    const days = [day("2026-03-01", 100), day("2026-03-02", 9000), day("2026-03-03", 100), day("2026-03-04", 100)];
    expect(currentRun(days, budget)).toEqual({ length: 2, dates: ["2026-03-03", "2026-03-04"] });
  });

  it("skips days with nothing tracked instead of breaking or extending the run", () => {
    const days = [day("2026-03-01", 100), day("2026-03-02", 0, 0), day("2026-03-03", 100)];
    expect(currentRun(days, budget)).toEqual({ length: 2, dates: ["2026-03-01", "2026-03-03"] });
  });

  it("is empty when the latest tracked day was over budget, and for no days at all", () => {
    expect(currentRun([day("2026-03-01", 100), day("2026-03-02", 9999)], budget).length).toBe(0);
    expect(currentRun([], budget)).toEqual({ length: 0, dates: [] });
  });

  it("always agrees with streaks(), the rule the dashboard shows", () => {
    // A fixed pseudo-random generator keeps this reproducible: 200 different 30-day histories, several budgets.
    let seed = 12345;
    const random = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
    for (let trial = 0; trial < 200; trial++) {
      const days = Array.from({ length: 30 }, (_, i) => {
        const tracked = random() < 0.75;
        return day(addDays("2026-02-01", i), tracked ? Math.floor(random() * 7200) : 0, tracked ? 600 + Math.floor(random() * 3000) : 0);
      });
      for (const budget of [900, 3600, 5400]) {
        expect(currentRun(days, budget).length, `trial ${trial} budget ${budget}`).toBe(streaks(days, budget).current);
      }
    }
  });
});

describe("streakMilestoneReached", () => {
  it.each([[3], [7], [14], [30]])("announces %s when yesterday completed it", (n) => {
    const dates = Array.from({ length: n }, (_, i) => addDays("2026-02-01", i));
    expect(streakMilestoneReached(run(dates), dates.at(-1))).toBe(n);
  });

  it.each([[1], [2], [4], [8], [15], [29]])("announces nothing at %s days", (n) => {
    const dates = Array.from({ length: n }, (_, i) => addDays("2026-02-01", i));
    expect(streakMilestoneReached(run(dates), dates.at(-1))).toBeNull();
  });

  it("does not announce a milestone again on a later day with nothing tracked", () => {
    const dates = ["2026-03-01", "2026-03-02", "2026-03-03"]; // reached on the 3rd
    expect(streakMilestoneReached(run(dates), "2026-03-04")).toBeNull(); // yesterday (the 4th) was untracked
  });

  it("does not announce when the run is not current", () => {
    expect(streakMilestoneReached(run([]), "2026-03-04")).toBeNull();
  });
});

describe("weeklyAlert", () => {
  const totals = { distractedSeconds: 9000, daysTracked: 5, daysUnderBudget: 4 };
  const previous = { distractedSeconds: 10800, daysTracked: 5 };
  const base = { totals, previous, budgetSeconds: 3600, topSite: { domain: "youtube.com", seconds: 5400 } };

  it("states the time, the change on the week before, the days under budget and the biggest site", () => {
    expect(weeklyAlert(base)).toEqual({
      kind: "weekly-summary",
      title: "Your week: 2h 30m on distraction sites",
      body: "17% less than the week before. 4 of 5 tracked days under your daily budget of 1h. Biggest: youtube.com (1h 30m).",
    });
  });

  it("says 'more' when the week was worse", () => {
    expect(weeklyAlert({ ...base, previous: { distractedSeconds: 4500, daysTracked: 5 } }).body).toMatch(/^100% more than the week before\./);
  });

  it("says 'about the same' for a change under 5%", () => {
    expect(weeklyAlert({ ...base, previous: { distractedSeconds: 9100, daysTracked: 5 } }).body).toMatch(/^About the same as the week before\./);
  });

  it("leaves the comparison out when the week before has nothing to compare with", () => {
    for (const previousWeek of [{ distractedSeconds: 0, daysTracked: 3 }, { distractedSeconds: 5000, daysTracked: 0 }]) {
      expect(weeklyAlert({ ...base, previous: previousWeek }).body).toMatch(/^4 of 5 tracked days/);
    }
  });

  it("is kind about a week with no time on distraction sites, and does not name a site", () => {
    const alert = weeklyAlert({ totals: { distractedSeconds: 0, daysTracked: 6, daysUnderBudget: 6 }, previous, budgetSeconds: 3600, topSite: undefined });
    expect(alert.title).toBe("Your week: no time on distraction sites");
    expect(alert.body).not.toMatch(/Biggest/);
  });

  it("handles a single tracked day", () => {
    expect(weeklyAlert({ ...base, totals: { distractedSeconds: 600, daysTracked: 1, daysUnderBudget: 1 }, previous: { distractedSeconds: 0, daysTracked: 0 } }).body).toMatch(/^1 of 1 tracked day under/);
  });

  it("never contains a web address", () => {
    expect(JSON.stringify(weeklyAlert(base))).not.toMatch(/https?:|\/\//);
  });
});

describe("streakAlert", () => {
  it("names the length and the budget", () => {
    expect(streakAlert(7, 3600)).toEqual({
      kind: "streak",
      title: "7 days in a row under your budget",
      body: "Every tracked day stayed within 1h of distraction time. Keep it going.",
    });
  });
});
