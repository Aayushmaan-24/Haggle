"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import type { SseEvent } from "@/lib/sse";
import { useNegotiation } from "@/lib/useNegotiation";
import { PageHeader } from "@/components/shell/PageHeader";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button, ButtonLink } from "@/components/ui/Button";
import {
  forgetPolicy,
  setSelectedPolicyId,
  useSavedPolicies,
  useSelectedPolicyId,
} from "@/lib/policyStore";
import { cn } from "@/lib/cn";

type OfferEvent = Extract<SseEvent, { type: "offer" }>;
type StatusEvent = Extract<SseEvent, { type: "status" }>;
type OfferWithRound = OfferEvent & { round: number };

/**
 * Everything known about one seller, derived only from the events that actually
 * arrived. No seller is created unless the backend mentioned it.
 */
type SellerSummary = {
  seller: string;
  /** Last explicit `status` event: the seller accepted (`deal`) or walked (`out`). */
  status: "deal" | "out" | null;
  statusNote: string | null;
  statusPrice: number | null;
  /** That seller's own offers, oldest first. */
  sellerOffers: OfferWithRound[];
  /** Round of the most recent event that mentioned this seller. */
  lastRound: number;
  /** Human-readable description of the most recent event for this seller. */
  lastActivity: string;
  /** True once any event for this seller has been seen. */
  hasActivity: boolean;
};

type RoundGroup = {
  round: number;
  offers: OfferWithRound[];
};

/** One event as it arrived, tagged with the round that was current at the time. */
type TimelineEntry = { index: number; round: number; event: SseEvent };

/** A comparison row built from a real result ranking or a real seller offer. */
type ComparisonRow = {
  seller: string;
  price: number;
  depositPercent: number;
  deliveryDays: number;
  /** Only the backend's final ranking carries a score. */
  score: number | null;
  isWinner: boolean;
  offerCount: number | null;
};

/** The result section only renders once the stream is finished or has failed. */
type Outcome = "won" | "no-deal" | "failed" | "interrupted" | "running" | "idle";

const FIELD_CLASS =
  "h-10 w-full rounded-lg border bg-surface-2 px-3 text-sm text-ink transition-colors placeholder:text-muted focus:border-accent sm:h-9";

/**
 * Trading floor: setup on the left, live negotiation arena on the right.
 *
 * All arena content is derived from `state` — seller lanes, offer deltas and
 * rounds are reconstructed from the SSE events themselves, because the backend
 * emits no seller roster and no total round count.
 */
export default function TradingFloorPage() {
  const [state, control] = useNegotiation();
  const savedPolicies = useSavedPolicies();
  const selectedPolicyId = useSelectedPolicyId();
  const selectedPolicy =
    savedPolicies.find((policy) => policy.policy_id === selectedPolicyId) ??
    null;

  const [item, setItem] = useState("a 27-inch monitor");
  const [budget, setBudget] = useState("90");
  const [target, setTarget] = useState("85");
  const [replay, setReplay] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [touched, setTouched] = useState<{
    item?: boolean;
    budget?: boolean;
    target?: boolean;
  }>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [attemptedPolicyId, setAttemptedPolicyId] = useState<string | null>(
    null,
  );

  const parsedBudget = Number(budget);
  const parsedTarget = Number(target);

  const itemError =
    item.trim().length === 0 ? "Enter the item you want to negotiate for." : null;
  const budgetError =
    budget.trim() === ""
      ? "Enter a budget."
      : Number.isFinite(parsedBudget) && parsedBudget > 0
        ? null
        : "Budget must be a number greater than 0.";
  const targetError =
    target.trim() === ""
      ? "Enter a target price."
      : Number.isFinite(parsedTarget) && parsedTarget > 0
        ? null
        : "Target price must be a number greater than 0.";
  const relationError =
    !budgetError && !targetError && parsedTarget > parsedBudget
      ? "Target price cannot exceed your budget."
      : null;

  const showItemError = Boolean(itemError) && (submitAttempted || touched.item);
  const showBudgetError = Boolean(budgetError) && (submitAttempted || touched.budget);
  const showTargetError = Boolean(targetError) && (submitAttempted || touched.target);
  const showRelationError = Boolean(relationError) && (submitAttempted || touched.target);

  const isValid = !itemError && !budgetError && !targetError && !relationError;
  // A failed deal hydration leaves the stream handle open behind an `error`
  // status, so Stop must stay reachable to clear it before starting again.
  const canStop =
    state.connectionStatus === "open" ||
    (state.connectionStatus === "error" && state.result !== null);
  const sessionActive = canStop || state.connectionStatus === "connecting";

  // Replay uses the recorded run and ignores the seller roster, so a policy is
  // only attached to live negotiations. The backend validates the ID on start.
  const policyId = replay ? undefined : selectedPolicy?.policy_id;
  const failedPolicy = attemptedPolicyId
    ? (savedPolicies.find(
        (policy) => policy.policy_id === attemptedPolicyId,
      ) ?? null)
    : null;
  const policyUnavailable =
    Boolean(failedPolicy) &&
    state.connectionStatus === "error" &&
    state.error?.trim().toLowerCase() === "unknown policy";

  const submitStart = async () => {
    setSubmitAttempted(true);
    if (!isValid || submitting || sessionActive) return;

    setSubmitting(true);
    setAttemptedPolicyId(policyId ?? null);
    try {
      await control.startNegotiation({
        item: item.trim(),
        budget: parsedBudget,
        target: parsedTarget,
        replay,
        policyId,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const stop = () => {
    control.stopListening();
  };

  /**
   * Single pass over the stream. Offers carry no round number, so each one is
   * attributed to the most recent `round` event. Seller lanes come from the
   * `offer` and `status` events that named a seller.
   */
  const { rounds, sellers, timeline } = useMemo(() => {
    const roundOrder: number[] = [];
    const offersByRound = new Map<number, OfferWithRound[]>();
    const sellerMap = new Map<string, SellerSummary>();
    const entries: TimelineEntry[] = [];
    let round = 0;

    const ensureSeller = (seller: string): SellerSummary => {
      let summary = sellerMap.get(seller);
      if (!summary) {
        summary = {
          seller,
          status: null,
          statusNote: null,
          statusPrice: null,
          sellerOffers: [],
          lastRound: 0,
          lastActivity: "",
          hasActivity: false,
        };
        sellerMap.set(seller, summary);
      }
      return summary;
    };

    for (const event of state.events) {
      switch (event.type) {
        case "round": {
          round = event.n;
          if (!roundOrder.includes(round)) roundOrder.push(round);
          break;
        }
        case "offer": {
          const offer: OfferWithRound = { ...event, round };
          const list = offersByRound.get(round) ?? [];
          list.push(offer);
          offersByRound.set(round, list);

          const summary = ensureSeller(event.seller);
          if (event.who === "seller") summary.sellerOffers.push(offer);
          summary.lastRound = round;
          summary.lastActivity = `${
            event.who === "seller" ? "Seller offer" : "Buyer counter"
          } $${event.price.toFixed(2)} — ${event.message}`;
          summary.hasActivity = true;
          break;
        }
        case "status": {
          const summary = ensureSeller(event.seller);
          summary.status = event.status;
          summary.statusNote = event.note;
          summary.statusPrice = event.price;
          summary.lastRound = round;
          summary.lastActivity = `${event.note}${
            event.price !== null ? ` ($${event.price.toFixed(2)})` : ""
          }`;
          summary.hasActivity = true;
          break;
        }
        default:
          break;
      }

      entries.push({ index: entries.length, round, event });
    }

    // A seller can also appear only in the final ranking, so include those too.
    if (state.result) {
      for (const entry of state.result.ranking) ensureSeller(entry.seller);
      if (state.result.winner) ensureSeller(state.result.winner.seller);
    }

    const groups: RoundGroup[] = [...roundOrder]
      .sort((a, b) => a - b)
      .map((value) => ({ round: value, offers: offersByRound.get(value) ?? [] }));

    const sellerList = [...sellerMap.values()].sort((a, b) =>
      a.seller.localeCompare(b.seller),
    );

    return { rounds: groups, sellers: sellerList, timeline: entries };
  }, [state.events, state.result]);

  /**
   * Offer comparison. Before a result exists this is the latest seller offer per
   * seller; once the backend ranks sellers it uses that ranking verbatim.
   */
  const comparison: ComparisonRow[] = useMemo(() => {
    if (state.result) {
      return state.result.ranking.map((entry) => ({
        seller: entry.seller,
        price: entry.price,
        depositPercent: entry.deposit_percent,
        deliveryDays: entry.delivery_days,
        score: entry.score,
        isWinner: state.result?.winner?.seller === entry.seller,
        offerCount: null,
      }));
    }

    return sellers.flatMap((summary) => {
      const latest = summary.sellerOffers[summary.sellerOffers.length - 1];
      if (!latest) return [];
      return [
        {
          seller: summary.seller,
          price: latest.price,
          depositPercent: latest.deposit_percent,
          deliveryDays: latest.delivery_days,
          score: null,
          isWinner: false,
          offerCount: summary.sellerOffers.length,
        },
      ];
    });
  }, [state.result, sellers]);

  const hasActivity =
    state.connectionStatus !== "idle" ||
    state.events.length > 0 ||
    state.offers.length > 0 ||
    state.result !== null ||
    state.deal !== null;

  const currentRound = state.currentRound;

  /** The seller named by the latest event, while the stream is still running. */
  const lastSellerEvent = [...state.events]
    .reverse()
    .find((event) => event.type === "offer" || event.type === "status") as
    | OfferEvent
    | StatusEvent
    | undefined;
  const respondingSeller =
    state.connectionStatus === "open" && !state.result && lastSellerEvent
      ? lastSellerEvent.seller
      : null;

  const isRoundCompleted = (round: number) =>
    Boolean(state.result) ||
    state.connectionStatus === "closed" ||
    state.connectionStatus === "completed" ||
    round < currentRound;

  const outcome: Outcome = state.result
    ? state.result.winner
      ? "won"
      : "no-deal"
    : state.connectionStatus === "error" || state.error
      ? "failed"
      : state.connectionStatus === "closed"
        ? "interrupted"
        : state.connectionStatus === "open" || state.connectionStatus === "connecting"
          ? "running"
          : "idle";

  const showResults =
    outcome === "won" ||
    outcome === "no-deal" ||
    outcome === "failed" ||
    outcome === "interrupted";

  /** Difference baseline: the winner's price, else the cheapest compared offer. */
  const comparisonBasePrice =
    state.result?.winner?.price ??
    (comparison.length > 0
      ? Math.min(...comparison.map((row) => row.price))
      : null);

  const dealUnavailable =
    Boolean(state.result?.deal_id) && state.deal === null && Boolean(state.error);

  /** One sentence describing the current phase, announced politely to screen readers. */
  const announcement = state.result
    ? state.result.winner
      ? `Negotiation complete. Deal reached with ${state.result.winner.seller} at $${state.result.winner.price.toFixed(2)}.`
      : "Negotiation complete with no winning seller."
    : state.connectionStatus === "error"
      ? `Negotiation failed. ${state.error ?? ""}`.trim()
      : state.connectionStatus === "closed"
        ? "Listening stopped before a result arrived."
        : state.connectionStatus === "connecting"
          ? "Connecting to the negotiation stream."
          : state.connectionStatus === "open"
            ? `Round ${currentRound}. ${sellers.length} seller${
                sellers.length === 1 ? "" : "s"
              } seen.`
            : "No negotiation running.";

  return (
    <>
      <PageHeader
        eyebrow="Negotiation"
        title="Trading Floor"
        description="Give the buyer agent a mandate, then watch it negotiate price, deposit and delivery with every seller in parallel — using real competing offers as leverage."
        actions={
          <div className="flex shrink-0 items-center gap-2">
            {canStop ? (
              <Button variant="secondary" onClick={stop}>
                Stop listening
              </Button>
            ) : null}
            <ButtonLink href="/" variant="ghost" size="sm">
              Overview
            </ButtonLink>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
        {/* ---------------------------------------------------------------- */}
        {/* Negotiation setup                                                */}
        {/* ---------------------------------------------------------------- */}
        <div className="space-y-6">
          <Panel>
            <PanelHeader
              eyebrow="Setup"
              title="Negotiation setup"
              description="The buyer agent negotiates within these limits. Nothing is sent until you start."
            />

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="item" className="block text-sm font-medium text-ink">
                  Item
                </label>
                <input
                  id="item"
                  value={item}
                  onChange={(event) => setItem(event.target.value)}
                  onBlur={() => setTouched((current) => ({ ...current, item: true }))}
                  placeholder="e.g. a 27-inch monitor"
                  aria-invalid={showItemError || undefined}
                  aria-describedby={showItemError ? "item-error" : undefined}
                  className={cn(FIELD_CLASS, showItemError ? "border-danger" : "border-line")}
                />
                {showItemError ? (
                  <p id="item-error" className="text-xs text-danger">
                    {itemError}
                  </p>
                ) : (
                  <p className="text-xs text-muted">
                    Describe the product the agent should buy.
                  </p>
                )}
              </div>                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="budget" className="block text-xs text-muted">
                    Budget ($)
                  </label>
                  <input
                    id="budget"
                    type="number"
                    min={1}
                    step="0.01"
                    inputMode="decimal"
                    value={budget}
                    onChange={(event) => setBudget(event.target.value)}
                    onBlur={() => setTouched((current) => ({ ...current, budget: true }))}
                    aria-invalid={showBudgetError || undefined}
                    aria-describedby={showBudgetError ? "budget-error" : undefined}
                    className={cn(FIELD_CLASS, showBudgetError ? "border-danger" : "border-line")}
                  />
                  {showBudgetError ? (
                    <p id="budget-error" className="text-xs text-danger">
                      {budgetError}
                    </p>
                  ) : null}
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="target" className="block text-xs text-muted">
                    Target price ($)
                  </label>
                  <input
                    id="target"
                    type="number"
                    min={1}
                    step="0.01"
                    inputMode="decimal"
                    value={target}
                    onChange={(event) => setTarget(event.target.value)}
                    onBlur={() => setTouched((current) => ({ ...current, target: true }))}
                    aria-invalid={showTargetError || showRelationError || undefined}
                    aria-describedby={
                      showTargetError
                        ? "target-error"
                        : showRelationError
                          ? "target-relation-error"
                          : undefined
                    }
                    className={cn(
                      FIELD_CLASS,
                      showTargetError || showRelationError ? "border-danger" : "border-line",
                    )}
                  />
                  {showTargetError ? (
                    <p id="target-error" className="text-xs text-danger">
                      {targetError}
                    </p>
                  ) : null}
                  {!showTargetError && showRelationError ? (
                    <p id="target-relation-error" className="text-xs text-danger">
                      {relationError}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="policy" className="block text-sm font-medium text-ink">
                  Seller policy
                </label>
                <select
                  id="policy"
                  value={selectedPolicy?.policy_id ?? ""}
                  onChange={(event) => setSelectedPolicyId(event.target.value)}
                  disabled={replay || savedPolicies.length === 0 || sessionActive}
                  aria-describedby="policy-help"
                  className={cn(FIELD_CLASS, "disabled:opacity-50")}
                >
                  <option value="">No policy — use the default sellers</option>
                  {savedPolicies.map((policy) => (
                    <option key={policy.policy_id} value={policy.policy_id}>
                      {policy.name} — ${policy.list_price.toFixed(2)} list
                    </option>
                  ))}
                </select>
                <p id="policy-help" className="text-xs leading-relaxed text-muted">
                  {replay ? (
                    "Replay reuses a recorded run, so a compiled policy is not used."
                  ) : savedPolicies.length === 0 ? (
                    <>
                      No compiled policies are saved in this browser.{" "}
                      <Link
                        href="/policy"
                        className="text-lavender underline-offset-2 hover:underline"
                      >
                        Compile a seller policy
                      </Link>{" "}
                      to add one.
                    </>
                  ) : selectedPolicy ? (
                    `List $${selectedPolicy.list_price.toFixed(2)} · floor $${selectedPolicy.floor.toFixed(2)} · ${selectedPolicy.deposit_percent}% deposit · ${selectedPolicy.delivery_days} ${selectedPolicy.delivery_days === 1 ? "day" : "days"}. The backend checks this ID when the negotiation starts.`
                  ) : (
                    "No policy selected, so the negotiation uses the three default sellers."
                  )}
                </p>
                {selectedPolicy && !replay ? (
                  <p className="break-all font-mono text-[11px] text-faint">
                    policy_id {selectedPolicy.policy_id}
                  </p>
                ) : null}
                {policyUnavailable && failedPolicy ? (
                  <div
                    role="alert"
                    className="rounded-lg border border-danger/40 bg-danger-soft px-3 py-2.5"
                  >
                    <p className="text-xs leading-relaxed text-danger">
                      The backend no longer has “{failedPolicy.name}” in memory —
                      a server restart clears compiled policies. Remove it here,
                      or choose another policy and start again.
                    </p>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="mt-2"
                      onClick={() => forgetPolicy(failedPolicy.policy_id)}
                    >
                      Remove saved policy
                    </Button>
                  </div>
                ) : null}
              </div>

              <div className="space-y-2 rounded-lg border border-line bg-surface-2/40 p-3">
                <div className="flex items-start gap-3">
                  <input
                    id="replay"
                    type="checkbox"
                    checked={replay}
                    onChange={(event) => setReplay(event.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-line bg-surface-2 text-accent focus:ring-accent-ring"
                  />
                  <div className="space-y-0.5">
                    <label htmlFor="replay" className="block text-sm font-medium text-ink">
                      Replay mode
                    </label>
                    <p className="text-xs leading-relaxed text-muted">
                      Reuse the recorded run from the backend. No live models, no rate
                      limits.
                    </p>
                  </div>
                </div>
              </div>

              {submitAttempted && !isValid ? (
                <p
                  role="alert"
                  className="rounded-lg border border-danger/40 bg-danger-soft px-3 py-2 text-xs text-danger"
                >
                  Fix the highlighted fields before starting the negotiation.
                </p>
              ) : null}

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  variant="primary"
                  onClick={submitStart}
                  disabled={submitting || sessionActive}
                  className="flex-1"
                >
                  {submitting ? "Starting…" : "Start negotiation"}
                </Button>
                {canStop ? (
                  <Button variant="secondary" onClick={stop} className="flex-1">
                    Stop listening
                  </Button>
                ) : null}
              </div>

              {state.result && canStop ? (
                <p className="text-xs text-muted">
                  Stop listening to close this session before starting a new one.
                </p>
              ) : null}

              <p className="text-xs leading-relaxed text-muted">
                Stopping only closes this page&apos;s stream — the backend keeps
                negotiating.
              </p>
            </div>
          </Panel>

          <Panel>
            <PanelHeader eyebrow="Session" title="Connection" />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-sm text-muted">
                <span
                  className={cn(
                    "size-2 rounded-full",
                    state.connectionStatus === "open" && "bg-success",
                    state.connectionStatus === "completed" && "bg-success",
                    state.connectionStatus === "connecting" && "bg-warning",
                    state.connectionStatus === "closed" && "bg-faint",
                    state.connectionStatus === "error" && "bg-danger",
                    state.connectionStatus === "idle" && "bg-surface-3",
                  )}
                  aria-hidden="true"
                />
                {state.connectionStatus === "open"
                  ? "Listening"
                  : state.connectionStatus === "completed"
                    ? "Completed"
                    : state.connectionStatus === "connecting"
                      ? "Connecting…"
                      : state.connectionStatus === "closed"
                        ? "Stopped listening"
                        : state.connectionStatus === "error"
                          ? "Error"
                          : "Idle"}
              </span>
              <span className="text-sm text-muted">
                Round <span className="font-mono text-ink">{state.currentRound}</span>
              </span>
            </div>
          </Panel>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Live negotiation arena                                           */}
        {/* ---------------------------------------------------------------- */}
        <div className="space-y-6">
          <p className="sr-only" role="status">
            {announcement}
          </p>
          <h2 className="sr-only">Live negotiation arena</h2>

          {!hasActivity ? (
            <Panel>
              <PanelHeader
                eyebrow="Arena"
                title="Live negotiation arena"
                description="Seller lanes, offers and rounds will appear here as soon as the stream opens."
              />
              <EmptyState
                title="No negotiation running"
                description="Set your mandate and press Start negotiation to open the stream."
              />
            </Panel>
          ) : state.connectionStatus === "connecting" && state.events.length === 0 ? (
            <Panel>
              <PanelHeader
                eyebrow="Arena"
                title="Opening the stream"
                description="Waiting for the first events from the buyer agent."
              />
              <LoadingState
                variant="pulse"
                description="Streaming negotiation events from the backend…"
              />
            </Panel>
          ) : (
            <>
              {/* Round progression ---------------------------------------- */}
              <Panel>
                <PanelHeader
                  eyebrow="Arena"
                  title="Live negotiation"
                  description={
                    state.result
                      ? "The stream has delivered a final result."
                      : state.connectionStatus === "closed"
                        ? "This page stopped listening; rounds below are the last known state."
                        : "Rounds advance as the backend emits them — there is no fixed round count."
                  }
                  action={
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-baseline gap-1.5">
                        <span className="text-[11px] uppercase tracking-[0.08em] text-muted">
                          Round
                        </span>
                        <span className="font-mono text-lg leading-none text-ink">
                          {currentRound}
                        </span>
                      </span>
                      {state.loading ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-accent">
                          <span className="size-1.5 animate-pulse rounded-full bg-accent" />
                          Negotiating
                        </span>
                      ) : state.result ? (
                        <span className="text-xs text-muted">Completed</span>
                      ) : state.connectionStatus === "closed" ? (
                        <span className="text-xs text-muted">Stream closed</span>
                      ) : null}
                    </span>
                  }
                />

                <div className="space-y-4">
                  {rounds.length === 0 ? (
                    <p className="text-xs text-muted">Waiting for the first round event…</p>
                  ) : (
                    <>
                      {/* Round strip */}
                      <div className="flex flex-wrap items-center gap-2">
                        {rounds.map((group) => {
                          const completed = isRoundCompleted(group.round);
                          const isCurrent = group.round === currentRound;
                          return (
                            <span
                              key={group.round}
                              className={cn(
                                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors",
                                isCurrent && !completed
                                  ? "border-accent bg-accent-soft text-accent"
                                  : completed
                                    ? "border-line bg-surface-2 text-muted"
                                    : "border-line text-ink",
                              )}
                            >
                              <span
                                className={cn(
                                  "size-1.5 rounded-full",
                                  isCurrent && !completed
                                    ? "bg-accent"
                                    : completed
                                      ? "bg-success"
                                      : "bg-faint",
                                )}
                                aria-hidden="true"
                              />
                              Round {group.round}
                              <span className="font-mono text-[11px] text-muted">
                                {group.offers.length}
                                <span className="sr-only"> offers</span>
                              </span>
                            </span>
                          );
                        })}
                        <span className="text-xs text-muted">
                          {state.result
                            ? "Final round reached"
                            : `Round ${currentRound} in progress`}
                        </span>
                      </div>

                      {/* Per-round seller responses */}
                      <ol className="space-y-2">
                        {rounds.map((group) => {
                          const completed = isRoundCompleted(group.round);
                          const isCurrent = group.round === currentRound;
                          return (
                            <li
                              key={group.round}
                              className={cn(
                                "rounded-lg border p-3",
                                isCurrent && !completed
                                  ? "border-accent/60 bg-accent-soft/40"
                                  : "border-line bg-surface-2/30",
                              )}
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="flex items-center gap-2 text-xs">
                                  <span className="font-mono text-muted">
                                    R{group.round}
                                  </span>
                                  <span
                                    className={cn(
                                      "font-medium",
                                      isCurrent && !completed
                                        ? "text-accent"
                                        : "text-muted",
                                    )}
                                  >
                                    {isCurrent && !completed ? "Active" : "Completed"}
                                  </span>
                                </span>
                                <span className="text-[11px] text-muted">
                                  {group.offers.length === 0
                                    ? "No offers recorded"
                                    : `${group.offers.length} offer${
                                        group.offers.length === 1 ? "" : "s"
                                      }`}
                                </span>
                              </div>
                              {group.offers.length > 0 ? (
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  {group.offers.map((offer, index) => (
                                    <span
                                      key={`${index}-${offer.seller}-${offer.who}`}
                                      className={cn(
                                        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px]",
                                        offer.who === "seller"
                                          ? "border-line bg-surface-2 text-ink"
                                          : "border-info/30 bg-info-soft text-info",
                                      )}
                                    >
                                      <span className="break-all font-medium">
                                        {offer.who === "seller" ? offer.seller : "Buyer"}
                                      </span>
                                      <span className="font-mono">
                                        ${offer.price.toFixed(2)}
                                      </span>
                                    </span>
                                  ))}
                                </div>
                              ) : null}
                            </li>
                          );
                        })}
                      </ol>
                    </>
                  )}
                </div>
              </Panel>

              {/* Seller lanes --------------------------------------------- */}
              <section aria-labelledby="seller-lanes-heading" className="space-y-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <h2
                      id="seller-lanes-heading"
                      className="text-base font-semibold text-ink"
                    >
                      Seller lanes
                    </h2>
                    <p className="text-xs text-muted">
                      Built from the sellers named in the stream — no roster is assumed.
                    </p>
                  </div>
                  <span className="text-xs text-muted">
                    {sellers.length === 0
                      ? "No sellers seen yet"
                      : `${sellers.length} seller${sellers.length === 1 ? "" : "s"} seen`}
                  </span>
                </div>

                {sellers.length === 0 ? (
                  <div className="rounded-panel border border-dashed border-line px-4 py-8 text-center">
                    <p className="text-sm text-muted">
                      Waiting for the first seller offer or status event…
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-4 xl:grid-cols-2">
                    {sellers.map((summary) => (
                      <SellerCard
                        key={summary.seller}
                        summary={summary}
                        responding={summary.seller === respondingSeller}
                        isWinner={state.result?.winner?.seller === summary.seller}
                        hasResult={Boolean(state.result)}
                      />
                    ))}
                  </div>
                )}
              </section>

              <div className="grid gap-6 xl:grid-cols-2">
                <Panel>
                  <PanelHeader
                    eyebrow="Timeline"
                    title="Negotiation timeline"
                    description="Chronological stream order. The backend sends no timestamps, so events are ordered by arrival."
                  />
                  <ol className="max-h-[320px] space-y-0 overflow-y-auto pr-1 sm:max-h-[420px]">
                    {timeline.length === 0 ? (
                      <li className="text-xs text-muted">Waiting for events…</li>
                    ) : (
                      timeline.map((entry) => (
                        <TimelineRow
                          key={`${entry.index}-${JSON.stringify(entry.event)}`}
                          entry={entry}
                          last={entry.index === timeline.length - 1}
                        />
                      ))
                    )}
                  </ol>
                </Panel>

                <Panel>
                  <PanelHeader
                    eyebrow="Offers"
                    title="Received offers"
                    description="Every buyer and seller offer in arrival order."
                  />
                  <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
                    {state.offers.map((offer, index) => (
                      <div
                        key={`${index}-${offer.seller}-${offer.who}`}
                        className="flex flex-wrap items-start gap-3 rounded-lg border border-line bg-surface-2/40 p-3"
                      >
                        <span className="font-mono text-xs text-muted">{index + 1}</span>
                        <span className="break-all text-xs text-muted">{offer.seller}</span>
                        <span
                          className={cn(
                            "text-xs font-medium",
                            offer.who === "seller" ? "text-accent" : "text-info",
                          )}
                        >
                          {offer.who === "seller" ? "Seller" : "Buyer"}
                        </span>
                        <span className="font-mono text-sm text-ink">
                          ${offer.price.toFixed(2)} · {offer.deposit_percent}% dep ·{" "}
                          {offer.delivery_days}d
                        </span>
                        <span className="w-full break-words text-xs text-muted">
                          {offer.message}
                        </span>
                      </div>
                    ))}
                    {state.offers.length === 0 ? (
                      <p className="text-xs text-muted">No offers yet</p>
                    ) : null}
                  </div>
                </Panel>
              </div>

              {showResults ? (
                <section aria-labelledby="results-heading" className="space-y-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 id="results-heading" className="text-base font-semibold text-ink">
                      Results
                    </h2>
                    <span className="text-xs text-muted">
                      {outcome === "won"
                        ? "Deal reached"
                        : outcome === "no-deal"
                          ? "Completed without a deal"
                          : outcome === "failed"
                            ? "Stream error"
                            : "Interrupted"}
                    </span>
                  </div>

                  {/* Outcome ------------------------------------------------ */}
                  {outcome === "won" && state.result?.winner ? (
                    <Panel>
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-lavender">
                            Outcome
                          </p>
                          <h3 className="mt-1 break-words text-xl font-semibold tracking-[-0.01em] text-ink">
                            Deal reached with {state.result.winner.seller}
                          </h3>
                          <p className="mt-1 text-sm leading-relaxed text-muted">
                            The buyer agent accepted this seller&apos;s offer.
                          </p>
                        </div>
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-success/40 bg-success-soft px-3 py-1 text-[12px] font-medium text-success">
                          <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
                          Completed
                        </span>
                      </div>

                      <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <Stat
                          label="Winning price"
                          value={`$${state.result.winner.price.toFixed(2)}`}
                          mono
                        />
                        <Stat
                          label="Deposit"
                          value={`${state.result.winner.deposit_percent}%`}
                        />
                        <Stat
                          label="Delivery"
                          value={`${state.result.winner.delivery_days} days`}
                        />
                        {state.result.list_price !== null ? (
                          <Stat
                            label={
                              state.result.winner.price <= state.result.list_price
                                ? "Below list price"
                                : "Above list price"
                            }
                            value={`$${Math.abs(
                              state.result.list_price - state.result.winner.price,
                            ).toFixed(2)}`}
                            mono
                          />
                        ) : (
                          <Stat label="Score" value={state.result.winner.score.toFixed(2)} mono />
                        )}
                      </dl>
                    </Panel>
                  ) : outcome === "no-deal" && state.result ? (
                    <Panel>
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-lavender">
                            Outcome
                          </p>
                          <h3 className="mt-1 text-xl font-semibold tracking-[-0.01em] text-ink">
                            No deal reached
                          </h3>
                          <p className="mt-1 text-sm leading-relaxed text-muted">
                            {state.result.ranking.length > 0
                              ? `The final ranking lists ${state.result.ranking.length} seller${
                                  state.result.ranking.length === 1 ? "" : "s"
                                }, but the backend returned no winner.`
                              : "The backend returned a result with an empty ranking and no winner."}
                          </p>
                        </div>
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/40 bg-warning-soft px-3 py-1 text-[12px] font-medium text-warning">
                          <span className="size-1.5 rounded-full bg-warning" aria-hidden="true" />
                          Completed · no deal
                        </span>
                      </div>
                      {state.result.list_price !== null ? (
                        <p className="mt-4 border-t border-line pt-4 text-sm text-muted">
                          List price at result time:{" "}
                          <span className="font-mono text-ink">
                            ${state.result.list_price.toFixed(2)}
                          </span>
                        </p>
                      ) : null}
                    </Panel>
                  ) : outcome === "failed" ? (
                    <Panel>
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-lavender">
                            Outcome
                          </p>
                          <h3 className="mt-1 text-xl font-semibold tracking-[-0.01em] text-ink">
                            Negotiation failed
                          </h3>
                          <p className="mt-1 text-sm leading-relaxed text-muted">
                            {state.error ??
                              "The stream reported an error before a result arrived."}
                          </p>
                        </div>
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-danger/40 bg-danger-soft px-3 py-1 text-[12px] font-medium text-danger">
                          <span className="size-1.5 rounded-full bg-danger" aria-hidden="true" />
                          Error
                        </span>
                      </div>
                      <p className="mt-4 border-t border-line pt-4 text-xs text-muted">
                        Error and notice events also appear in the timeline. Adjust the
                        mandate and start again when the backend is reachable.
                      </p>
                    </Panel>
                  ) : (
                    <Panel>
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-lavender">
                            Outcome
                          </p>
                          <h3 className="mt-1 text-xl font-semibold tracking-[-0.01em] text-ink">
                            Negotiation interrupted
                          </h3>
                          <p className="mt-1 text-sm leading-relaxed text-muted">
                            You stopped listening before the stream delivered a result. The
                            backend negotiation may still be running.
                          </p>
                        </div>
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-[12px] font-medium text-muted">
                          <span className="size-1.5 rounded-full bg-faint" aria-hidden="true" />
                          Stopped
                        </span>
                      </div>
                    </Panel>
                  )}

                  {/* Offer comparison -------------------------------------- */}
                  {comparison.length > 0 ? (
                    <Panel>
                      <PanelHeader
                        eyebrow="Comparison"
                        title="Offer comparison"
                        description={
                          state.result
                            ? "Final offers in the backend's own ranking order."
                            : "Latest seller offer from each lane. The backend has not produced a final ranking yet."
                        }
                      />
                      <ul className="divide-y divide-line">
                        {comparison.map((row) => {
                          const difference =
                            comparisonBasePrice !== null &&
                            row.price !== comparisonBasePrice
                              ? row.price - comparisonBasePrice
                              : null;
                          const differencePercent =
                            difference !== null && comparisonBasePrice
                              ? (difference / comparisonBasePrice) * 100
                              : null;

                          return (
                            <li
                              key={row.seller}
                              className={cn(
                                "py-3 first:pt-0 last:pb-0",
                                row.isWinner && "rounded-lg bg-success-soft/40 px-2",
                              )}
                            >
                              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                                <div className="flex min-w-0 flex-wrap items-center gap-2">
                                  <span
                                    className={cn(
                                      "size-1.5 shrink-0 rounded-full",
                                      row.isWinner ? "bg-success" : "bg-surface-3",
                                    )}
                                    aria-hidden="true"
                                  />
                                  <span
                                    className={cn(
                                      "break-all font-medium",
                                      row.isWinner ? "text-success" : "text-ink",
                                    )}
                                  >
                                    {row.seller}
                                  </span>
                                  {row.isWinner ? (
                                    <span className="rounded-full border border-success/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.06em] text-success">
                                      Winner
                                    </span>
                                  ) : null}
                                </div>
                                <span className="font-mono text-base text-ink">
                                  ${row.price.toFixed(2)}
                                </span>
                              </div>
                              <dl className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
                                <div className="flex gap-1.5">
                                  <dt className="text-muted">Deposit</dt>
                                  <dd className="text-muted">{row.depositPercent}%</dd>
                                </div>
                                <div className="flex gap-1.5">
                                  <dt className="text-muted">Delivery</dt>
                                  <dd className="text-muted">{row.deliveryDays} days</dd>
                                </div>
                                <div className="flex gap-1.5">
                                  <dt className="text-muted">
                                    {row.score !== null ? "Score" : "Offers"}
                                  </dt>
                                  <dd className="font-mono text-muted">
                                    {row.score !== null
                                      ? row.score.toFixed(2)
                                      : row.offerCount !== null
                                        ? row.offerCount
                                        : "—"}
                                  </dd>
                                </div>
                                <div className="flex gap-1.5">
                                  <dt className="text-muted">Difference</dt>
                                  <dd>
                                    {difference === null ? (
                                      <span className="text-muted">—</span>
                                    ) : (
                                      <span
                                        className={cn(
                                          "font-mono",
                                          difference < 0 ? "text-success" : "text-danger",
                                        )}
                                      >
                                        {difference > 0 ? "+" : "-"}$
                                        {Math.abs(difference).toFixed(2)}
                                        {differencePercent !== null
                                          ? ` (${Math.abs(differencePercent).toFixed(1)}%)`
                                          : ""}
                                      </span>
                                    )}
                                  </dd>
                                </div>
                              </dl>
                            </li>
                          );
                        })}
                      </ul>
                      <p className="mt-3 text-[11px] text-muted">
                        Difference is measured against{" "}
                        {state.result?.winner
                          ? "the winning offer"
                          : "the lowest current offer"}
                        . Values come only from the stream and the final result.
                      </p>
                    </Panel>
                  ) : (
                    <div className="rounded-panel border border-dashed border-line px-4 py-6 text-center">
                      <p className="text-sm text-muted">
                        No seller offers were recorded in this session, so there is
                        nothing to compare.
                      </p>
                    </div>
                  )}

                  {/* Deal summary ------------------------------------------ */}
                  {state.deal ? (
                    <Panel>
                      <PanelHeader
                        eyebrow="Deal"
                        title="Deal summary"
                        description="Hydrated from GET /api/deals/{id}."
                        action={
                          <span className="break-all font-mono text-xs text-lavender">
                            {state.deal.deal_id}
                          </span>
                        }
                      />
                      <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
                        <DealRow label="Deal ID" value={state.deal.deal_id} mono />
                        <DealRow label="Seller" value={state.deal.seller} />
                        <DealRow label="Item" value={state.deal.item} />
                        <DealRow
                          label="Final price"
                          value={`$${state.deal.price.toFixed(2)}`}
                          mono
                        />
                        <DealRow
                          label="Deposit"
                          value={`${state.deal.deposit_percent}%`}
                        />
                        <DealRow
                          label="Delivery"
                          value={`${state.deal.delivery_days} days`}
                        />
                        <DealRow
                          label="List price"
                          value={`$${state.deal.list_price.toFixed(2)}`}
                          mono
                        />
                        <DealRow
                          label="Total"
                          value={`$${state.deal.total.toFixed(2)}`}
                          mono
                        />
                        <DealRow
                          label="Deposit amount"
                          value={`$${state.deal.deposit.toFixed(2)}`}
                          mono
                        />
                        <DealRow
                          label="Balance"
                          value={`$${state.deal.balance.toFixed(2)}`}
                          mono
                        />
                        <DealRow
                          label="Status"
                          value={<StatusBadge variant={state.deal.status} />}
                        />
                      </dl>
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                        <span className="break-all font-mono text-xs text-muted">
                          GET /api/deals/{state.deal.deal_id}
                        </span>
                        <ButtonLink
                          href={`/receipt?deal=${state.deal.deal_id}`}
                          variant="secondary"
                          size="sm"
                        >
                          Open receipt
                        </ButtonLink>
                      </div>
                    </Panel>
                  ) : state.result?.deal_id ? (
                    <Panel>
                      <PanelHeader
                        eyebrow="Deal"
                        title="Deal summary"
                        description={
                          dealUnavailable
                            ? "The hydrated deal could not be loaded."
                            : "Fetching the deal from the backend…"
                        }
                        action={
                          <span className="break-all font-mono text-xs text-lavender">
                            {state.result.deal_id}
                          </span>
                        }
                      />
                      {dealUnavailable ? (
                        <p className="break-words text-sm leading-relaxed text-danger">
                          The result references deal{" "}
                          <span className="font-mono">{state.result.deal_id}</span>, but{" "}
                          <span className="font-mono">GET /api/deals/{state.result.deal_id}</span>{" "}
                          failed: {state.error}. The outcome above is still what the stream
                          reported.
                        </p>
                      ) : (
                        <LoadingState
                          variant="pulse"
                          description="Hydrating deal details…"
                        />
                      )}
                      <div className="mt-4 border-t border-line pt-4">
                        <ButtonLink
                          href={`/receipt?deal=${state.result.deal_id}`}
                          variant="secondary"
                          size="sm"
                        >
                          Open receipt
                        </ButtonLink>
                      </div>
                    </Panel>
                  ) : outcome === "won" ? (
                    <Panel>
                      <PanelHeader
                        eyebrow="Deal"
                        title="Deal summary"
                        description="No deal reference was included in the final result."
                      />
                      <p className="text-sm leading-relaxed text-muted">
                        The stream reported a winner but no{" "}
                        <span className="font-mono">deal_id</span>, so there is no hydrated
                        deal to show. The winning offer above is the only confirmed detail.
                      </p>
                    </Panel>
                  ) : null}
                </section>
              ) : null}
            </>
          )}
        </div>
      </div>
    </>
  );
}

/**
 * One seller's lane. Shows only what the stream reported: the latest seller
 * offer, the change from that seller's previous offer, the latest event it sent
 * and the rounds it has offered in.
 */
function SellerCard({
  summary,
  responding,
  isWinner,
  hasResult,
}: {
  summary: SellerSummary;
  responding: boolean;
  isWinner: boolean;
  hasResult: boolean;
}) {
  const { sellerOffers } = summary;
  const latestOffer = sellerOffers.length > 0 ? sellerOffers[sellerOffers.length - 1] : null;
  const previousOffer =
    sellerOffers.length > 1 ? sellerOffers[sellerOffers.length - 2] : null;

  const delta = latestOffer && previousOffer ? latestOffer.price - previousOffer.price : null;
  const deltaPercent =
    delta !== null && previousOffer && previousOffer.price !== 0
      ? (delta / previousOffer.price) * 100
      : null;

  const currentPrice = latestOffer?.price ?? summary.statusPrice;
  const roundsOffered = [...new Set(sellerOffers.map((offer) => offer.round))];

  return (
    <Panel
      className={cn(
        "transition-shadow",
        responding ? "ring-1 ring-accent/40" : null,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-lavender">
            Seller
          </p>
          <h3 className="break-all text-base font-semibold text-ink">
            {summary.seller}
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {responding ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/60 bg-accent-soft px-2.5 py-1 text-[11px] font-medium text-accent">
              <span className="size-1.5 animate-pulse rounded-full bg-accent" />
              Responding
            </span>
          ) : null}
          {summary.status === "deal" ? (
            <StatusBadge variant="deal" />
          ) : summary.status === "out" ? (
            <StatusBadge variant="out" />
          ) : isWinner ? (
            <StatusBadge variant="deal" />
          ) : hasResult ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[12px] font-medium text-muted">
              <span className="size-1.5 rounded-full bg-surface-3" aria-hidden="true" />
              Not selected
            </span>
          ) : (
            <StatusBadge variant="negotiating" />
          )}
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-line bg-surface-2/40 p-3">
        <p className="text-xs text-muted">
          {latestOffer ? "Current offer" : summary.statusPrice !== null ? "Reported price" : "Current offer"}
        </p>
        {currentPrice !== null ? (
          <p className="mt-0.5 font-mono text-2xl leading-tight text-ink">
            ${currentPrice.toFixed(2)}
          </p>
        ) : (
          <p className="mt-0.5 text-sm text-muted">No price reported yet</p>
        )}
        {latestOffer ? (
          <p className="mt-1 text-xs text-muted">
            {latestOffer.deposit_percent}% deposit · {latestOffer.delivery_days}d delivery
          </p>
        ) : null}

        {delta !== null ? (
          <p
            className={cn(
              "mt-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium",
              delta < 0 ? "bg-success-soft text-success" : "bg-danger-soft text-danger",
            )}
          >
            <span aria-hidden="true">{delta < 0 ? "▼" : "▲"}</span>
            {delta < 0 ? "Lowered" : "Raised"} ${Math.abs(delta).toFixed(2)}
            {deltaPercent !== null
              ? ` (${Math.abs(deltaPercent).toFixed(1)}%)`
              : null}
            <span className="font-normal text-muted">vs previous offer</span>
          </p>
        ) : latestOffer ? (
          <p className="mt-2 text-[11px] text-muted">First offer from this seller</p>
        ) : null}
      </div>

      <div className="mt-3 space-y-2">
        <p className="text-xs text-muted">Latest activity</p>
        <p className="text-sm leading-relaxed text-ink">
          {summary.hasActivity && summary.lastActivity ? (
            summary.lastActivity
          ) : (
            <span className="text-muted">No activity reported</span>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
          {summary.hasActivity ? (
            <>
              <span>Last seen in round {summary.lastRound}</span>
              <span aria-hidden="true">·</span>
            </>
          ) : null}
          <span>
            {sellerOffers.length === 0
              ? "No seller offers recorded"
              : `${sellerOffers.length} seller offer${
                  sellerOffers.length === 1 ? "" : "s"
                }`}
          </span>
        </div>
        {roundsOffered.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {roundsOffered.map((round) => (
              <span
                key={round}
                className="rounded-md border border-line bg-surface-2 px-2 py-0.5 font-mono text-[11px] text-muted"
              >
                R{round}
              </span>
            ))}
          </div>
        ) : null}
        {summary.statusNote ? (
          <p className="text-[11px] text-muted">{summary.statusNote}</p>
        ) : null}
      </div>
    </Panel>
  );
}

/** One event in the chronological negotiation timeline. */
function TimelineRow({ entry, last }: { entry: TimelineEntry; last: boolean }) {
  const { event, round } = entry;
  const tone = timelineTone(event);

  return (
    <li className="flex gap-3">
      <div className="relative flex w-3 shrink-0 justify-center">
        {!last ? (
          <span className="absolute bottom-0 top-3 w-px bg-line" aria-hidden="true" />
        ) : null}
        <span className={cn("mt-1.5 size-2 rounded-full", tone.dot)} aria-hidden="true" />
      </div>
      <div className={cn("min-w-0 flex-1", last ? "pb-0" : "pb-4")}>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "font-mono text-[11px] uppercase tracking-[0.06em]",
              tone.text,
            )}
          >
            {tone.label}
          </span>
          <span className="text-[11px] text-muted">Round {round}</span>
        </div>
        <div className="mt-1 text-sm leading-relaxed">{timelineBody(event)}</div>
      </div>
    </li>
  );
}

function timelineTone(event: SseEvent): { label: string; dot: string; text: string } {
  switch (event.type) {
    case "round":
      return { label: "round", dot: "bg-lavender", text: "text-lavender" };
    case "offer":
      return event.who === "seller"
        ? { label: "seller offer", dot: "bg-accent", text: "text-accent" }
        : { label: "buyer counter", dot: "bg-info", text: "text-info" };
    case "status":
      return event.status === "deal"
        ? { label: "status", dot: "bg-success", text: "text-success" }
        : { label: "status", dot: "bg-danger", text: "text-danger" };
    case "result":
      return event.winner
        ? { label: "result", dot: "bg-success", text: "text-success" }
        : { label: "result", dot: "bg-warning", text: "text-warning" };
    case "notice":
      return { label: "notice", dot: "bg-warning", text: "text-warning" };
    case "error":
      return { label: "error", dot: "bg-danger", text: "text-danger" };
    case "reset":
      return { label: "reset", dot: "bg-faint", text: "text-muted" };
    default:
      return { label: event.type, dot: "bg-surface-3", text: "text-muted" };
  }
}

function timelineBody(event: SseEvent) {
  switch (event.type) {
    case "round":
      return <p className="text-ink">Round {event.n} started</p>;
    case "offer":
      return (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-ink">{event.seller}</span>
          <span
            className={cn(
              "text-xs font-medium",
              event.who === "seller" ? "text-accent" : "text-info",
            )}
          >
            {event.who === "seller" ? "Seller" : "Buyer"}
          </span>
          <span className="font-mono text-ink">${event.price.toFixed(2)}</span>
          <span className="text-xs text-muted">
            {event.deposit_percent}% deposit · {event.delivery_days}d delivery
          </span>
          {event.message ? (
            <span className="w-full text-xs text-muted">{event.message}</span>
          ) : null}
        </div>
      );
    case "status":
      return (
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge variant={event.status === "out" ? "out" : "deal"} />
          <span className="font-medium text-ink">{event.seller}</span>
          {event.price !== null ? (
            <span className="font-mono text-ink">${event.price.toFixed(2)}</span>
          ) : null}
          <span className="text-xs text-muted">{event.note}</span>
        </div>
      );
    case "result":
      return event.winner ? (
        <p className="text-ink">
          Winner <span className="font-medium">{event.winner.seller}</span> at{" "}
          <span className="font-mono">${event.winner.price.toFixed(2)}</span>
          {event.deal_id ? (
            <span className="ml-2 font-mono text-xs text-muted">
              deal {event.deal_id}
            </span>
          ) : null}
        </p>
      ) : (
        <p className="text-muted">Final result received with no winner.</p>
      );
    case "notice":
      return <p className="text-muted">{event.message}</p>;
    case "error":
      return <p className="text-danger">{event.message}</p>;
    case "reset":
      return <p className="text-muted">The floor was reset before a replay.</p>;
    default:
      return (
        <p className="break-all font-mono text-xs text-muted">
          {JSON.stringify(event)}
        </p>
      );
  }
}

/** A compact metric used in the outcome summary. */
function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-line bg-surface-2/40 px-3 py-2">
      <dt className="text-[11px] uppercase tracking-[0.06em] text-muted">{label}</dt>
      <dd className={cn("mt-1 text-base text-ink", mono && "font-mono")}>{value}</dd>
    </div>
  );
}

/** A label/value row in the hydrated deal summary. */
function DealRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line pb-2">
      <dt className="text-xs text-muted">{label}</dt>
      <dd
        className={cn(
          "min-w-0 break-words text-right text-ink",
          mono && "break-all font-mono",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
