"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, isActivePath } from "@/lib/nav";
import { cn } from "@/lib/cn";
import { Logo } from "./Logo";
import { SandboxBadge } from "./SandboxBadge";

/**
 * 232px full sidebar on large screens, 64px icon rail on tablets, hidden on
 * mobile (the tab bar in `MobileTabBar` takes over below 768px).
 */
export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-16 flex-col border-r border-line bg-surface md:flex lg:w-[232px]">
      <div className="flex h-16 shrink-0 items-center justify-center border-b border-line px-0 lg:justify-start lg:px-4">
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-lg py-1 outline-offset-4"
          aria-label="Haggle home"
        >
          <Logo />
          <span className="hidden text-[15px] font-semibold tracking-[-0.01em] text-ink lg:inline">
            Haggle
          </span>
        </Link>
      </div>

      <nav aria-label="Primary" className="flex-1 overflow-y-auto px-2 py-5 lg:px-3">
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
                    "relative flex h-10 items-center justify-center gap-3 rounded-lg px-0 text-sm outline-none transition-colors duration-150",
                    "lg:justify-start lg:px-2.5",
                    active
                      ? "bg-surface-3 font-medium text-ink"
                      : "text-muted hover:bg-surface-2 hover:text-ink",
                    active &&
                      "text-ink before:absolute before:inset-x-0 before:-top-0.5 before:h-[2px] before:rounded-t-lg before:bg-gradient-to-r from-lavender to-accent",
                  )}
                >
                  <Icon
                    className={cn(
                      "size-[18px] shrink-0",
                      active ? "text-accent" : "text-faint",
                    )}
                  />
                  <span className="hidden lg:inline">{item.label}</span>
                  {active ? (
                    <span
                      aria-hidden="true"
                      className="sr-only"
                    >
                      Currently on {item.label}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="shrink-0 border-t border-line p-3 lg:p-4">
        <div className="rounded-lg border border-line bg-surface-2 p-3">
          <p className="pb-2 text-[10px] font-medium uppercase tracking-[0.08em] text-faint">
            Environment
          </p>
          <SandboxBadge variant="plain" />
          <p className="mt-1.5 text-[11px] leading-relaxed text-faint">
            No real money moves.
          </p>
        </div>
      </div>
    </aside>
  );
}
