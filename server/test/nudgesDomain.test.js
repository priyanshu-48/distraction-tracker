import { describe, expect, it } from "vitest";
import { decideNudge, holdoutRoll, NUDGE, summarizeNudges } from "../domain/nudges.js";

// Ids whose first 32 bits decide the holdout: below 0.2 of the range is held out, the rest is shown.
const HELD_OUT = "00000000-0000-4000-8000-000000000000";
const SHOWN = "ffffffff-0000-4000-8000-000000000000";
const NOW = new Date("2026-03-10T12:00:00Z");
const minutesAgo = (m) => new Date(NOW.getTime() - m * 60_000);

const base = { site: "reddit.com", distractedSeconds: 600, budgetSeconds: 3600, opensInWindow: 1, lastNudgeAt: null, now: NOW, visitId: SHOWN };
const decide = (over = {}) => decideNudge({ ...base, ...over });

describe("holdoutRoll", () => {
  it("is a number in [0, 1) taken from the id, the same every time", () => {
    expect(holdoutRoll(HELD_OUT)).toBe(0);
    expect(holdoutRoll(SHOWN)).toBeGreaterThan(0.99);
    expect(holdoutRoll(SHOWN)).toBeLessThan(1);
    expect(holdoutRoll(SHOWN)).toBe(holdoutRoll(SHOWN));
  });

  it("puts the line at 20%: the last id held out and the first one shown are neighbours", () => {
    expect(holdoutRoll("33333333-0000-4000-8000-000000000000")).toBeLessThan(NUDGE.HOLDOUT_RATE);
    expect(holdoutRoll("33333334-0000-4000-8000-000000000000")).toBeGreaterThanOrEqual(NUDGE.HOLDOUT_RATE);
  });

  it("treats something that is not hex as 'not held out' instead of failing", () => {
    expect(holdoutRoll("zzzzzzzz-0000")).toBe(1);
    expect(holdoutRoll(undefined)).toBe(1);
  });

  it("holds out about one in five over many ids", () => {
    let held = 0;
    for (let i = 0; i < 5000; i++) {
      const hex = Math.floor((i / 5000) * 0xffffffff).toString(16).padStart(8, "0");
      if (holdoutRoll(`${hex}-0000-4000-8000-000000000000`) < NUDGE.HOLDOUT_RATE) held += 1;
    }
    expect(held / 5000).toBeCloseTo(0.2, 1);
  });
});

describe("decideNudge: when", () => {
  it("says nothing when the user is under budget and not opening the site repeatedly", () => {
    expect(decide()).toBeNull();
  });

  it("nudges over budget, and exactly at budget counts as over", () => {
    expect(decide({ distractedSeconds: 3599 })).toBeNull();
    expect(decide({ distractedSeconds: 3600 })).toMatchObject({ kind: "over-budget", shown: true });
    expect(decide({ distractedSeconds: 9000 })).toMatchObject({ kind: "over-budget" });
  });

  it("nudges on the 5th open within the window, not the 4th", () => {
    expect(decide({ opensInWindow: NUDGE.REPEAT_OPENS - 1 })).toBeNull();
    expect(decide({ opensInWindow: NUDGE.REPEAT_OPENS })).toMatchObject({ kind: "repeat", shown: true });
    expect(decide({ opensInWindow: 12 })).toMatchObject({ kind: "repeat" });
  });

  it("prefers 'over budget' when both apply", () => {
    expect(decide({ distractedSeconds: 4000, opensInWindow: 9 }).kind).toBe("over-budget");
  });

  it("never treats a budget of 0 (or less) as 'always over'", () => {
    expect(decide({ budgetSeconds: 0, distractedSeconds: 0 })).toBeNull();
    expect(decide({ budgetSeconds: -1, distractedSeconds: 100 })).toBeNull();
    expect(decide({ budgetSeconds: 0, opensInWindow: 6 })).toMatchObject({ kind: "repeat" }); // repeat still works without a budget
  });
});

describe("decideNudge: cooldown", () => {
  it("stays quiet for 10 minutes after a nudge about the same site, and speaks again at 10", () => {
    const over = { distractedSeconds: 5000 };
    expect(decide({ ...over, lastNudgeAt: minutesAgo(9.9) })).toBeNull();
    expect(decide({ ...over, lastNudgeAt: minutesAgo(10) })).toMatchObject({ kind: "over-budget" });
    expect(decide({ ...over, lastNudgeAt: minutesAgo(60) })).toMatchObject({ kind: "over-budget" });
  });

  it("silences a repeat nudge too", () => {
    expect(decide({ opensInWindow: 8, lastNudgeAt: minutesAgo(2) })).toBeNull();
  });

  it("accepts the time of the last nudge as a Date or as text (a database timestamp)", () => {
    expect(decide({ distractedSeconds: 5000, lastNudgeAt: minutesAgo(1).toISOString() })).toBeNull();
  });
});

describe("decideNudge: the holdout", () => {
  it("marks a held-out nudge as not shown, with the same kind and text, so it can still be recorded", () => {
    const shown = decide({ distractedSeconds: 5000, visitId: SHOWN });
    const held = decide({ distractedSeconds: 5000, visitId: HELD_OUT });
    expect(shown.shown).toBe(true);
    expect(held.shown).toBe(false);
    expect(held.kind).toBe(shown.kind);
    expect(held.title).toBe(shown.title);
  });

  it("never invents a nudge: with no trigger there is no decision to hold out", () => {
    expect(decide({ visitId: HELD_OUT })).toBeNull();
  });

  it("is the same for the same visit every time", () => {
    const a = decide({ distractedSeconds: 5000, visitId: HELD_OUT });
    const b = decide({ distractedSeconds: 5000, visitId: HELD_OUT });
    expect(a).toEqual(b);
  });
});

describe("decideNudge: the text", () => {
  it("names the site and numbers only", () => {
    const over = decide({ distractedSeconds: 4500, budgetSeconds: 3600 });
    expect(over.title).toBe("Over budget, and you just opened reddit.com");
    expect(over.body).toBe("1h 15m of 1h used today. Is this visit worth it?");
    const repeat = decide({ opensInWindow: 6 });
    expect(repeat.title).toBe("6 visits to reddit.com in 30 minutes");
    expect(repeat.body).toBe("10m of 1h used today. Checking again?");
  });

  it("leaves the budget out of the text when there is none, without leaving a stray space", () => {
    const repeat = decide({ budgetSeconds: 0, opensInWindow: 5 });
    expect(repeat.body).toBe("Checking again?");
  });

  it("is short enough for a notification", () => {
    const { title, body } = decide({ distractedSeconds: 86_000, budgetSeconds: 300, site: "a".repeat(60) + ".com" });
    expect(title.length).toBeLessThan(120);
    expect(body.length).toBeLessThan(300);
  });
});

describe("summarizeNudges", () => {
  const row = (shown, duration) => ({ shown, duration });

  it("starts from zeros", () => {
    expect(summarizeNudges([])).toEqual({ nudged: 0, shown: 0, shownLeft: 0, heldOut: 0, heldOutLeft: 0, unmatched: 0, comparable: false });
  });

  it("counts a visit of 60 seconds or less as 'left', and 61 as not", () => {
    const s = summarizeNudges([row(true, 60), row(true, 61), row(true, 3), row(true, 600)]);
    expect(s).toMatchObject({ nudged: 4, shown: 4, shownLeft: 2 });
  });

  it("keeps the two groups apart", () => {
    const s = summarizeNudges([row(true, 10), row(true, 500), row(false, 20), row(false, 30), row(false, 900)]);
    expect(s).toMatchObject({ shown: 2, shownLeft: 1, heldOut: 3, heldOutLeft: 2 });
    expect(s.nudged).toBe(2); // only nudges that were shown count as "nudged"
  });

  it("leaves visits that never uploaded out of both groups and counts them as unmatched", () => {
    const s = summarizeNudges([row(true, null), row(false, undefined), row(true, 10)]);
    expect(s).toMatchObject({ nudged: 2, shown: 1, shownLeft: 1, heldOut: 0, unmatched: 2 });
  });

  it("accepts durations that arrive as text", () => {
    expect(summarizeNudges([row(true, "45.5")]).shownLeft).toBe(1);
  });

  it("only says the groups are comparable when both have at least 5 each", () => {
    const many = (shown, n, d) => Array.from({ length: n }, () => row(shown, d));
    expect(summarizeNudges([...many(true, 5, 10), ...many(false, 4, 10)]).comparable).toBe(false);
    expect(summarizeNudges([...many(true, 4, 10), ...many(false, 5, 10)]).comparable).toBe(false);
    expect(summarizeNudges([...many(true, 5, 10), ...many(false, 5, 10)]).comparable).toBe(true);
  });
});
