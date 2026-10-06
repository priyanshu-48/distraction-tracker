import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import { navItems } from "./nav";

const itemClass =
  "flex flex-1 flex-col items-center gap-1 py-2 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-teal";

/** Phone navigation, fixed to the bottom edge; hidden from md up where the rail takes over. */
export function BottomTabs() {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-raised bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {navItems.map(({ to, label, icon: Icon, enabled }) =>
        enabled ? (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => cn(itemClass, isActive ? "text-coral" : "text-ink-muted")}
          >
            <Icon aria-hidden="true" className="size-6" />
            {label}
          </NavLink>
        ) : (
          <span key={to} aria-disabled="true" className={cn(itemClass, "text-ink-muted/60")}>
            <Icon aria-hidden="true" className="size-6" />
            {label}
          </span>
        )
      )}
    </nav>
  );
}
