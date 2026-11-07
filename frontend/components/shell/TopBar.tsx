"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Plus } from "lucide-react";
import { navItemForPath } from "@/lib/nav";
import { ButtonLink } from "@/components/ui/Button";
import { Logo } from "./Logo";
import { SandboxBadge } from "./SandboxBadge";

/** `/receipt` is reached from the PayPal redirect, so it is labelled but not in the nav. */
function currentLabel(pathname: string): string {
  if (pathname.startsWith("/receipt")) return "Receipt";
  return navItemForPath(pathname)?.label ?? "Not found";
}

export function TopBar() {
  const pathname = usePathname();
  const label = currentLabel(pathname);

  return (
    <header className="bar-glass sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-x-0 border-t-0 px-4 sm:px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-2.5">
        <Link href="/" className="flex items-center gap-2 md:hidden" aria-label="Haggle home">
          <Logo className="size-8" />
          <span className="text-sm font-semibold tracking-[-0.02em] text-ink">Haggle</span>
        </Link>

        <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1.5 md:flex">
          <span className="text-xs text-faint">Haggle</span>
          <ChevronRight className="size-3 shrink-0 text-faint" aria-hidden="true" />
          <span className="truncate text-[13px] font-medium text-ink">{label}</span>
        </nav>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <SandboxBadge />
        <ButtonLink href="/trading-floor" size="sm" className="gap-1.5">
          <Plus className="size-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">New negotiation</span>
          <span className="sm:hidden">New deal</span>
        </ButtonLink>
      </div>
    </header>
  );
}
