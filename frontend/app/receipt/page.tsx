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
    detail: "Terms are final, but no PayPal order exists yet.",
  },
  awaiting_approval: {
    headline: "Waiting for PayPal approval",
    detail:
      "A PayPal order for the full amount was created and awaits buyer approval.",
  },
  deposit_paid: {
    headline: "Deposit captured, balance pending",
    detail:
      "The full amount is authorized and the deposit captured. The balance follows delivery.",
  },
  complete: {
    headline: "Payment complete",
    detail: "Deposit and balance are fully captured.",
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
    body: "Run a negotiation.",
    icon: Handshake,
  },
  {
    href: "/",
    label: "Overview",
    body: "How the flow fits together.",
    icon: LayoutDashboard,
  },
  {
    href: "/benchmark",
    label: "Benchmark",
    body: "Recorded runs and guards.",
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
      detail: "Deal status not recognised.",
    };
  }

  if (status === "negotiated") {
    return {
      key: "authorization",
      title,
      state: "Not started",
      tone: "idle",
      detail: "No PayPal order yet.",
    };
  }

  if (status === "awaiting_approval") {
    return {
      key: "authorization",
      title,
      state: "Awaiting approval",
      tone: "pending",
      detail: "Order created; not authorized yet.",
    };
  }

  return {
    key: "authorization",
    title,
    state: "Authorized",
    tone: "done",
    detail: "Authorized before the deposit was captured.",
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
      detail: "Deposit is zero; nothing captured up front.",
    };
  }

  if (!status) {
    return {
      key: "deposit",
      title,
      state: "Not available",
      tone: "idle",
      detail: "Deal status not recognised.",
    };
  }

  if (status === "deposit_paid" || status === "complete") {
    return {
      key: "deposit",
      title,
      state: "Captured",
      tone: "done",
      detail: "Captured after the order was approved.",
    };
  }

  if (status === "awaiting_approval") {
    return {
      key: "deposit",
      title,
      state: "Not captured yet",
      tone: "pending",
      detail: "Captured after the buyer approves in PayPal.",
    };
  }

  return {
    key: "deposit",
    title,
    state: "Not captured",
    tone: "idle",
    detail: "Nothing is captured until the order is approved.",
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
      detail: "The deposit covers the full amount.",
    };
  }

  if (!status) {
    return {
      key: "balance",
      title,
      state: "Not available",
      tone: "idle",
      detail: "Deal status not recognised.",
    };
  }

  if (status === "complete") {
    return {
      key: "balance",
      title,
      state: "Captured",
      tone: "done",
      detail: "Captured after delivery was confirmed.",
    };
  }

  if (status === "deposit_paid") {
    return {
      key: "balance",
      title,
      state: "Pending delivery",
      tone: "pending",
      detail: "Held in the authorization until delivery is confirmed.",
    };
  }

  if (status === "awaiting_approval") {
    return {
      key: "balance",
      title,
      state: "Not captured yet",
      tone: "pending",
      detail: "Captured after the deposit and delivery.",
    };
  }

  return {
    key: "balance",
    title,
    state: "Not captured",
    tone: "idle",
    detail: "Nothing is captured until the order is approved and the deposit taken.",
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
        description="Agreed terms and the PayPal payment split for a stored deal. Payment state comes from the deal's own status."
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
      <LoadingState variant="pulse" description="Reading the stored deal…" />
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
        Receipts open as{" "}
        <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[12px] text-lavender">
          /receipt?deal=&lt;id&gt;
        </code>
        . PayPal adds the ID on redirect.
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
            The deal endpoint returned 404. Deals live in server memory, so a
            restart clears them.
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
    "Deposit and balance add up to the agreed total.";
  if (!allAmountsKnown) {
    consistencyNote =
      "Amounts are missing, so the split cannot be checked.";
  } else if (!breakdownAddsUp) {
    consistencyNote =
      "Deposit and balance do not add up to the stored total; figures are shown unchanged.";
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
                  Creates a sandbox PayPal order for the full amount. Approval
                  authorizes payment and captures the deposit.
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
                  Captures the remaining balance. Allowed only while the deal is
                  deposit paid.
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
                Finish the approval in the PayPal window. The approval link is not
                stored, so it cannot be reopened here.
              </p>
            ) : null}

            {knownStatus === "complete" ? (
              <p className="max-w-2xl text-[12px] leading-relaxed text-muted">
                No further payment action is available.
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
            hint="Not stored on the deal."
          />
          <Fact
            label="Deposit terms"
            value={depositPercent ? `${depositPercent} of the total` : null}
            hint="Captured up front; the rest on delivery."
          />
          <Fact
            label="Delivery"
            value={delivery}
            hint="Agreed by the winning seller."
          />
          <Fact
            label="Seller list price"
            value={formatMoney(listPrice)}
            hint="Before negotiation."
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
            From the stored deal; the steps reflect its status field only.
          </p>
        </div>

        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          <Amount
            label="Agreed total"
            value={formatMoney(total)}
            hint="The amount being split."
          />
          <Amount
            label={depositPercent ? `Deposit (${depositPercent})` : "Deposit"}
            value={formatMoney(deposit)}
            hint="Captured up front."
          />
          <Amount
            label="Balance"
            value={formatMoney(balance)}
            hint="Released on delivery."
          />
        </dl>

        <p className="mt-3 text-[12px] leading-relaxed text-muted">
          {consistencyNote}
        </p>

        <h3 className="mt-6 text-sm font-semibold text-ink">
          Settlement steps
        </h3>
        <p className="mt-1 text-[12px] leading-relaxed text-muted">
          Derived from the deal status.
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
            Transaction identifiers are not part of the deal response.
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
              Kept in server memory, but omitted by{" "}
              <span className="font-mono">GET /api/deals/&lt;id&gt;</span>. Capture IDs
              are not stored.
            </p>
          </div>

          <div className="rounded-panel border border-line bg-surface p-5">
            <h3 className="text-sm font-semibold text-ink">
              Not recorded for this deal
            </h3>
            <ul className="mt-3 space-y-2.5">
              {[
                "Refunds: no refund endpoint or status.",
                "Timestamps: no created, authorized or captured times.",
                "Fees and taxes: one total, split into deposit and balance.",
                "Buyer identity: no name, email or account.",
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
