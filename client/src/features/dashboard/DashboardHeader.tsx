import { ChevronLeft, ChevronRight, Globe, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { SessionControl } from "@/features/session/SessionControl";
import type { View } from "@/lib/period";
import { ConnectionDot } from "./ConnectionDot";
import type { useDashboardState } from "./useDashboardState";

const viewOptions = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
] as const satisfies ReadonlyArray<{ value: View; label: string }>;

/**
 * The only navigation in the app: step through periods, switch the view, open the two panels, and start or
 * stop a session. On a phone the date controls drop to their own row and the actions to a third.
 */
export function DashboardHeader({ state }: { state: ReturnType<typeof useDashboardState> }) {
  const view = state.period.view;
  return (
    <header className="sticky top-0 z-30 border-b border-raised/60 bg-page/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 md:px-8">
        <p className="text-lg font-bold tracking-tight">Distraction Tracker</p>

        <div className="flex flex-wrap items-center gap-2 md:ml-4">
          <Button variant="ghost" size="icon" aria-label={`Previous ${view}`} disabled={!state.canPrev} onClick={() => state.shift(-1)}>
            <ChevronLeft aria-hidden="true" />
          </Button>
          <h1 className="min-w-36 text-center text-lg font-semibold" aria-live="polite">
            {state.label}
          </h1>
          <Button variant="ghost" size="icon" aria-label={`Next ${view}`} disabled={!state.canNext} onClick={() => state.shift(1)}>
            <ChevronRight aria-hidden="true" />
          </Button>
          <Segmented label="Period" value={view} onValueChange={state.setView} options={viewOptions} />
          {!state.isCurrent ? (
            <Button variant="secondary" size="sm" onClick={state.goToday}>
              Today
            </Button>
          ) : null}
        </div>

        <div className="flex w-full items-center justify-between gap-2 md:ml-auto md:w-auto md:justify-end">
          <div className="flex items-center gap-1">
            <ConnectionDot onClick={() => state.openPanel("settings")} />
            <Button variant="ghost" size="sm" onClick={() => state.openPanel("sites")}>
              <Globe aria-hidden="true" className="size-4" /> Sites
            </Button>
            <Button variant="ghost" size="icon" aria-label="Settings" onClick={() => state.openPanel("settings")}>
              <Settings aria-hidden="true" />
            </Button>
          </div>
          <SessionControl />
        </div>
      </div>
    </header>
  );
}
