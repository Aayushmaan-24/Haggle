"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { navItemForPath } from "@/lib/nav";
import { ButtonLink } from "@/components/ui/Button";
import { Logo } from "./Logo";
import { SandboxBadge } from "./SandboxBadge";

/** `/receipt` is reached from the PayPal redirect, so it is labelled but not in the nav. */
function currentLabel(pathname: string): string {
  if (pathname.startsWith("/receipt")) return "Deal";
  return navItemForPath(pathname)?.label ?? "Not found";
}

export function TopBar() {
  const pathname = usePathname();
  const label = currentLabel(pathname);

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-line bg-surface px-4 backdrop-blur sm:px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-2">
        <Link href="/" className="flex items-center gap-2 md:hidden" aria-label="Haggle home">
          <Logo className="size-7" />
          <span className="text-sm font-semibold tracking-[-0.01em] text-ink">
            Haggle
          </span>
        </Link>

        <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-2 md:flex">
          <span className="text-xs text-faint">Haggle</span>
          <ChevronRight className="size-3 shrink-0 text-faint" aria-hidden="true" />
          <span className="truncate text-sm font-medium text-ink">{label}</span>
        </nav>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <div className="hidden sm:block">
          <SandboxBadge />
        </div>
        <ButtonLink href="/trading-floor" size="sm">
          <span className="sm:hidden">New deal</span>
          <span className="hidden sm:inline">New negotiation</span>
        </ButtonLink>
      </div>
    </header>
  );
}
