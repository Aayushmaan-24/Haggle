"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Handshake,
  LayoutDashboard,
  ReceiptText,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button, ButtonLink } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ApiError, deliverDeal, getDeal, payDeal } from "@/lib/api";
import type { Deal, DealStatus } from "@/lib/types";
import { cn } from "@/lib/cn";

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Copy for the four statuses the backend actually stores on a deal. */
const STATUS_COPY: Record<DealStatus, { headline: string; detail: string }> = {
  negotiated: {
    headline: "Terms agreed, payment not started",
    detail:
      "This deal is stored and its terms are final, but no PayPal order exists yet. No authorization or capture is recorded for it.",
  },
  awaiting_approval: {
    headline: "Waiting for PayPal approval",
    detail:
      "A PayPal order for the full amount has been created and the buyer was sent to approve it. No authorization or capture is recorded for the deal yet.",
  },
  deposit_paid: {
    headline: "Deposit captured, balance pending",
    detail:
      "PayPal authorized the full amount and captured the deposit. The balance is released once delivery is confirmed.",
  },
  complete: {
    headline: "Payment complete",
    detail:
      "The deposit and any remaining balance have been captured for this deal.",
  },
};

type PaymentStepTone = "done" | "pending" | "idle";

type PaymentStep = {
  key: string;
  title: string;
  state: string;
  detail: string;
  tone: PaymentStepTone;
};

type ReceiptState =
  | { kind: "missing" }
  | { kind: "loading"; dealId: string }
  | { kind: "ready"; dealId: string; deal: Deal }
  | { kind: "not-found"; dealId: string }
  | { kind: "error"; dealId: string; message: string };

const NEXT_LINKS: Array<{
  href: string;
  label: string;
  body: string;
  icon: LucideIcon;
}> = [
  {
    href: "/trading-floor",
    label: "Trading Floor",
    body: "Run a negotiation and open the next deal.",
    icon: Handshake,
  },
  {
    href: "/",
    label: "Overview",
    body: "How the mandate, negotiation and settlement fit together.",
    icon: LayoutDashboard,
  },
  {
    href: "/benchmark",
    label: "Benchmark",
    body: "Recorded runs and their guard results.",
    icon: TrendingUp,
  },
];

/* ------------------------------------------------------------------ */
/* Formatting and guards                                               */
/* ------------------------------------------------------------------ */

function formatText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function formatNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatMoney(value: unknown): string | null {
  const amount = formatNumber(value);
  return amount === null ? null : usd.format(amount);
}

function formatPercent(value: unknown): string | null {
  const percent = formatNumber(value);
  if (percent === null) return null;
  return `${Number.isInteger(percent) ? percent : percent.toFixed(1)}%`;
}

function formatDays(value: unknown): string | null {
  const days = formatNumber(value);
  if (days === null) return null;
  return `${days} ${days === 1 ? "day" : "days"}`;
}

function isKnownStatus(value: unknown): value is DealStatus {
  return typeof value === "string" && value in STATUS_COPY;
}

/* ------------------------------------------------------------------ */
/* Payment steps, derived only from the deal's status field            */
/* ------------------------------------------------------------------ */

function authorizationStep(status: DealStatus | null): PaymentStep {
  const title = "PayPal authorization";

  if (!status) {
    return {
      key: "authorization",
      title,
      state: "Not available",
      tone: "idle",
      detail:
        "The deal status is not recognised, so no authorization state is assumed.",
    };
  }

  if (status === "negotiated") {
    return {
      key: "authorization",
      title,
      state: "Not started",
      tone: "idle",
      detail: "No PayPal order has been created for this deal yet.",
    };
  }

  if (status === "awaiting_approval") {
    return {
      key: "authorization",
      title,
      state: "Awaiting approval",
      tone: "pending",
      detail:
        "The PayPal order exists for the full amount, but no authorization is recorded for this deal yet.",
    };
  }

  return {
    key: "authorization",
    title,
    state: "Authorized",
    tone: "done",
    detail: "The full amount was authorized before the deposit was captured.",
  };
}

function depositStep(
  status: DealStatus | null,
  deposit: number | null,
  percentLabel: string | null,
): PaymentStep {
  const title = percentLabel
    ? `Deposit capture (${percentLabel})`
    : "Deposit capture";

  if (deposit !== null && deposit <= 0) {
    return {
      key: "deposit",
      title,
      state: "No deposit due",
      tone: "idle",
      detail: "The stored deposit is zero, so nothing is captured up front.",
    };
  }

  if (!status) {
    return {
      key: "deposit",
      title,
      state: "Not available",
      tone: "idle",
      detail:
        "The deal status is not recognised, so the deposit state cannot be determined.",
    };
  }

  if (status === "deposit_paid" || status === "complete") {
    return {
      key: "deposit",
      title,
      state: "Captured",
      tone: "done",
      detail: "PayPal captured the deposit after the order was approved.",
    };
  }

  if (status === "awaiting_approval") {
    return {
      key: "deposit",
      title,
      state: "Not captured yet",
      tone: "pending",
      detail:
        "The deposit is captured only after the buyer approves the full amount in PayPal.",
    };
  }

  return {
    key: "deposit",
    title,
    state: "Not captured",
    tone: "idle",
    detail: "Nothing is captured until the PayPal order is created and approved.",
  };
}

function balanceStep(
  status: DealStatus | null,
  balance: number | null,
): PaymentStep {
  const title = "Balance capture";

  if (balance !== null && balance <= 0) {
    return {
      key: "balance",
      title,
      state: "No balance due",
      tone: "idle",
      detail:
        "The deposit covers the full amount, so there is no balance to release.",
    };
  }

  if (!status) {
    return {
      key: "balance",
      title,
      state: "Not available",
      tone: "idle",
      detail:
        "The deal status is not recognised, so the balance state cannot be determined.",
    };
  }

  if (status === "complete") {
    return {
      key: "balance",
      title,
      state: "Captured",
      tone: "done",
      detail:
        "PayPal captured the balance after delivery was confirmed and the deal completed.",
    };
  }

  if (status === "deposit_paid") {
    return {
      key: "balance",
      title,
      state: "Pending delivery",
      tone: "pending",
      detail:
        "The balance is still held in the authorization. It is captured when delivery is confirmed.",
    };
  }

  if (status === "awaiting_approval") {
    return {
      key: "balance",
      title,
      state: "Not captured yet",
      tone: "pending",
      detail:
        "The balance is captured only after the deposit is taken and delivery is confirmed.",
    };
  }

  return {
    key: "balance",
    title,
    state: "Not captured",
    tone: "idle",
    detail:
      "Nothing is captured until the order is approved and the deposit is taken.",
  };
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function ReceiptPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Settlement"
        title="Deal receipt"
        description="The agreed terms and the PayPal payment split for a stored deal. Payment state comes from the deal's own status, and any action here calls the backend's existing PayPal endpoints and waits for the server response."
        actions={
          <ButtonLink href="/trading-floor" variant="secondary">
            Back to Trading Floor
          </ButtonLink>
        }
      />

      <Suspense fallback={<LoadingPanel dealId={null} />}>
        <ReceiptBody />
      </Suspense>

      <WhereToNext />
    </div>
  );
}

/** `useSearchParams` needs a Suspense boundary because the app is a static export. */
function ReceiptBody() {
  const searchParams = useSearchParams();
  const requestedId = (searchParams.get("deal") ?? "").trim();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<ReceiptState>(
    requestedId
      ? { kind: "loading", dealId: requestedId }
      : { kind: "missing" },
  );

  useEffect(() => {
    if (!requestedId) return;

    let cancelled = false;

    getDeal(requestedId)
      .then((deal) => {
        if (!cancelled) setState({ kind: "ready", dealId: requestedId, deal });
      })
      .catch((cause: unknown) => {
        if (cancelled) return;

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
              : "The backend could not be reached. Check that it is running, then try again.",
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
    return <LoadingPanel dealId={requestedId} />;
  }

  switch (state.kind) {
    case "loading":
      return <LoadingPanel dealId={state.dealId} />;
    case "not-found":
      return <UnknownDealState dealId={state.dealId} onRetry={retry} />;
    case "error":
      return (
        <LoadErrorState
          dealId={state.dealId}
          message={state.message}
          onRetry={retry}
        />
      );
    case "ready":
      return (
        <DealReceipt
          deal={state.deal}
          fallbackId={state.dealId || formatText(state.deal.deal_id) || "unknown"}
          onDealUpdated={(deal) =>
            setState({ kind: "ready", dealId: state.dealId, deal })
          }
        />
      );
  }
}

/* ------------------------------------------------------------------ */
/* States                                                              */
/* ------------------------------------------------------------------ */

function LoadingPanel({ dealId }: { dealId: string | null }) {
  return (
    <section
      aria-labelledby="loading-heading"
      aria-busy="true"
      className="rounded-panel border border-line bg-surface p-5 sm:p-6"
    >
      <h2 id="loading-heading" className="text-lg font-semibold text-ink">
        Loading deal
      </h2>
      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">
        Fetching the receipt from the backend&apos;s deal endpoint.
      </p>
      <LoadingState
        variant="pulse"
        description="Reading the stored deal and its payment status…"
      />
      <p role="status" className="sr-only">
        {dealId
          ? `Loading the receipt for deal ${dealId}.`
          : "Loading the receipt."}
      </p>
    </section>
  );
}

function MissingIdState() {
  return (
    <section
      aria-labelledby="missing-heading"
      className="rounded-panel border border-dashed border-line px-6 py-10 text-center"
    >
      <span className="mx-auto flex size-10 items-center justify-center rounded-full bg-lavender-soft">
        <ReceiptText className="size-5 text-lavender" aria-hidden="true" />
      </span>
      <h2
        id="missing-heading"
        className="mt-3 text-lg font-semibold tracking-[-0.01em] text-ink"
      >
        No deal ID in this link
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">
        A receipt opens as{" "}
        <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[12px] text-lavender">
          /receipt?deal=&lt;id&gt;
        </code>
        . Without an ID there is no stored deal to look up.
      </p>
      <p className="mx-auto mt-2 max-w-md text-[12px] leading-relaxed text-muted">
        The backend adds the deal ID itself when PayPal redirects here, so a
        normal arrival always carries one.
      </p>
      <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
        <ButtonLink href="/trading-floor">Open Trading Floor</ButtonLink>
        <ButtonLink href="/" variant="secondary">
          Back to Overview
        </ButtonLink>
      </div>
    </section>
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
    <section
      aria-labelledby="unknown-heading"
      className="rounded-panel border border-line bg-surface p-5 sm:p-6"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-lavender">
            Deal lookup
          </p>
          <h2
            id="unknown-heading"
            className="mt-1 text-xl font-semibold tracking-[-0.01em] text-ink"
          >
            No deal found for this ID
          </h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">
            The deal endpoint returned 404. Deals live in server memory only, so
            a backend restart clears them, and an ID from another deployment will
            not resolve here.
          </p>
          <p className="mt-3 text-[12px] text-muted">
            Requested deal ID{" "}
            <span className="break-all font-mono text-lavender">{dealId}</span>
          </p>
        </div>
        <span className="inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full bg-warning-soft px-2.5 py-1 text-[12px] font-medium text-warning">
          <span className="size-1.5 rounded-full bg-warning" aria-hidden="true" />
          Not found
        </span>
      </div>

      <div className="mt-5 flex flex-col gap-2 border-t border-line pt-4 sm:flex-row">
        <ButtonLink href="/trading-floor">Open Trading Floor</ButtonLink>
        <Button variant="secondary" onClick={onRetry}>
          Try this deal ID again
        </Button>
      </div>
    </section>
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
    <section aria-labelledby="load-error-heading" className="space-y-3">
      <h2 id="load-error-heading" className="sr-only">
        Receipt load error
      </h2>
      <ErrorState
        title="The deal could not be loaded"
        description={message}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="secondary" onClick={onRetry}>
              Try loading this deal again
            </Button>
            <ButtonLink href="/trading-floor" variant="ghost">
              Open Trading Floor
            </ButtonLink>
          </div>
        }
      />
      <p className="text-center text-[12px] text-muted">
        Requested deal ID{" "}
        <span className="break-all font-mono text-lavender">{dealId}</span>
      </p>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Loaded receipt                                                      */
/* ------------------------------------------------------------------ */

function DealReceipt({
  deal,
  fallbackId,
  onDealUpdated,
}: {
  deal: Deal;
  fallbackId: string;
  onDealUpdated: (deal: Deal) => void;
}) {
  const [actionStatus, setActionStatus] = useState<
    "idle" | "paying" | "delivering"
  >("idle");
  const [actionError, setActionError] = useState<string | null>(null);

  const receiptId = formatText(deal.deal_id) ?? fallbackId;
  const item = formatText(deal.item);
  const seller = formatText(deal.seller);
  const rawStatus = formatText(deal.status);
  const knownStatus = isKnownStatus(rawStatus) ? rawStatus : null;

  const price = formatNumber(deal.price);
  const listPrice = formatNumber(deal.list_price);
  const total = formatNumber(deal.total);
  const deposit = formatNumber(deal.deposit);
  const balance = formatNumber(deal.balance);
  const depositPercent = formatPercent(deal.deposit_percent);
  const delivery = formatDays(deal.delivery_days);

  const statusCopy = knownStatus
    ? STATUS_COPY[knownStatus]
    : {
        headline: "Deal status not recognised",
        detail: rawStatus
          ? `The backend returned “${rawStatus}”, which this page does not recognise. No payment state is assumed below.`
          : "The deal response does not include a status, so no payment state is assumed below.",
      };

  let priceHint: string | null = null;
  if (price !== null && listPrice !== null && listPrice > 0) {
    if (price < listPrice) {
      const saving = listPrice - price;
      priceHint = `${usd.format(saving)} (${(
        (saving / listPrice) *
        100
      ).toFixed(1)}%) below the seller’s list price.`;
    } else if (price === listPrice) {
      priceHint = "Equal to the seller’s list price.";
    } else {
      priceHint = `${usd.format(price - listPrice)} above the seller’s list price.`;
    }
  }

  const allAmountsKnown =
    total !== null && deposit !== null && balance !== null;
  const breakdownAddsUp =
    allAmountsKnown && Math.abs((total ?? 0) - (deposit ?? 0) - (balance ?? 0)) < 0.011;

  let consistencyNote =
    "Deposit and balance add up to the agreed total. The figures are stored on the server, not calculated by this page.";
  if (!allAmountsKnown) {
    consistencyNote =
      "One or more amounts were not included in the deal response, so the split cannot be checked here.";
  } else if (!breakdownAddsUp) {
    consistencyNote =
      "The stored deposit and balance do not add up to the stored total. The figures are shown unchanged rather than corrected.";
  }

  const steps: PaymentStep[] = [
    authorizationStep(knownStatus),
    depositStep(knownStatus, deposit, depositPercent),
    balanceStep(knownStatus, balance),
  ];

  async function handlePay() {
    if (actionStatus !== "idle") return;

    setActionError(null);
    setActionStatus("paying");

    try {
      const { approve_url } = await payDeal(receiptId);
      // The server has created the order; reset the button before the browser
      // leaves, in case the user returns with the Back button.
      setActionStatus("idle");
      window.location.assign(approve_url);
    } catch (cause) {
      setActionError(
        cause instanceof ApiError
          ? cause.message
          : "The PayPal order could not be created. Check that the backend is running, then try again.",
      );
      setActionStatus("idle");
    }
  }

  async function handleDeliver() {
    if (actionStatus !== "idle") return;

    setActionError(null);
    setActionStatus("delivering");

    try {
      const updated = await deliverDeal(receiptId);
      onDealUpdated(updated);
    } catch (cause) {
      setActionError(
        cause instanceof ApiError
          ? cause.message
          : "The balance could not be captured. Check that the backend is running, then try again.",
      );
    } finally {
      setActionStatus("idle");
    }
  }

  return (
    <div className="space-y-6">
      <p role="status" className="sr-only">
        {`Deal ${receiptId} loaded. ${statusCopy.headline}.`}
      </p>

      {/* Payment status ------------------------------------------------ */}
      <section
        aria-labelledby="payment-status-heading"
        className="rounded-panel border border-line bg-surface p-5 sm:p-6"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-lavender">
              Payment status
            </p>
            <h2
              id="payment-status-heading"
              className="mt-1 text-xl font-semibold tracking-[-0.01em] text-ink"
            >
              {statusCopy.headline}
            </h2>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">
              {statusCopy.detail}
            </p>
            <p className="mt-3 text-[12px] text-muted">
              Deal ID{" "}
              <span className="ml-1 break-all font-mono text-lavender">
                {receiptId}
              </span>
            </p>
          </div>
          <div className="shrink-0">
            {knownStatus ? (
              <StatusBadge variant={knownStatus} />
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-[12px] font-medium text-muted">
                <span
                  className="size-1.5 rounded-full bg-faint"
                  aria-hidden="true"
                />
                Status unrecognised
              </span>
            )}
          </div>
        </div>

        {knownStatus ? (
          <div className="mt-4 border-t border-line pt-4">
            {knownStatus === "negotiated" ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="max-w-xl text-[12px] leading-relaxed text-muted">
                  Starting settlement creates a sandbox PayPal order for the full
                  amount. After approval, PayPal authorizes it and captures the
                  deposit.
                </p>
                <Button
                  variant="paypal"
                  onClick={() => void handlePay()}
                  disabled={actionStatus !== "idle"}
                  className="shrink-0"
                >
                  {actionStatus === "paying"
                    ? "Opening PayPal…"
                    : "Pay with PayPal"}
                </Button>
              </div>
            ) : null}

            {knownStatus === "deposit_paid" ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="max-w-xl text-[12px] leading-relaxed text-muted">
                  Confirming delivery captures the remaining balance through
                  PayPal. The backend accepts this only while the deal is deposit
                  paid.
                </p>
                <Button
                  variant="secondary"
                  onClick={() => void handleDeliver()}
                  disabled={actionStatus !== "idle"}
                  className="shrink-0"
                >
                  {actionStatus === "delivering"
                    ? "Capturing balance…"
                    : "Confirm delivery & capture balance"}
                </Button>
              </div>
            ) : null}

            {knownStatus === "awaiting_approval" ? (
              <p className="max-w-2xl text-[12px] leading-relaxed text-muted">
                Complete the approval in the PayPal window. The backend stores the
                order, but not the approval link, so this page cannot reopen it.
              </p>
            ) : null}

            {knownStatus === "complete" ? (
              <p className="max-w-2xl text-[12px] leading-relaxed text-muted">
                Settlement is complete. No further payment action is available
                for this deal.
              </p>
            ) : null}

            {actionError ? (
              <p
                role="alert"
                className="mt-3 rounded-lg border border-danger/40 bg-danger-soft px-3 py-2 text-[12px] leading-relaxed text-danger"
              >
                {actionError}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* Deal summary -------------------------------------------------- */}
      <section
        aria-labelledby="deal-summary-heading"
        className="rounded-panel border border-line bg-surface p-5 sm:p-6"
      >
        <div className="flex flex-col gap-4 border-b border-line pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-lavender">
              Deal summary
            </p>
            <h2
              id="deal-summary-heading"
              className="mt-1 break-words text-xl font-semibold tracking-[-0.01em] text-ink"
            >
              {item ?? "Deal details"}
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              {seller ? (
                <>
                  Sold by <span className="text-ink">{seller}</span>
                </>
              ) : (
                "The seller is not recorded in this deal."
              )}
            </p>
          </div>

          <div className="shrink-0 sm:text-right">
            <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
              Agreed price
            </p>
            <p className="mt-0.5 break-all font-mono text-2xl font-semibold tabular-nums text-ink">
              {formatMoney(price) ?? "Not recorded"}
            </p>
            {priceHint ? (
              <p className="mt-1 text-[11px] leading-relaxed text-muted sm:max-w-[15rem]">
                {priceHint}
              </p>
            ) : null}
          </div>
        </div>

        <dl className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          <Fact
            label="Buyer"
            value="You (buyer agent)"
            hint="The deal record stores no buyer name, email or account."
          />
          <Fact
            label="Deposit terms"
            value={depositPercent ? `${depositPercent} of the total` : null}
            hint="Captured up front; the rest is released on delivery."
          />
          <Fact
            label="Delivery"
            value={delivery}
            hint="The delivery window the winning seller agreed to."
          />
          <Fact
            label="Seller list price"
            value={formatMoney(listPrice)}
            hint="That seller's own list price before negotiation."
            mono
          />
        </dl>
      </section>

      {/* Payment breakdown --------------------------------------------- */}
      <section
        aria-labelledby="payment-breakdown-heading"
        className="rounded-panel border border-line bg-surface p-5 sm:p-6"
      >
        <div className="space-y-1 border-b border-line pb-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-lavender">
            Payment
          </p>
          <h2
            id="payment-breakdown-heading"
            className="text-lg font-semibold tracking-[-0.01em] text-ink"
          >
            Payment breakdown
          </h2>
          <p className="max-w-2xl text-sm leading-relaxed text-muted">
            Amounts come from the stored deal. The steps below report its status
            field only; they are not a separate PayPal event log.
          </p>
        </div>

        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          <Amount
            label="Agreed total"
            value={formatMoney(total)}
            hint="The full amount the payment split is based on."
          />
          <Amount
            label={depositPercent ? `Deposit (${depositPercent})` : "Deposit"}
            value={formatMoney(deposit)}
            hint="The share captured up front, once the order is approved."
          />
          <Amount
            label="Balance"
            value={formatMoney(balance)}
            hint="The remainder, released when delivery is confirmed."
          />
        </dl>

        <p className="mt-3 text-[12px] leading-relaxed text-muted">
          {consistencyNote}
        </p>

        <h3 className="mt-6 text-sm font-semibold text-ink">
          Settlement steps
        </h3>
        <p className="mt-1 text-[12px] leading-relaxed text-muted">
          Each state is derived from the deal status. A step that has not
          happened yet is labelled as pending, not as successful.
        </p>

        <ol className="mt-3 divide-y divide-line/70">
          {steps.map((step, index) => (
            <li
              key={step.key}
              className="flex gap-3 py-4 first:pt-0 last:pb-0"
            >
              <span
                className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 font-mono text-[11px] text-muted"
                aria-hidden="true"
              >
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-medium text-ink">{step.title}</p>
                  <StepBadge tone={step.tone}>{step.state}</StepBadge>
                </div>
                <p className="mt-1 text-[13px] leading-relaxed text-muted">
                  {step.detail}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* References ---------------------------------------------------- */}
      <section aria-labelledby="references-heading" className="space-y-3">
        <div className="space-y-1">
          <h2
            id="references-heading"
            className="text-lg font-semibold tracking-[-0.01em] text-ink"
          >
            Payment references
          </h2>
          <p className="max-w-2xl text-sm leading-relaxed text-muted">
            The deal endpoint returns an allow-listed set of fields. Transaction
            identifiers are not part of that response, so none are displayed
            here.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-panel border border-line bg-surface p-5">
            <h3 className="text-sm font-semibold text-ink">
              Transaction identifiers
            </h3>
            <dl className="mt-3 divide-y divide-line/70">
              <ReferenceRow label="PayPal order ID" value="Not in the deal response" />
              <ReferenceRow label="Authorization ID" value="Not in the deal response" />
              <ReferenceRow label="Capture references" value="Not stored" />
            </dl>
            <p className="mt-4 text-[12px] leading-relaxed text-muted">
              The backend keeps the order and authorization IDs in server memory,
              but <span className="font-mono">GET /api/deals/&lt;id&gt;</span>{" "}
              omits them. Capture IDs are not stored at all.
            </p>
          </div>

          <div className="rounded-panel border border-line bg-surface p-5">
            <h3 className="text-sm font-semibold text-ink">
              Not recorded for this deal
            </h3>
            <ul className="mt-3 space-y-2.5">
              {[
                "Refunds: the backend has no refund endpoint or refund status, so no refund is shown.",
                "Timestamps: the deal record has no created, authorized or captured times.",
                "Fees and taxes: the stored figures are one total split into deposit and balance.",
                "Buyer identity: no buyer name, email or PayPal account is stored on the deal.",
              ].map((entry) => (
                <li key={entry} className="flex gap-2.5">
                  <span
                    className="mt-[7px] size-1.5 shrink-0 rounded-full bg-lavender"
                    aria-hidden="true"
                  />
                  <span className="text-[13px] leading-relaxed text-muted">
                    {entry}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Small pieces                                                        */
/* ------------------------------------------------------------------ */

function Fact({
  label,
  value,
  hint,
  mono = false,
}: {
  label: string;
  value: string | null;
  hint?: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-1 break-words text-sm text-ink",
          mono && "break-all font-mono text-[13px]",
          !value && "text-muted",
        )}
      >
        {value ?? "Not recorded"}
        {hint ? (
          <span className="mt-0.5 block break-words font-sans text-[12px] font-normal leading-relaxed text-muted">
            {hint}
          </span>
        ) : null}
      </dd>
    </div>
  );
}

function Amount({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | null;
  hint: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-line bg-surface-2/40 p-4">
      <dt className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-1 break-all font-mono text-xl font-semibold tabular-nums",
          value ? "text-ink" : "text-sm font-normal text-muted",
        )}
      >
        {value ?? "Not recorded"}
      </dd>
      <dd className="mt-1 text-[12px] leading-relaxed text-muted">{hint}</dd>
    </div>
  );
}

function ReferenceRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5 first:pt-0 last:pb-0">
      <dt className="text-[12px] text-muted">{label}</dt>
      <dd className="text-[12px] font-medium text-muted">{value}</dd>
    </div>
  );
}

function StepBadge({
  tone,
  children,
}: {
  tone: PaymentStepTone;
  children: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium",
        tone === "done" && "bg-success-soft text-success",
        tone === "pending" && "bg-warning-soft text-warning",
        tone === "idle" && "bg-surface-2 text-muted",
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          tone === "done" && "bg-success",
          tone === "pending" && "bg-warning",
          tone === "idle" && "bg-faint",
        )}
        aria-hidden="true"
      />
      {children}
    </span>
  );
}

function WhereToNext() {
  return (
    <nav aria-labelledby="next-heading" className="space-y-3">
      <h2
        id="next-heading"
        className="text-[11px] font-medium uppercase tracking-[0.08em] text-lavender"
      >
        Where to next
      </h2>
      <ul className="grid gap-3 sm:grid-cols-3">
        {NEXT_LINKS.map((link) => {
          const Icon = link.icon;

          return (
            <li key={link.href}>
              <Link
                href={link.href}
                className="group flex h-full items-start gap-3 rounded-panel border border-line bg-surface p-4 transition-colors duration-150 hover:border-line-strong hover:bg-surface-2"
              >
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-lavender-linethin bg-lavender-soft">
                  <Icon className="size-4 text-lavender" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
                    {link.label}
                    <ArrowRight
                      className="size-3.5 text-lavender transition-transform duration-150 group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </span>
                  <span className="mt-0.5 block text-[13px] leading-relaxed text-muted">
                    {link.body}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
