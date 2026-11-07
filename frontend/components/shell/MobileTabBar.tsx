"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, isActivePath } from "@/lib/nav";
import { cn } from "@/lib/cn";

export function MobileTabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/96 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="mx-auto grid max-w-md grid-cols-4">
        {NAV_ITEMS.map((item) => {
          const active = isActivePath(pathname, item.href);
          const Icon = item.icon;

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-1.5 py-2.5 text-[10px] font-medium transition-colors duration-150",
                  active
                    ? "text-accent"
                    : "text-faint hover:bg-surface-3 hover:text-ink",
                )}
              >
                <Icon
                  className={cn(
                    "size-[20px]",
                    active ? "text-accent" : "text-faint",
                  )}
                  aria-hidden="true"
                />
                {active ? (
                  <span
                    className="absolute bottom-0 left-1/2 h-[2px] w-[18px] -translate-x-1/2 rounded-full bg-gradient-to-r from-lavender via-accent to-lavender"
                    aria-hidden="true"
                  />
                ) : null}
                {item.shortLabel}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
