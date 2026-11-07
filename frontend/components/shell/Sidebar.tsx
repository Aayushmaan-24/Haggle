"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, isActivePath } from "@/lib/nav";
import { cn } from "@/lib/cn";
import { Logo } from "./Logo";
import { SandboxBadge } from "./SandboxBadge";

/**
 * 236px full sidebar on large screens, 68px icon rail on tablets, hidden on
 * mobile (the tab bar in `MobileTabBar` takes over below 768px).
 */
export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[68px] flex-col border-r border-line bg-canvas-2/90 backdrop-blur-xl md:flex lg:w-[236px]">
      <div className="flex h-16 shrink-0 items-center justify-center border-b border-line px-0 lg:justify-start lg:px-5">
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-control py-1 outline-offset-4"
          aria-label="Haggle home"
        >
          <Logo className="size-8" />
          <span className="hidden text-[15px] font-semibold tracking-[-0.02em] text-ink lg:inline">
            Haggle
          </span>
        </Link>
      </div>

      <nav aria-label="Primary" className="flex-1 overflow-y-auto px-2.5 py-5">
        <p className="label hidden px-2.5 pb-2 lg:block">Workspace</p>
        <ul className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const active = isActivePath(pathname, item.href);
            const Icon = item.icon;

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  title={item.label}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex h-10 items-center justify-center gap-3 rounded-control border px-0 text-[13px] outline-none transition-colors duration-150",
                    "lg:justify-start lg:px-2.5",
                    active
                      ? "border-accent-line bg-accent-soft font-medium text-ink"
                      : "border-transparent text-muted hover:border-line hover:bg-surface-2 hover:text-ink",
                  )}
                >
                  {active ? (
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-2.5 left-0 w-0.5 rounded-full bg-accent lg:left-0"
                    />
                  ) : null}
                  <Icon
                    className={cn(
                      "size-[18px] shrink-0",
                      active ? "text-accent" : "text-faint",
                    )}
                    aria-hidden="true"
                  />
                  <span className="hidden lg:inline">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="shrink-0 border-t border-line p-3 lg:p-4">
        <div className="rounded-panel border border-line bg-surface p-3">
          <SandboxBadge variant="plain" />
          <p className="mt-1.5 hidden text-[11px] leading-relaxed text-faint lg:block">
            Payments run in the PayPal sandbox. No real money moves.
          </p>
        </div>
      </div>
    </aside>
  );
}
