// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { NudgesCard } from "./NudgesCard";
import type { RangeSummary } from "./types";

type Nudges = NonNullable<RangeSummary["nudges"]>;
const stats = (over: Partial<Nudges> = {}): Nudges => ({ nudged: 8, shown: 8, shownLeft: 5, heldOut: 0, heldOutLeft: 0, unmatched: 0, comparable: false, ...over });

describe("NudgesCard", () => {
  it("is not there when no nudges were decided in the period", () => {
    const { container } = render(<NudgesCard nudges={null} />);
    expect(container.innerHTML).toBe("");
  });

  it("says how many nudges there were and how often you left within a minute", () => {
    render(<NudgesCard nudges={stats()} />);
    expect(screen.getByText("8 nudges")).toBeTruthy();
    expect(screen.getByText("You left within a minute 5 of 8 times (63%).")).toBeTruthy();
  });

  it("says '1 nudge' in the singular", () => {
    render(<NudgesCard nudges={stats({ nudged: 1, shown: 1, shownLeft: 1 })} />);
    expect(screen.getByText("1 nudge")).toBeTruthy();
  });

  it("says so, instead of showing 0%, when none of the nudged visits have been recorded yet", () => {
    render(<NudgesCard nudges={stats({ nudged: 3, shown: 0, shownLeft: 0, unmatched: 3 })} />);
    expect(screen.getByText("The visits you were nudged on have not been recorded yet.")).toBeTruthy();
    expect(screen.queryByText(/times \(/)).toBeNull();
  });

  it("does not compare the groups until there are enough: it says what is needed", () => {
    render(<NudgesCard nudges={stats({ heldOut: 2, heldOutLeft: 1, comparable: false })} />);
    expect(screen.getByText(/Not enough to compare yet: it needs at least 5 visits with a nudge and 5/)).toBeTruthy();
    expect(screen.queryByText(/held back on purpose,/)).toBeNull();
  });

  it("compares with and without a nudge once both groups are big enough, using both numbers", () => {
    render(<NudgesCard nudges={stats({ shown: 10, shownLeft: 6, heldOut: 5, heldOutLeft: 1, comparable: true })} />);
    const text = document.body.textContent ?? "";
    expect(text).toContain("With a nudge you left within a minute 60% of the time");
    expect(text).toContain("20% (1 of 5)");
    expect(screen.queryByText(/Not enough to compare yet/)).toBeNull();
  });

  it("does not claim the nudge caused anything", () => {
    render(<NudgesCard nudges={stats({ shown: 10, shownLeft: 9, heldOut: 10, heldOutLeft: 1, comparable: true })} />);
    expect(document.body.textContent).not.toMatch(/\b(caused|because|works|helped|effective)\b/i);
  });
});
