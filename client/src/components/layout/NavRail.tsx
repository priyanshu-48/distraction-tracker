import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import { navItems } from "./nav";

const itemClass =
  "flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition-colors " +
  "focus-visible:outline-2 focus-visible:outline-teal";

/** Desktop navigation: icons only on narrow desktops, icons with labels from lg up. */
export function NavRail() {
  return (
    <nav aria-label="Main" className="hidden w-20 shrink-0 flex-col gap-1 bg-card p-3 md:flex lg:w-56">
      <p className="mb-4 px-3 pt-2 text-lg font-bold tracking-tight max-lg:hidden">Distraction Tracker</p>
      {navItems.map(({ to, label, icon: Icon, enabled }) =>
        enabled ? (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(itemClass, isActive ? "bg-raised text-coral" : "text-ink-muted hover:bg-raised/60 hover:text-ink")
            }
          >
            <Icon aria-hidden="true" className="size-5 shrink-0" />
            <span className="max-lg:sr-only">{label}</span>
          </NavLink>
        ) : (
          <span
            key={to}
            aria-disabled="true"
            title={`${label} (coming soon)`}
            className={cn(itemClass, "cursor-not-allowed text-ink-muted/60")}
          >
            <Icon aria-hidden="true" className="size-5 shrink-0" />
            <span className="max-lg:sr-only">{label}</span>
          </span>
        )
      )}
    </nav>
  );
}
