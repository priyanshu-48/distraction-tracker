import { CalendarCheck, Globe, Rocket, Settings, TrendingUp, type LucideIcon } from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Screens are enabled as their phase lands; until then the item is shown but inert. */
  enabled: boolean;
}

export const navItems: NavItem[] = [
  { to: "/today", label: "Today", icon: CalendarCheck, enabled: false },
  { to: "/trends", label: "Trends", icon: TrendingUp, enabled: false },
  { to: "/sites", label: "Sites", icon: Globe, enabled: true },
  // Until Settings exists (Phase 5), this is where extension status and the first-run steps live.
  { to: "/setup", label: "Setup", icon: Rocket, enabled: true },
  { to: "/settings", label: "Settings", icon: Settings, enabled: false },
];
