"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Check,
  Clock,
  CreditCard,
  Loader2,
  PackageCheck,
  ReceiptText,
  ShieldCheck,
  Truck,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState, Skeleton } from "@/components/ui/LoadingState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ApiError, deliverDeal, getDeal, getProducts, payDeal } from "@/lib/api";
import type { Deal, DealStatus, Product } from "@/lib/types";
import { findSavedDeal } from "@/lib/dealStore";
import { useSavedProducts } from "@/lib/productStore";
import { cn } from "@/lib/cn";

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const STATUS_COPY: Record<
  DealStatus,
  { headline: string; detail: string }
> = {
  negotiated: {
    headline: "Ready to pay your deposit",
    detail:
      "Approve the deposit in PayPal to lock in these terms. The balance stays with you until delivery.",
  },
  awaiting_approval: {
    headline: "Waiting on PayPal approval",
    detail:
      "Finish the approval in the PayPal window. Once approved, your deposit is captured.",
  },
  deposit_paid: {
    headline: "Deposit paid — confirm delivery",
    detail:
      "The seller has received your deposit. Confirm delivery when the item arrives to release the balance.",
  },
  complete: {
    headline: "Paid in full",
    detail: "Deposit and balance are settled. This deal is complete.",
  },
};

type ReceiptState =
  | { kind: "missing" }
  | { kind: "loading"; dealId: string }
  | { kind: "ready"; dealId: string; deal: Deal }
  | { kind: "cached"; dealId: string; deal: Deal; savedAt: string }
  | { kind: "not-found"; dealId: string }
  | { kind: "error"; dealId: string; message: string };

type StepState = "done" | "pending" | "upcoming";

type TimelineStep = {
  key: string;
  title: string;
  description: string;
  amount: string;
  state: StepState;
  stateLabel: string;
  icon: LucideIcon;
};

/* ------------------------------------------------------------------ */
/* Formatting and guards                                              */
/* ------------------------------------------------------------------ */

function formatText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function formatNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatMoney(value: number | null): string | null {
  return value === null ? null : usd.format(value);
}

function formatPercent(value: number | null): string | null {
  if (value === null) return null;
  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
}

function formatDays(value: number | null): string | null {
  if (value === null) return null;
  return `${value} ${value === 1 ? "day" : "days"}`;
}

function isKnownStatus(value: unknown): value is DealStatus {
  return typeof value === "string" && value in STATUS_COPY;
}

function capitalize(value: string): string {
  return value.length === 0 ? value : value.charAt(0).toUpperCase() + value.slice(1);
}

/** The catalog name when the item matches, otherwise the item phrase without its article. */
function productNameForItem(
  item: string | null,
  catalog: Product[],
  saved: Product[],
): string | null {
  if (!item) return null;

  const needle = item.trim().toLowerCase();
  const match = [...catalog, ...saved].find(
    (product) => product.item.trim().toLowerCase() === needle,
  );
  if (match) return match.name;

  const withoutArticle = item.trim().replace(/^an?\s+/i, "");
  return withoutArticle ? capitalize(withoutArticle) : null;
}

/* ------------------------------------------------------------------ */
/* Page                                                               */
/* ------------------------------------------------------------------ */

export default function ReceiptPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Receipt"
        title="Deal receipt"
        description="Your agreed terms and the payment schedule for this purchase."
        actions={
          <ButtonLink href="/trading-floor" variant="secondary">
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            Back to Trading Floor
          </ButtonLink>
        }
      />

      <Suspense fallback={<ReceiptSkeleton />}>
        <ReceiptBody />
      </Suspense>
    </div>
  );
}

/** `useSearchParams` needs a Suspense boundary because the app is a static export. */
function ReceiptBody() {
  const searchParams = useSearchParams();
  const requestedId = (searchParams.get("deal") ?? "").trim();
  const savedProducts = useSavedProducts();
  const [catalogProducts, setCatalogProducts] = useState<Product[]>([]);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<ReceiptState>(
    requestedId
      ? { kind: "loading", dealId: requestedId }
      : { kind: "missing" },
  );

  // Product names are a presentation detail; a catalog failure never blocks the receipt.
  useEffect(() => {
    let cancelled = false;

    getProducts()
      .then((products) => {
        if (!cancelled && Array.isArray(products)) setCatalogProducts(products);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!requestedId) return;

    let cancelled = false;

    getDeal(requestedId)
      .then((deal) => {
        if (!cancelled) setState({ kind: "ready", dealId: requestedId, deal });
      })
      .catch((cause: unknown) => {
        if (cancelled) return;

        // The backend forgets deals on restart. A snapshot saved in this browser keeps
        // the terms readable, but its payment state is never treated as live.
        const saved = findSavedDeal(requestedId);
        if (saved) {
          setState({
            kind: "cached",
            dealId: requestedId,
            deal: saved.deal,
            savedAt: saved.savedAt,
          });
          return;
        }

        if (cause instanceof ApiError && cause.status === 404) {
          setState({ kind: "not-found", dealId: requestedId });
          return;
        }

        setState({
          kind: "error",
          dealId: requestedId,
          message:
            cause instanceof ApiError
              ? cause.message
              : "We could not reach the payment service. Check your connection, then try again.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [requestedId, attempt]);

  const retry = () => {
    if (!requestedId) return;
    setState({ kind: "loading", dealId: requestedId });
    setAttempt((value) => value + 1);
  };

  if (!requestedId) return <MissingIdState />;

  // A state that belongs to a different ID is stale while the next fetch runs.
  if (state.kind === "missing" || state.dealId !== requestedId) {
    return <ReceiptSkeleton />;
  }

  switch (state.kind) {
    case "loading":
      return <ReceiptSkeleton />;
    case "not-found":
      return <UnknownDealState dealId={state.dealId} onRetry={retry} />;
    case "error":
      return (
        <LoadErrorState dealId={state.dealId} message={state.message} onRetry={retry} />
      );
    case "ready":
    case "cached":
      return (
        <DealReceipt
          deal={state.deal}
          productName={productNameForItem(
            formatText(state.deal.item),
            catalogProducts,
            savedProducts,
          )}
          fallbackId={state.dealId}
          cached={state.kind === "cached"}
          savedAt={state.kind === "cached" ? state.savedAt : null}
          onRetry={state.kind === "cached" ? retry : undefined}
          onDealUpdated={(deal) => setState({ kind: "ready", dealId: state.dealId, deal })}
        />
      );
  }
}

/* ------------------------------------------------------------------ */
/* Empty, loading and error states                                    */
/* ------------------------------------------------------------------ */

function ReceiptSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-busy="true" aria-label="Loading receipt">
      <div className="card p-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-3">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-3 w-40" />
          </div>
          <div className="space-y-3 sm:text-right">
            <Skeleton className="h-3 w-24 sm:ml-auto" />
            <Skeleton className="h-9 w-36 sm:ml-auto" />
          </div>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <div className="card p-6">
            <Skeleton className="h-4 w-36" />
            <div className="mt-5 space-y-5">
              {[0, 1, 2].map((row) => (
                <div key={row} className="flex items-center gap-3">
                  <Skeleton className="size-10 shrink-0" rounded="rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3 w-40" />
                    <Skeleton className="h-3 w-64 max-w-full" />
                  </div>
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          </div>
          <div className="card p-6">
            <Skeleton className="h-4 w-32" />
            <div className="mt-5 space-y-3">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
            </div>
          </div>
        </div>
        <div className="space-y-4">
          <div className="card p-5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-3 h-8 w-32" />
            <Skeleton className="mt-5 h-11 w-full" rounded="rounded-control" />
          </div>
          <div className="card p-5">
            <Skeleton className="h-4 w-24" />
            <div className="mt-4 space-y-3">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-11/12" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          </div>
        </div>
      </div>
      <LoadingState variant="pulse" description="Opening your receipt…" />
    </div>
  );
}

function MissingIdState() {
  return (
    <EmptyState
      icon={ReceiptText}
      title="No receipt to show yet"
      description="Receipts open automatically after a negotiation. Start one, reach a deal, and your terms will appear here."
      action={<ButtonLink href="/trading-floor">Watch a negotiation</ButtonLink>}
    />
  );
}

function UnknownDealState({
  dealId,
  onRetry,
}: {
  dealId: string;
  onRetry: () => void;
}) {
  return (
    <div className="space-y-3">
      <EmptyState
        icon={ReceiptText}
        title="We could not find that receipt"
        description="The link may be incomplete, or this browser may not have a saved copy of the deal. The backend also forgets deals when it restarts. Start a new negotiation to create a fresh receipt."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <ButtonLink href="/trading-floor">Start a negotiation</ButtonLink>
            <Button variant="secondary" onClick={onRetry}>
              Try this link again
            </Button>
          </div>
        }
      />
      <p className="text-center text-[11px] text-faint">
        Reference <span className="num break-all text-muted">{dealId}</span>
      </p>
    </div>
  );
}

function LoadErrorState({
  dealId,
  message,
  onRetry,
}: {
  dealId: string;
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="space-y-3">
      <ErrorState
        title="We could not load this receipt"
        description={message}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="secondary" onClick={onRetry}>
              Try again
            </Button>
            <ButtonLink href="/trading-floor" variant="ghost">
              Back to Trading Floor
            </ButtonLink>
          </div>
        }
      />
      <p className="text-center text-[11px] text-faint">
        Reference <span className="num break-all text-muted">{dealId}</span>
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Loaded receipt                                                     */
/* ------------------------------------------------------------------ */

function DealReceipt({
  deal,
  productName,
  fallbackId,
  cached = false,
  savedAt = null,
  onRetry,
  onDealUpdated,
}: {
  deal: Deal;
  productName: string | null;
  fallbackId: string;
  /** True when the backend has no record and these terms come from localStorage. */
  cached?: boolean;
  savedAt?: string | null;
  onRetry?: () => void;
  onDealUpdated: (deal: Deal) => void;
}) {
  const [actionStatus, setActionStatus] = useState<"idle" | "paying" | "delivering">(
    "idle",
  );
  const [actionError, setActionError] = useState<string | null>(null);

  const receiptId = formatText(deal.deal_id) ?? fallbackId;
  const item = formatText(deal.item);
  const seller = formatText(deal.seller);
  const rawStatus: unknown = deal.status;
  const status = isKnownStatus(rawStatus) ? rawStatus : null;

  const price = formatNumber(deal.price);
  const listPrice = formatNumber(deal.list_price);
  const total = formatNumber(deal.total) ?? price;
  const depositPercent = formatNumber(deal.deposit_percent);
  const deposit =
    formatNumber(deal.deposit) ??
    (total !== null && depositPercent !== null
      ? Math.round(total * depositPercent) / 100
      : null);
  const balance =
    formatNumber(deal.balance) ??
    (total !== null && deposit !== null ? Math.round((total - deposit) * 100) / 100 : null);
  const deliveryDays = formatNumber(deal.delivery_days);
  const delivery = formatDays(deliveryDays);

  const saving =
    price !== null && listPrice !== null && listPrice > price ? listPrice - price : null;
  const savingPercent =
    saving !== null && listPrice ? (saving / listPrice) * 100 : null;

  const statusCopy = status
    ? STATUS_COPY[status]
    : {
        headline: "Payment state unavailable",
        detail:
          "We cannot confirm the payment state for this deal, so payment actions are paused. Start a new negotiation to try again.",
      };

  const timeline = buildTimeline(status, deposit, balance, delivery);
  const depositLabel = formatMoney(deposit);
  const balanceLabel = formatMoney(balance);
  const totalLabel = formatMoney(total);
  const savedAtLabel = savedAt ? new Date(savedAt).toLocaleString() : null;

  async function handlePay() {
    // A saved copy is not proof the backend still knows this deal; never pay from it.
    if (cached || actionStatus !== "idle") return;
    setActionError(null);
    setActionStatus("paying");

    // Open the tab during the click gesture so the browser allows it.
    const paypalTab = window.open("about:blank", "_blank");
    if (!paypalTab) {
      setActionError("Allow pop-ups to open PayPal in a new tab.");
      setActionStatus("idle");
      return;
    }
    paypalTab.opener = null;

    try {
      const { approve_url } = await payDeal(receiptId);
      paypalTab.location.replace(approve_url);
    } catch (cause) {
      paypalTab.close();
      setActionError(
        cause instanceof ApiError
          ? cause.message
          : "PayPal could not be opened. Try again in a moment.",
      );
    } finally {
      setActionStatus("idle");
    }
  }

  async function handleDeliver() {
    if (cached || actionStatus !== "idle") return;
    setActionError(null);
    setActionStatus("delivering");

    try {
      const updated = await deliverDeal(receiptId);
      onDealUpdated(updated);
    } catch (cause) {
      setActionError(
        cause instanceof ApiError
          ? cause.message
          : "The balance could not be released. Try again in a moment.",
      );
    } finally {
      setActionStatus("idle");
    }
  }

  return (
    <div className="space-y-4">
      <p role="status" className="sr-only">
        {cached
          ? `Saved copy of receipt ${receiptId} loaded. Payment status is not live.`
          : `Receipt ${receiptId} loaded. ${statusCopy.headline}.`}
      </p>

      {/* Invoice header ---------------------------------------------- */}
      <section className="card relative overflow-hidden p-5 sm:p-6">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full bg-accent/10 blur-3xl"
        />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={status ? "success" : "neutral"} dot={false}>
                <ReceiptText className="size-3" aria-hidden="true" />
                Receipt
              </Badge>
              {status ? (
                <StatusBadge variant={status} />
              ) : (
                <Badge tone="neutral">Status unavailable</Badge>
              )}
              {cached ? <Badge tone="neutral">Saved copy · not live</Badge> : null}
            </div>
            <h2 className="mt-3 break-words text-[26px] font-semibold leading-tight tracking-[-0.02em] text-ink sm:text-[30px]">
              {productName ?? (item ? capitalize(item) : "Your purchase")}
            </h2>
            <p className="mt-1.5 text-body text-muted">
              {seller ? (
                <>
                  Sold by <span className="font-medium text-ink">{seller}</span>
                </>
              ) : (
                "Seller details are not available for this deal."
              )}
              {delivery ? ` · ${delivery} delivery` : ""}
            </p>
            <p className="mt-4 text-[11px] text-faint">
              Reference <span className="num break-all text-muted">{receiptId}</span>
            </p>
          </div>

          <div className="shrink-0 sm:max-w-[18rem] sm:text-right">
            <p className="label">Agreed total</p>
            <p className="num mt-1 text-[34px] font-semibold leading-none text-ink">
              {totalLabel ?? "—"}
            </p>
            {saving !== null && savingPercent !== null ? (
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-pill border border-success-line bg-success-soft px-2.5 py-1 text-[11px] font-medium text-success">
                <ArrowLeft className="size-3" aria-hidden="true" />
                {formatMoney(saving)} ({savingPercent.toFixed(1)}%) below list
              </p>
            ) : null}
            <p className="mt-2 text-[11px] leading-relaxed text-faint">
              One total, split into a deposit and a balance.
            </p>
          </div>
        </div>
      </section>

      {cached ? (
        <div
          role="note"
          className="rounded-panel border border-warning-line bg-warning-soft px-4 py-3 text-[12px] leading-relaxed text-warning"
        >
          <p className="font-semibold">Saved copy — payment status is unverified</p>
          <p className="mt-1">
            These terms were saved in this browser
            {savedAtLabel ? ` on ${savedAtLabel}` : ""}. The backend has no live record
            of this deal, so the status shown above is the last one we saw and may be out
            of date. Payment and delivery actions are disabled until the backend knows the
            deal again.
          </p>
          {onRetry ? (
            <Button variant="ghost" onClick={onRetry} className="mt-2">
              Check the backend again
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          {/* Timeline ------------------------------------------------- */}
          <section aria-labelledby="timeline-heading" className="card">
            <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
              <div>
                <p className="label mb-1 text-accent">How payment works</p>
                <h2 id="timeline-heading" className="text-h3 font-semibold text-ink">
                  Deposit, delivery, balance
                </h2>
              </div>
              <Badge tone="success">PayPal</Badge>
            </div>

            <ol className="relative p-5">
              {timeline.map((step, index) => {
                const Icon = step.icon;
                const isLast = index === timeline.length - 1;

                return (
                  <li
                    key={step.key}
                    className={cn("relative flex gap-3.5", !isLast && "pb-6")}
                  >
                    {!isLast ? (
                      <span
                        aria-hidden="true"
                        className={cn(
                          "absolute left-5 top-10 w-px",
                          step.state === "done" ? "bg-success-line" : "bg-line",
                        )}
                        style={{ height: "calc(100% - 2.5rem)" }}
                      />
                    ) : null}

                    <span
                      className={cn(
                        "relative z-10 grid size-10 shrink-0 place-items-center rounded-full border",
                        step.state === "done" &&
                          "border-success-line bg-success-soft text-success",
                        step.state === "pending" &&
                          "border-warning-line bg-warning-soft text-warning",
                        step.state === "upcoming" &&
                          "border-line bg-surface-2 text-faint",
                      )}
                    >
                      {step.state === "done" ? (
                        <Check className="size-4" aria-hidden="true" />
                      ) : (
                        <Icon className="size-4" aria-hidden="true" />
                      )}
                    </span>

                    <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-ink">{step.title}</p>
                        <p className="mt-0.5 max-w-sm text-[12px] leading-relaxed text-muted">
                          {step.description}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="num text-[14px] font-semibold text-ink">
                          {step.amount}
                        </p>
                        <Badge
                          tone={
                            step.state === "done"
                              ? "success"
                              : step.state === "pending"
                                ? "warning"
                                : "neutral"
                          }
                          className="mt-1"
                        >
                          {step.stateLabel}
                        </Badge>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>

            <p className="flex items-start gap-2 border-t border-line px-5 py-3 text-[11px] leading-relaxed text-faint">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden="true" />
              The balance is only released after you confirm delivery. Payments run in
              the PayPal sandbox.
            </p>
          </section>

          {/* Invoice breakdown --------------------------------------- */}
          <section aria-labelledby="invoice-heading" className="card">
            <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
              <div>
                <p className="label mb-1 text-accent">Invoice</p>
                <h2 id="invoice-heading" className="text-h3 font-semibold text-ink">
                  Order summary
                </h2>
              </div>
              <CreditCard className="size-4 text-faint" aria-hidden="true" />
            </div>

            <dl className="divide-y divide-line/70 px-5">
              {listPrice !== null ? (
                <div className="flex items-baseline justify-between gap-4 py-3">
                  <dt className="text-[12px] text-muted">Seller&apos;s list price</dt>
                  <dd className="num text-[13px] text-muted">{formatMoney(listPrice)}</dd>
                </div>
              ) : null}
              {saving !== null ? (
                <div className="flex items-baseline justify-between gap-4 py-3">
                  <dt className="text-[12px] text-muted">Negotiated saving</dt>
                  <dd className="num text-[13px] font-medium text-success">
                    −{formatMoney(saving)}
                  </dd>
                </div>
              ) : null}
              <div className="flex items-baseline justify-between gap-4 py-3.5">
                <dt className="text-[13px] font-semibold text-ink">Agreed total</dt>
                <dd className="num text-[18px] font-semibold text-ink">
                  {totalLabel ?? "—"}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 py-3">
                <dt className="text-[12px] text-muted">
                  Deposit {depositPercent !== null ? `(${formatPercent(depositPercent)})` : ""}
                </dt>
                <dd className="num text-[13px] font-medium text-ink">
                  {depositLabel ?? "—"}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 py-3">
                <dt className="text-[12px] text-muted">Balance on delivery</dt>
                <dd className="num text-[13px] font-medium text-ink">
                  {balanceLabel ?? "—"}
                </dd>
              </div>
            </dl>

            <p className="border-t border-line px-5 py-3 text-[11px] leading-relaxed text-faint">
              No taxes or extra fees are added in this demo. The deposit and balance add
              up to the agreed total.
            </p>
          </section>
        </div>

        {/* Action + details ------------------------------------------ */}
        <aside className="order-first space-y-4 lg:order-last">
          <ActionPanel
            status={status}
            deposit={deposit}
            balance={balance}
            cached={cached}
            onRetry={onRetry}
            paying={actionStatus === "paying"}
            delivering={actionStatus === "delivering"}
            busy={actionStatus !== "idle"}
            error={actionError}
            onPay={() => void handlePay()}
            onDeliver={() => void handleDeliver()}
          />

          <section aria-labelledby="details-heading" className="card p-5">
            <h2 id="details-heading" className="text-h3 font-semibold text-ink">
              Deal details
            </h2>
            <dl className="mt-4 divide-y divide-line/70">
              <DetailRow
                label="Product"
                value={productName ?? item ?? "Not recorded"}
              />
              <DetailRow label="Seller" value={seller ?? "Not recorded"} />
              <DetailRow label="Delivery" value={delivery ?? "Not recorded"} />
              <DetailRow
                label="Deposit"
                value={formatPercent(depositPercent) ?? "Not recorded"}
              />
              <DetailRow label="Buyer" value="You" />
              <DetailRow
                label="Payment"
                value="PayPal · Sandbox"
                icon={ShieldCheck}
              />
              <DetailRow label="Reference" value={receiptId} mono />
            </dl>
            <p className="mt-4 border-t border-line pt-4 text-[11px] leading-relaxed text-faint">
              {cached
                ? "Saved in this browser for reference. Payment status is not live, so payment and delivery cannot be completed from this copy."
                : "This receipt shows the latest payment status we have. Reload to refresh it."}
            </p>
          </section>

          <Link
            href="/trading-floor"
            className="group flex items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3.5 text-[12px] font-medium text-muted transition-colors hover:border-line-strong hover:text-ink"
          >
            Return to the Trading Floor
            <ArrowRight
              className="size-4 text-faint transition-transform group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </Link>
        </aside>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Action panel                                                       */
/* ------------------------------------------------------------------ */

function ActionPanel({
  status,
  deposit,
  balance,
  cached,
  paying,
  delivering,
  busy,
  error,
  onRetry,
  onPay,
  onDeliver,
}: {
  status: DealStatus | null;
  deposit: number | null;
  balance: number | null;
  cached: boolean;
  paying: boolean;
  delivering: boolean;
  busy: boolean;
  error: string | null;
  onRetry?: () => void;
  onPay: () => void;
  onDeliver: () => void;
}) {
  const depositLabel = formatMoney(deposit);
  const balanceLabel = formatMoney(balance);
  const hasBalance = balance !== null && balance > 0;

  const shell =
    "card relative overflow-hidden p-5";

  // Cached terms are display-only: no payment or delivery control is rendered at all.
  if (cached) {
    return (
      <section aria-labelledby="action-heading" className={shell}>
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full border border-warning-line bg-warning-soft text-warning">
            <ShieldCheck className="size-4" aria-hidden="true" />
          </span>
          <div>
            <p className="label mb-1 text-warning">Saved copy</p>
            <h2 id="action-heading" className="text-h3 font-semibold text-ink">
              Payment unavailable
            </h2>
            <p className="mt-1 text-[12px] leading-relaxed text-muted">
              We cannot confirm this deal with the backend, so no payment or delivery is
              offered. The terms shown are a saved copy for reference.
            </p>
          </div>
        </div>
        <ButtonLink href="/trading-floor" variant="secondary" className="mt-4 w-full">
          Start a new negotiation
        </ButtonLink>
        {onRetry ? (
          <Button variant="ghost" onClick={onRetry} className="mt-2 w-full">
            Check the backend again
          </Button>
        ) : null}
      </section>
    );
  }

  if (status === "negotiated") {
    return (
      <section aria-labelledby="action-heading" className={shell}>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-12 -top-16 size-40 rounded-full bg-paypal/10 blur-2xl"
        />
        <div className="relative">
          <p className="label mb-1 text-warning">Next step</p>
          <h2 id="action-heading" className="text-h3 font-semibold text-ink">
            Pay your deposit
          </h2>
          <p className="mt-1 text-[12px] leading-relaxed text-muted">
            Approve in PayPal. The deposit is captured now; the balance waits for
            delivery.
          </p>

          <div className="mt-4 rounded-panel border border-line bg-surface-2/60 px-3.5 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[11px] text-muted">Due now</span>
              <span className="num text-[22px] font-semibold text-ink">
                {depositLabel ?? "—"}
              </span>
            </div>
            {hasBalance ? (
              <p className="mt-1 text-right text-[10px] text-faint">
                {balanceLabel} after delivery
              </p>
            ) : null}
          </div>

          <Button
            variant="paypal"
            onClick={onPay}
            disabled={busy}
            className="mt-3 w-full"
          >
            {paying ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Opening PayPal…
              </>
            ) : (
              <>
                <Wallet className="size-4" aria-hidden="true" />
                Pay {depositLabel ?? "deposit"} with PayPal
              </>
            )}
          </Button>
          <ActionError message={error} />
          <p className="mt-2.5 flex items-center justify-center gap-1.5 text-[10px] text-faint">
            <ShieldCheck className="size-3 text-warning" aria-hidden="true" />
            Sandbox payment. No real money moves.
          </p>
        </div>
      </section>
    );
  }

  if (status === "deposit_paid") {
    return (
      <section aria-labelledby="action-heading" className={shell}>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-12 -top-16 size-40 rounded-full bg-success/10 blur-2xl"
        />
        <div className="relative">
          <p className="label mb-1 text-success">Deposit paid</p>
          <h2 id="action-heading" className="text-h3 font-semibold text-ink">
            Confirm delivery
          </h2>
          <p className="mt-1 text-[12px] leading-relaxed text-muted">
            Only confirm once the item has arrived. This releases the remaining balance
            to the seller.
          </p>

          <div className="mt-4 rounded-panel border border-line bg-surface-2/60 px-3.5 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[11px] text-muted">Release on delivery</span>
              <span className="num text-[22px] font-semibold text-ink">
                {balanceLabel ?? "—"}
              </span>
            </div>
            <p className="mt-1 text-right text-[10px] text-faint">
              Deposit {depositLabel ?? "—"} already captured
            </p>
          </div>

          <Button
            variant="success"
            onClick={onDeliver}
            disabled={busy}
            className="mt-3 w-full"
          >
            {delivering ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Releasing balance…
              </>
            ) : (
              <>
                <PackageCheck className="size-4" aria-hidden="true" />
                Confirm delivery
              </>
            )}
          </Button>
          <ActionError message={error} />
          <p className="mt-2.5 text-center text-[10px] text-faint">
            This action cannot be undone.
          </p>
        </div>
      </section>
    );
  }

  if (status === "awaiting_approval") {
    return (
      <section aria-labelledby="action-heading" className={shell}>
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full border border-warning-line bg-warning-soft text-warning">
            <Clock className="size-4" aria-hidden="true" />
          </span>
          <div>
            <p className="label mb-1 text-warning">Almost there</p>
            <h2 id="action-heading" className="text-h3 font-semibold text-ink">
              Finish in PayPal
            </h2>
            <p className="mt-1 text-[12px] leading-relaxed text-muted">
              Your order is waiting for approval in the PayPal window. If it closed, start
              a new negotiation to try again.
            </p>
          </div>
        </div>
        <ButtonLink
          href="/trading-floor"
          variant="secondary"
          className="mt-4 w-full"
        >
          Start a new negotiation
        </ButtonLink>
        <ActionError message={error} />
      </section>
    );
  }

  if (status === "complete") {
    return (
      <section aria-labelledby="action-heading" className={shell}>
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full border border-success-line bg-success-soft text-success">
            <BadgeCheck className="size-5" aria-hidden="true" />
          </span>
          <div>
            <p className="label mb-1 text-success">Complete</p>
            <h2 id="action-heading" className="text-h3 font-semibold text-ink">
              Paid in full
            </h2>
            <p className="mt-1 text-[12px] leading-relaxed text-muted">
              Deposit and balance are settled. Nothing else is due on this deal.
            </p>
          </div>
        </div>
        <ButtonLink href="/trading-floor" variant="secondary" className="mt-4 w-full">
          Negotiate another purchase
        </ButtonLink>
        <p className="mt-2.5 flex items-center justify-center gap-1.5 text-[10px] text-faint">
          <ShieldCheck className="size-3 text-success" aria-hidden="true" />
          Sandbox payment. No real money moves.
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="action-heading" className={shell}>
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full border border-line bg-surface-2 text-faint">
          <Clock className="size-4" aria-hidden="true" />
        </span>
        <div>
          <p className="label mb-1 text-faint">Payment paused</p>
          <h2 id="action-heading" className="text-h3 font-semibold text-ink">
            Status unavailable
          </h2>
          <p className="mt-1 text-[12px] leading-relaxed text-muted">
            We cannot confirm the payment state for this deal, so no action is offered
            here. Start a new negotiation to try again.
          </p>
        </div>
      </div>
      <ButtonLink href="/trading-floor" variant="secondary" className="mt-4 w-full">
        Start a new negotiation
      </ButtonLink>
      <ActionError message={error} />
    </section>
  );
}

function ActionError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="mt-3 rounded-control border border-danger-line bg-danger-soft px-3 py-2 text-[11px] leading-relaxed text-danger"
    >
      {message}
    </p>
  );
}

/* ------------------------------------------------------------------ */
/* Timeline and small pieces                                          */
/* ------------------------------------------------------------------ */

function buildTimeline(
  status: DealStatus | null,
  deposit: number | null,
  balance: number | null,
  delivery: string | null,
): TimelineStep[] {
  const depositDone = status === "deposit_paid" || status === "complete";
  const complete = status === "complete";
  const awaiting = status === "awaiting_approval";
  const negotiated = status === "negotiated";

  return [
    {
      key: "deposit",
      title: "Deposit paid",
      description: depositDone
        ? "Captured by PayPal and held against your order."
        : "Approved and captured when you check out with PayPal.",
      amount: formatMoney(deposit) ?? "—",
      state: depositDone ? "done" : "pending",
      stateLabel: depositDone
        ? "Paid"
        : awaiting
          ? "Awaiting approval"
          : negotiated
            ? "Due now"
            : "Pending",
      icon: Wallet,
    },
    {
      key: "delivery",
      title: "Delivery confirmed",
      description: complete
        ? "You confirmed the item arrived as agreed."
        : status === "deposit_paid"
          ? "Confirm delivery once the item arrives."
          : "You confirm delivery after the item arrives.",
      amount: delivery ?? "—",
      state: complete ? "done" : status === "deposit_paid" ? "pending" : "upcoming",
      stateLabel: complete
        ? "Confirmed"
        : status === "deposit_paid"
          ? "Waiting for you"
          : "After deposit",
      icon: Truck,
    },
    {
      key: "balance",
      title: "Balance released",
      description: complete
        ? "The remaining balance was captured after delivery."
        : "Released to the seller only after you confirm delivery.",
      amount: formatMoney(balance) ?? "—",
      state: complete ? "done" : status === "deposit_paid" ? "pending" : "upcoming",
      stateLabel: complete ? "Released" : status === "deposit_paid" ? "On delivery" : "After delivery",
      icon: BadgeCheck,
    },
  ];
}

function DetailRow({
  label,
  value,
  mono = false,
  icon: Icon,
}: {
  label: string;
  value: string;
  mono?: boolean;
  icon?: LucideIcon;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="text-[11px] text-faint">{label}</dt>
      <dd
        className={cn(
          "flex items-center gap-1.5 text-right text-[12px] font-medium text-ink",
          mono && "num break-all font-normal text-muted",
        )}
      >
        {Icon ? <Icon className="size-3 text-success" aria-hidden="true" /> : null}
        {value}
      </dd>
    </div>
  );
}
