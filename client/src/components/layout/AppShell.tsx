import * as React from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BottomTabs } from "./BottomTabs";
import { LogoutButton } from "./LogoutButton";
import { NavRail } from "./NavRail";

interface AppShellProps {
  title: string;
  /** Right side of the header, e.g. the Start/Stop session button. */
  actions?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Page frame for the new UI: navigation rail (desktop) or bottom tabs (phone), a header and the content.
 * Everything inside is dark-themed through the .app-dark class.
 */
export function AppShell({ title, actions, children }: AppShellProps) {
  return (
    <TooltipProvider>
      <div className="app-dark min-h-dvh md:flex">
        <NavRail />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between gap-4 px-4 py-4 md:px-8">
            <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
            <div className="flex items-center gap-3">
              {actions}
              <LogoutButton />
            </div>
          </header>
          <main className="flex-1 px-4 pb-24 md:px-8 md:pb-8">{children}</main>
        </div>
        <BottomTabs />
      </div>
    </TooltipProvider>
  );
}
