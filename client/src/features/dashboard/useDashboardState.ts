import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  canShift,
  changeView,
  isCurrent,
  normalizePeriod,
  periodLabel,
  shiftPeriod,
  todayIn,
  type Period,
  type View,
} from "@/lib/period";

export type Panel = "sites" | "settings";
const PANELS: readonly Panel[] = ["sites", "settings"];

/**
 * What the dashboard is showing, kept in the URL (`/?view=week&date=2026-10-05&panel=sites`) so that back,
 * forward, reload and bookmarks all work. Defaults are left out: `/` is "today, day view, no panel".
 * Anything unreadable in the URL falls back to a sensible default instead of failing.
 */
export function useDashboardState() {
  const [params, setParams] = useSearchParams();
  const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);
  const today = todayIn(timeZone);

  const period = normalizePeriod({ view: params.get("view"), date: params.get("date") }, today);
  const panel = PANELS.find((p) => p === params.get("panel")) ?? null;

  function write(next: { period?: Period; panel?: Panel | null }) {
    const target = next.period ?? period;
    const targetPanel = next.panel === undefined ? panel : next.panel;
    const query = new URLSearchParams();
    if (target.view !== "day") query.set("view", target.view);
    if (target.date !== today) query.set("date", target.date);
    if (targetPanel) query.set("panel", targetPanel);
    setParams(query);
  }

  return {
    period,
    today,
    timeZone,
    panel,
    label: periodLabel(period),
    isCurrent: isCurrent(period, today),
    canPrev: canShift(period, -1, today),
    canNext: canShift(period, 1, today),
    setView: (view: View) => write({ period: changeView(period, view, today) }),
    shift: (direction: -1 | 1) => write({ period: shiftPeriod(period, direction, today) }),
    goToday: () => write({ period: { view: period.view, date: today } }),
    /** Switches to the Day view for one date (a bar in the week or month). */
    openDay: (date: string) => write({ period: normalizePeriod({ view: "day", date }, today) }),
    openPanel: (name: Panel) => write({ panel: name }),
    closePanel: () => write({ panel: null }),
  };
}
