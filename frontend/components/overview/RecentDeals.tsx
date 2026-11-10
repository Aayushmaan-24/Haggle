"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Handshake, ReceiptText } from "lucide-react";
import { getDeals } from "@/lib/api";
import { readSavedDeals } from "@/lib/dealStore";
import type { Deal, DealStatus } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/LoadingState";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";

/**
 * Deals belong to this browser and are read fresh from `/api/deals` on every mount.
 * The backend keeps them in memory only, so a copy of each public snapshot is saved in
 * localStorage and shown as a clearly-labelled fallback once the server forgets them.
 * Payment state is never taken from that copy.
 */

const RECENT_LIMIT = 6;

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const KNOWN_STATUSES: DealStatus[] = [
  "negotiated",
  "awaiting_approval",
  "deposit_paid",
  "complete",
];

function isKnownStatus(value: unknown): value is DealStatus {
  return (
    typeof value === "string" && KNOWN_STATUSES.includes(value as DealStatus)
  );
}

/** The item phrase without its leading article, capitalized for display. */
function itemLabel(item: string): string {
  const trimmed = item.trim().replace(/^an?\s+/i, "");
  if (!trimmed) return "Your purchase";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function money(value: number | null): string {
  return value === null ? "—" : usd.format(value);
}

function isDeal(value: unknown): value is Deal {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Deal).deal_id === "string" &&
    (value as Deal).deal_id.trim() !== ""
  );
}

type DealsState =
  | { kind: "loading" }
  | { kind: "ready"; deals: Deal[]; savedAt: string | null }
  | { kind: "unavailable" };

function savedFallback(): { deals: Deal[]; savedAt: string } | null {
  const saved = readSavedDeals().slice(0, RECENT_LIMIT);
  if (saved.length === 0) return null;
  return { deals: saved.map((entry) => entry.deal), savedAt: saved[0].savedAt };
}

export function RecentDeals() {
  const [state, setState] = useState<DealsState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    getDeals(RECENT_LIMIT)
      .then((deals) => {
        if (cancelled) return;
        const fresh = Array.isArray(deals) ? deals.filter(isDeal) : [];

        // An empty live list after holding deals means the backend restarted: keep the
        // history readable from this browser instead of showing "No deals yet".
        if (fresh.length === 0) {
          const saved = savedFallback();
          if (saved) {
            setState({ kind: "ready", deals: saved.deals, savedAt: saved.savedAt });
            return;
          }
        }

        setState({ kind: "ready", deals: fresh, savedAt: null });
      })
      .catch(() => {
        if (cancelled) return;

        const saved = savedFallback();
        if (saved) {
          setState({ kind: "ready", deals: saved.deals, savedAt: saved.savedAt });
          return;
        }

        // A failed load stays silent: it is never presented as an empty history.
        setState({ kind: "unavailable" });
      });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  // Refetch silently when the browser reconnects, without surfacing the failure.
  useEffect(() => {
    if (state.kind !== "unavailable") return;

    function refetch() {
      setState({ kind: "loading" });
      setAttempt((value) => value + 1);
    }

    window.addEventListener("online", refetch);
    return () => window.removeEventListener("online", refetch);
  }, [state.kind]);

  return (
    <section aria-labelledby="recent-deals-heading">
      <SectionHeader
        eyebrow="Recent deals"
        title="Your recent deals"
        description="The latest deals your agent has reached in this browser, newest first. Open any one to see its receipt and payment status."
      />

      {state.kind === "loading" ? <RecentDealsSkeleton /> : null}

      {state.kind === "ready" && state.deals.length === 0 ? (
        <EmptyState
          icon={Handshake}
          title="Your deals will appear here"
          description="Once your agent completes a deal, you'll find it here."
        />
      ) : null}

      {state.kind === "ready" && state.deals.length > 0 ? (
        <div className="card divide-y divide-line/70 overflow-hidden">
          {state.deals.map((deal) => {
            const price =
              typeof deal.total === "number" && Number.isFinite(deal.total)
                ? deal.total
                : typeof deal.price === "number" && Number.isFinite(deal.price)
                  ? deal.price
                  : null;
            const seller =
              typeof deal.seller === "string" && deal.seller.trim() !== ""
                ? deal.seller
                : null;

            return (
              <Link
                key={deal.deal_id}
                href={`/receipt?deal=${encodeURIComponent(deal.deal_id)}`}
                className="group flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 transition-colors hover:bg-surface-2/60 sm:flex-nowrap"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-control border border-line bg-surface-2 text-faint">
                  <ReceiptText className="size-4" aria-hidden="true" />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-ink">
                    {itemLabel(deal.item ?? "")}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-faint">
                    {seller ? `Sold by ${seller}` : "Seller unavailable"}
                  </span>
                </span>

                {state.savedAt !== null ? (
                  <Badge tone="neutral">Saved copy</Badge>
                ) : isKnownStatus(deal.status) ? (
                  <StatusBadge variant={deal.status} />
                ) : (
                  <Badge tone="neutral">Status unavailable</Badge>
                )}

                <span className="num ml-auto shrink-0 text-[14px] font-semibold text-ink sm:ml-0 sm:w-24 sm:text-right">
                  {money(price)}
                </span>

                <ArrowRight
                  className="size-4 shrink-0 text-faint transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-muted"
                  aria-hidden="true"
                />
              </Link>
            );
          })}
        </div>
      ) : null}

    </section>
  );
}

function RecentDealsSkeleton() {
  return (
    <div className="card divide-y divide-line/70" role="status" aria-busy="true">
      <span className="sr-only">Loading recent deals…</span>
      {[0, 1, 2].map((row) => (
        <div key={row} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="size-9 shrink-0" rounded="rounded-control" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-2.5 w-24" />
          </div>
          <Skeleton className="h-5 w-20" rounded="rounded-pill" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}
