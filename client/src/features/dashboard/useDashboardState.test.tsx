// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { useDashboardState } from "./useDashboardState";

// Monday 5 October 2026, noon UTC: the same calendar day in every time zone the test might run in.
const NOW = new Date("2026-10-05T12:00:00Z");

function setup(url = "/") {
  return renderHook(() => ({ state: useDashboardState(), location: useLocation() }), {
    wrapper: ({ children }) => <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>,
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe("useDashboardState", () => {
  it("shows today's day view for a bare URL", () => {
    const { result } = setup("/");
    expect(result.current.state.period).toEqual({ view: "day", date: "2026-10-05" });
    expect(result.current.state.isCurrent).toBe(true);
    expect(result.current.state.panel).toBeNull();
    expect(result.current.state.label).toBe("Mon, 5 Oct");
    expect(result.current.state.canNext).toBe(false);
    expect(result.current.state.canPrev).toBe(true);
  });

  it("reads the period and panel from the URL", () => {
    const { result } = setup("/?view=week&date=2026-09-20&panel=sites");
    expect(result.current.state.period).toEqual({ view: "week", date: "2026-09-20" });
    expect(result.current.state.panel).toBe("sites");
    expect(result.current.state.isCurrent).toBe(false);
    expect(result.current.state.canNext).toBe(true);
  });

  it("repairs garbage in the URL instead of failing", () => {
    const { result } = setup("/?view=decade&date=never&panel=admin");
    expect(result.current.state.period).toEqual({ view: "day", date: "2026-10-05" });
    expect(result.current.state.panel).toBeNull();
  });

  it("steps through days and keeps the URL in step, leaving defaults out", () => {
    const { result } = setup("/");
    act(() => result.current.state.shift(-1));
    expect(result.current.location.search).toBe("?date=2026-10-04");
    expect(result.current.state.label).toBe("Sun, 4 Oct");

    act(() => result.current.state.shift(1));
    expect(result.current.location.search).toBe("");
  });

  it("does not step into the future", () => {
    const { result } = setup("/");
    act(() => result.current.state.shift(1));
    expect(result.current.location.search).toBe("");
  });

  it("switches view and returns to today", () => {
    const { result } = setup("/?date=2026-09-14");
    act(() => result.current.state.setView("week"));
    expect(result.current.location.search).toBe("?view=week&date=2026-09-14");

    act(() => result.current.state.goToday());
    expect(result.current.location.search).toBe("?view=week");
    expect(result.current.state.isCurrent).toBe(true);
  });

  it("stays on today when switching view from a period that contains today", () => {
    const { result } = setup("/?view=month");
    act(() => result.current.state.setView("day"));
    expect(result.current.location.search).toBe("");
  });

  it("opens one day from a week, keeping nothing of the week in the URL", () => {
    const { result } = setup("/?view=week&date=2026-09-20");
    act(() => result.current.state.openDay("2026-09-16"));
    expect(result.current.state.period).toEqual({ view: "day", date: "2026-09-16" });
    expect(result.current.location.search).toBe("?date=2026-09-16");
  });

  it("opening today from a week gives the bare URL", () => {
    const { result } = setup("/?view=week");
    act(() => result.current.state.openDay("2026-10-05"));
    expect(result.current.location.search).toBe("");
  });

  it("pulls a date outside the history or in the future back into range when opening a day", () => {
    const { result } = setup("/?view=week");
    act(() => result.current.state.openDay("2026-10-09"));
    expect(result.current.state.period.date).toBe("2026-10-05");
    expect(result.current.location.search).toBe(""); // the URL itself is clean, not just the value read back from it
  });

  it("opens and closes a panel without losing the period", () => {
    const { result } = setup("/?view=week&date=2026-09-20");
    act(() => result.current.state.openPanel("settings"));
    expect(new URLSearchParams(result.current.location.search).get("panel")).toBe("settings");
    expect(result.current.state.period).toEqual({ view: "week", date: "2026-09-20" });

    act(() => result.current.state.closePanel());
    expect(result.current.location.search).toBe("?view=week&date=2026-09-20");
  });
});
