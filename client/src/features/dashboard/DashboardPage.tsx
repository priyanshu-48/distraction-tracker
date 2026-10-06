import { lazy, Suspense } from "react";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DayView } from "@/features/day/DayView";
import { RangeView } from "@/features/range/RangeView";
import { SetupBanner } from "@/features/setup/SetupBanner";
import { DashboardHeader } from "./DashboardHeader";
import { useDashboardState, type Panel } from "./useDashboardState";

// Panels load their code and data only when opened.
const SitesManager = lazy(() => import("@/features/sites/SitesManager"));
const SettingsPanel = lazy(() => import("@/features/settings/SettingsPanel"));

const panelTitles: Record<Panel, string> = { sites: "Sites", settings: "Settings" };

function PanelFallback() {
  return <Skeleton className="h-40 w-full" />;
}

/** The whole app after sign-in: one page whose content follows the chosen period. */
export default function DashboardPage() {
  const state = useDashboardState();

  return (
    <TooltipProvider>
      <div className="app-dark min-h-dvh">
        <DashboardHeader state={state} />
        <main className="mx-auto max-w-6xl px-4 pt-6 pb-16 md:px-8">
          <SetupBanner />
          {state.period.view === "day" ? (
            <DayView date={state.period.date} isToday={state.isCurrent} onOpenSites={() => state.openPanel("sites")} />
          ) : (
            <RangeView
              view={state.period.view}
              date={state.period.date}
              label={state.label}
              isCurrent={state.isCurrent}
              today={state.today}
              onOpenDay={state.openDay}
            />
          )}
        </main>

        {(Object.keys(panelTitles) as Panel[]).map((name) => (
          <Sheet
            key={name}
            open={state.panel === name}
            onOpenChange={(open) => (open ? state.openPanel(name) : state.closePanel())}
            title={panelTitles[name]}
          >
            <Suspense fallback={<PanelFallback />}>{name === "sites" ? <SitesManager /> : <SettingsPanel />}</Suspense>
          </Sheet>
        ))}
      </div>
    </TooltipProvider>
  );
}
