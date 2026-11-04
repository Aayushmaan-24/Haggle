import { Handshake, LayoutDashboard, ScrollText, TrendingUp, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  /** Short label for the mobile tab bar. */
  shortLabel: string;
  icon: LucideIcon;
  /** One line used by the top bar and placeholder screens. */
  description: string;
}

/**
 * Flat navigation on purpose: five destinations, no nesting. Deal details are reached
 * contextually (the backend redirects to `/receipt?deal=…`), not from the sidebar.
 */
export const NAV_ITEMS: NavItem[] = [
  {
    href: "/",
    label: "Overview",
    shortLabel: "Overview",
    icon: LayoutDashboard,
    description: "Mandate, session activity and a shortcut into the negotiation.",
  },
  {
    href: "/trading-floor",
    label: "Trading Floor",
    shortLabel: "Floor",
    icon: Handshake,
    description: "Live agent-to-agent negotiation across every seller.",
  },
  {
    href: "/policy",
    label: "Seller Policy",
    shortLabel: "Policy",
    icon: ScrollText,
    description: "Turn plain-English selling rules into a live seller agent.",
  },
  {
    href: "/benchmark",
    label: "Benchmark",
    shortLabel: "Benchmark",
    icon: TrendingUp,
    description: "Recorded performance across reproducible scenarios.",
  },
];

/** `/` matches exactly; every other item matches its subtree. */
export function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function navItemForPath(pathname: string): NavItem | undefined {
  return NAV_ITEMS.find((item) => isActivePath(pathname, item.href));
}
