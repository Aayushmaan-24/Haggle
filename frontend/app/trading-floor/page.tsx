"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { ColDef, GridApi } from "ag-grid-community";
import {
  Activity,
  ArrowRight,
  ChartSpline,
  CircleDollarSign,
  Gavel,
  Info,
  Loader2,
  Play,
  Radio,
  ServerCrash,
  Trophy,
  Wallet,
} from "lucide-react";
import type { SseEvent } from "@/lib/sse";
import { useNegotiation } from "@/lib/useNegotiation";
import { payDeal } from "@/lib/api";
import type { Deal } from "@/lib/types";
import {
  forgetPolicy,
  setSelectedPolicyId,
  useSavedPolicies,
  useSelectedPolicyId,
} from "@/lib/policyStore";
import { cn } from "@/lib/cn";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { DataGrid } from "@/components/grid/DataGrid";
import { SkeletonCard } from "@/components/ui/LoadingState";

type OfferEvent = Extract<SseEvent, { type: "offer" }>;
type UiOffer = OfferEvent & { index: number; round: number };

type Lane = {
  seller: string;
  color: string;
  offers: UiOffer[];
  sellerOffers: UiOffer[];
  status: "deal" | "out" | null;
  note: string | null;
  statusPrice: number | null;
  lastRound: number;
  lastMessage: string;
  lastWho: "buyer" | "seller" | null;
};

const MAX_ROUNDS = 5;

function money(value: number): string {
  return `$${value.toFixed(2)}`;
}

function sellerColor(index: number): string {
  return `var(--color-seller-${(index % 4) + 1})`;
}

/**
 * Folds the raw event stream into seller lanes and the flat offers log.
 * A `reset` event clears everything that came before it, so a fallback replay
 * starts from an empty floor rather than stacking on the failed live run.
 */
function derive(events: SseEvent[]): {
  lanes: Lane[];
  offers: UiOffer[];
  maxRound: number;
} {
  const laneMap = new Map<string, Lane>();
  const offers: UiOffer[] = [];
  let maxRound = 0;
  let round = 0;

  const ensureLane = (seller: string): Lane => {
    let lane = laneMap.get(seller);
    if (!lane) {
      lane = {
        seller,
        color: sellerColor(laneMap.size),
        offers: [],
        sellerOffers: [],
        status: null,
        note: null,
        statusPrice: null,
        lastRound: 0,
        lastMessage: "",
        lastWho: null,
      };
      laneMap.set(seller, lane);
    }
    return lane;
  };

  for (const event of events) {
    switch (event.type) {
      case "round":
        round = event.n;
        maxRound = Math.max(maxRound, round);
        break;
      case "offer": {
        const offer: UiOffer = { ...event, index: offers.length, round };
        offers.push(offer);
        const lane = ensureLane(event.seller);
        lane.offers.push(offer);
        if (event.who === "seller") lane.sellerOffers.push(offer);
        lane.lastRound = round;
        lane.lastMessage = event.message;
        lane.lastWho = event.who;
        break;
      }
      case "status": {
        const lane = ensureLane(event.seller);
        lane.status = event.status;
        lane.note = event.note;
        lane.statusPrice = event.price;
        lane.lastRound = round;
        lane.lastMessage = event.note;
        lane.lastWho = null;
        break;
      }
      case "reset":
        laneMap.clear();
        offers.length = 0;
        maxRound = 0;
        round = 0;
        break;
      default:
        break;
    }
  }

  return { lanes: [...laneMap.values()], offers, maxRound };
}

const INPUT_ERROR = "border-danger-line";

export default function TradingFloorPage() {
  const [state, control] = useNegotiation();
  const savedPolicies = useSavedPolicies();
  const selectedPolicyId = useSelectedPolicyId();
  const selectedPolicy = savedPolicies.find((item) => item.policy_id === selectedPolicyId) ?? null;

  const [item, setItem] = useState("a 27-inch monitor");
  const [budget, setBudget] = useState("90");
  const [target, setTarget] = useState("85");
  const [replay, setReplay] = useState(false);
  const [runTarget, setRunTarget] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [touched, setTouched] = useState<{ item?: boolean; budget?: boolean; target?: boolean }>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [attemptedPolicyId, setAttemptedPolicyId] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const itemRef = useRef<HTMLInputElement>(null);

  const parsedBudget = Number(budget);
  const parsedTarget = Number(target);

  const itemError = item.trim().length === 0 ? "Describe what you want to buy." : null;
  const budgetError =
    budget.trim() === ""
      ? "Enter a budget."
      : Number.isFinite(parsedBudget) && parsedBudget > 0
        ? null
        : "Budget must be greater than $0.";
  const targetError =
    target.trim() === ""
      ? "Enter a target price."
      : Number.isFinite(parsedTarget) && parsedTarget > 0
        ? null
        : "Target must be greater than $0.";
  const relationError =
    !budgetError && !targetError && parsedTarget > parsedBudget
      ? "Target cannot exceed your budget."
      : null;

  const showItemError = Boolean(itemError) && (submitAttempted || touched.item);
  const showBudgetError = Boolean(budgetError) && (submitAttempted || touched.budget);
  const showTargetError = Boolean(targetError) && (submitAttempted || touched.target);
  const showRelationError = Boolean(relationError) && (submitAttempted || touched.target);
  const isValid = !itemError && !budgetError && !targetError && !relationError;

  const sessionActive =
    state.connectionStatus === "open" || state.connectionStatus === "connecting";
  const running = sessionActive && !state.result;
  const canStart = !submitting && !sessionActive;

  // A policy is only attached to live runs; the recorded replay has its own cast.
  const policyId = replay ? undefined : selectedPolicy?.policy_id;
  const failedPolicy = attemptedPolicyId
    ? (savedPolicies.find((policy) => policy.policy_id === attemptedPolicyId) ?? null)
    : null;
  const policyUnavailable =
    Boolean(failedPolicy) &&
    state.connectionStatus === "error" &&
    state.error?.trim().toLowerCase() === "unknown policy";

  const { lanes, offers, maxRound } = useMemo(() => derive(state.events), [state.events]);

  const notice = useMemo(() => {
    for (let index = state.events.length - 1; index >= 0; index -= 1) {
      const event = state.events[index];
      if (event.type === "notice") return event.message;
    }
    return null;
  }, [state.events]);

  const serverError = useMemo(() => {
    for (let index = state.events.length - 1; index >= 0; index -= 1) {
      const event = state.events[index];
      if (event.type === "error") return event.message;
    }
    return null;
  }, [state.events]);

  const result = state.result;
  const winner = result?.winner ?? null;
  const dealId = state.deal?.deal_id ?? result?.deal_id ?? null;
  const alreadyPaid = state.deal !== null && state.deal.status !== "negotiated";
  const fatalError = state.error ?? serverError;
  const connecting = state.connectionStatus === "connecting" && state.events.length === 0;
  const currentRound = state.currentRound;

  const depositAmount = winner
    ? (state.deal?.deposit ?? (winner.price * winner.deposit_percent) / 100)
    : 0;
  const balanceAmount = winner ? (state.deal?.balance ?? winner.price - depositAmount) : 0;
  const savedAmount =
    winner && result?.list_price ? Math.max(0, result.list_price - winner.price) : 0;
  const savedPercent =
    winner && result?.list_price && result.list_price > 0
      ? (savedAmount / result.list_price) * 100
      : 0;

  function start() {
    setSubmitAttempted(true);
    if (!isValid || submitting || sessionActive) return;

    setSubmitting(true);
    setAttemptedPolicyId(policyId ?? null);
    setRunTarget(parsedTarget);
    setPayError(null);
    void control
      .startNegotiation({
        item: item.trim(),
        budget: parsedBudget,
        target: parsedTarget,
        replay,
        policyId,
      })
      .finally(() => setSubmitting(false));
  }

  async function pay() {
    if (!dealId || paying) return;
    setPaying(true);
    setPayError(null);
    try {
      const response = await payDeal(dealId);
      window.location.assign(response.approve_url);
    } catch (cause) {
      setPayError(cause instanceof Error ? cause.message : String(cause));
      setPaying(false);
    }
  }

  const status = (() => {
    if (connecting) return { label: "Connecting", tone: "warning" as const };
    if (running) return { label: "Live", tone: "accent" as const };
    if (result) return { label: "Complete", tone: "success" as const };
    if (state.connectionStatus === "error") return { label: "Stopped", tone: "danger" as const };
    if (state.connectionStatus === "closed") return { label: "Paused", tone: "neutral" as const };
    return { label: "Ready", tone: "neutral" as const };
  })();

  const policyHelp = replay
    ? "Recorded playback follows a saved run, so seller policies are skipped."
    : selectedPolicy
      ? `${selectedPolicy.name} · list ${money(selectedPolicy.list_price)} · floor ${money(selectedPolicy.floor)} · ${selectedPolicy.deposit_percent}% deposit · ${selectedPolicy.delivery_days}-day delivery`
      : savedPolicies.length === 0
        ? "No saved policies yet — the three default sellers will negotiate."
        : "Using the three default sellers.";

  return (
    <div className="xl:flex xl:h-[calc(100dvh-9.5rem)] xl:flex-col">
      {/* Header -------------------------------------------------------- */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label mb-1.5 text-accent">Live negotiation</p>
          <h1 className="text-h1 font-semibold text-ink">Trading Floor</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={status.tone} pulse={running}>
            {status.label}
          </Badge>
          {running || result ? (
            <span className="num rounded-pill border border-line bg-surface-2 px-2.5 py-1 text-[11px] text-muted">
              Round {Math.min(currentRound, MAX_ROUNDS)} / {MAX_ROUNDS}
            </span>
          ) : null}
          {sessionActive ? (
            <Button variant="secondary" size="sm" onClick={control.stopListening}>
              Stop listening
            </Button>
          ) : null}
        </div>
      </div>

      {/* Mandate ------------------------------------------------------- */}
      <div className="card shrink-0 p-3.5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,0.62fr)_minmax(0,0.62fr)_minmax(0,1.15fr)_auto_auto] xl:items-end">
          <div className="space-y-1.5">
            <label htmlFor="item" className="label block">
              What do you want to buy?
            </label>
            <input
              ref={itemRef}
              id="item"
              value={item}
              onChange={(event) => setItem(event.target.value)}
              onBlur={() => setTouched((current) => ({ ...current, item: true }))}
              placeholder="e.g. a 27-inch monitor"
              aria-invalid={showItemError || undefined}
              aria-describedby={showItemError ? "item-error" : undefined}
              className={cn("field", showItemError && INPUT_ERROR)}
            />
            {showItemError ? (
              <p id="item-error" className="text-[11px] text-danger">
                {itemError}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="budget" className="label block">
              Budget
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-small text-faint">
                $
              </span>
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
                className={cn("field num pl-6", showBudgetError && INPUT_ERROR)}
              />
            </div>
            {showBudgetError ? (
              <p id="budget-error" className="text-[11px] text-danger">
                {budgetError}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="target" className="label block">
              Target price
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-small text-faint">
                $
              </span>
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
                  "field num pl-6",
                  (showTargetError || showRelationError) && INPUT_ERROR,
                )}
              />
            </div>
            {showTargetError ? (
              <p id="target-error" className="text-[11px] text-danger">
                {targetError}
              </p>
            ) : null}
            {!showTargetError && showRelationError ? (
              <p id="target-relation-error" className="text-[11px] text-danger">
                {relationError}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="policy" className="label block">
              Seller policy
            </label>
            <select
              id="policy"
              value={selectedPolicy?.policy_id ?? ""}
              onChange={(event) => setSelectedPolicyId(event.target.value)}
              disabled={replay || savedPolicies.length === 0 || sessionActive}
              className="field truncate"
            >
              <option value="">Default sellers</option>
              {savedPolicies.map((policy) => (
                <option key={policy.policy_id} value={policy.policy_id}>
                  {policy.name} — {money(policy.list_price)} list
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <label
              htmlFor="replay"
              className="flex h-10 w-full cursor-pointer items-center gap-2.5 rounded-control border border-line bg-surface-2 px-3 transition-colors hover:border-line-strong"
              title="Play back a recorded negotiation instead of calling live models."
            >
              <input
                id="replay"
                type="checkbox"
                checked={replay}
                onChange={(event) => setReplay(event.target.checked)}
                disabled={sessionActive}
                className="size-4 rounded border-line bg-surface-3 accent-[var(--color-accent)]"
              />
              <span className="text-[12px] font-medium text-ink">Replay</span>
            </label>
          </div>

          <Button
            onClick={start}
            disabled={!canStart}
            className="h-10 xl:min-w-[9.5rem]"
            title={result ? "Negotiate again with these limits" : "Start negotiating"}
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Starting
              </>
            ) : result ? (
              <>
                <Play className="size-3.5 fill-current" aria-hidden="true" />
                Negotiate again
              </>
            ) : (
              <>
                <Gavel className="size-4" aria-hidden="true" />
                Start negotiation
              </>
            )}
          </Button>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <p className="min-w-0 flex-1 truncate text-[11px] text-faint">
            {policyHelp}
            {!replay && savedPolicies.length === 0 ? (
              <>
                {" "}
                <Link href="/policy" className="text-accent hover:underline">
                  Create a policy
                </Link>
              </>
            ) : null}
          </p>
          <div className="flex items-center gap-3 text-[11px] text-faint">
            {result && sessionActive ? <span>Stop listening to start again.</span> : null}
            {sessionActive ? (
              <span className="hidden sm:inline">
                Stopping only closes this view; the negotiation keeps running.
              </span>
            ) : null}
          </div>
        </div>

        {running ? (
          <div className="mt-2.5 h-1 overflow-hidden rounded-pill bg-surface-3">
            <div
              className="h-full rounded-pill bg-gradient-to-r from-accent to-info transition-[width] duration-500"
              style={{ width: `${Math.min(100, (currentRound / MAX_ROUNDS) * 100)}%` }}
            />
          </div>
        ) : null}

        {submitAttempted && !isValid ? (
          <p role="alert" className="mt-2 text-[11px] text-danger">
            Fix the highlighted fields to start the negotiation.
          </p>
        ) : null}
      </div>

      {/* Inline banners ------------------------------------------------- */}
      {notice ? (
        <div className="mt-3 flex shrink-0 items-start gap-2.5 rounded-panel border border-warning-line bg-warning-soft px-3.5 py-2.5">
          <Radio className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-[12px] font-semibold text-warning">Recorded negotiation</p>
            <p className="text-[11px] leading-relaxed text-warning/85">{notice}</p>
          </div>
        </div>
      ) : null}

      {policyUnavailable && failedPolicy ? (
        <div className="mt-3 flex shrink-0 flex-wrap items-center gap-3 rounded-panel border border-danger-line bg-danger-soft px-3.5 py-2.5">
          <p className="min-w-0 flex-1 text-[12px] leading-relaxed text-danger">
            “{failedPolicy.name}” is no longer available on the server. Remove it or pick
            another policy.
          </p>
          <Button
            variant="danger"
            size="sm"
            onClick={() => forgetPolicy(failedPolicy.policy_id)}
          >
            Remove policy
          </Button>
        </div>
      ) : null}

      {fatalError && !result ? (
        <div className="mt-3 flex shrink-0 items-start gap-2.5 rounded-panel border border-danger-line bg-danger-soft px-3.5 py-2.5">
          <ServerCrash className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold text-danger">The floor went quiet</p>
            <p className="text-[11px] leading-relaxed text-danger/85">{fatalError}</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => itemRef.current?.focus()}>
            Edit mandate
          </Button>
        </div>
      ) : null}

      {/* Winner -------------------------------------------------------- */}
      {result && winner ? (
        <WinnerBanner
          winner={winner}
          deal={state.deal}
          dealId={dealId}
          depositAmount={depositAmount}
          balanceAmount={balanceAmount}
          savedAmount={savedAmount}
          savedPercent={savedPercent}
          alreadyPaid={alreadyPaid}
          paying={paying}
          payError={payError}
          onPay={() => void pay()}
        />
      ) : null}

      {result && !winner ? (
        <div className="mt-3 flex shrink-0 items-start gap-3 rounded-panel border border-warning-line bg-warning-soft px-4 py-3">
          <Info className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          <div>
            <p className="text-[13px] font-semibold text-warning">No deal this time</p>
            <p className="text-[11px] leading-relaxed text-warning/85">
              Every seller stayed outside your limits. Raise the budget or relax the target,
              then run the floor again.
            </p>
          </div>
        </div>
      ) : null}

      {/* Arena --------------------------------------------------------- */}
      <div className="mt-3 min-h-0 xl:flex-1">
        {state.events.length === 0 && !connecting ? (
          <div className="card flex h-full min-h-[420px] flex-col items-center justify-center p-8 text-center xl:min-h-0">
            <div className="relative">
              <span
                aria-hidden="true"
                className="absolute -inset-6 rounded-full bg-accent/10 blur-2xl"
              />
              <span className="relative grid size-14 place-items-center rounded-card border border-accent-line bg-accent-soft text-accent">
                <Gavel className="size-6" aria-hidden="true" />
              </span>
            </div>
            <h2 className="mt-5 text-h2 font-semibold text-ink">Your floor is ready</h2>
            <p className="mt-2 max-w-md text-small leading-relaxed text-muted">
              Set a mandate above and start the negotiation. Seller lanes, live prices, the
              conversation and every offer will appear here at once.
            </p>
            <div className="mt-6 grid gap-2 text-left sm:grid-cols-3">
              {[
                { icon: Wallet, label: "Deposit secured" },
                { icon: ChartSpline, label: "Prices compared" },
                { icon: Trophy, label: "Best deal wins" },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <span
                    key={item.label}
                    className="flex items-center gap-2 rounded-control border border-line bg-surface-2/60 px-3 py-2 text-[11px] text-muted"
                  >
                    <Icon className="size-3.5 text-accent" aria-hidden="true" />
                    {item.label}
                  </span>
                );
              })}
            </div>
          </div>
        ) : connecting ? (
          <div className="grid h-full min-h-0 gap-3 xl:grid-cols-12">
            <div className="grid gap-3 sm:grid-cols-2 xl:col-span-8 xl:grid-cols-3">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard className="hidden sm:block" />
            </div>
            <div className="grid gap-3 xl:col-span-4">
              <div className="card min-h-[220px] p-card">
                <div className="skeleton h-3 w-28" />
                <div className="skeleton mt-4 h-40 w-full" />
              </div>
              <div className="card min-h-[220px] p-card">
                <div className="skeleton h-3 w-24" />
                <div className="mt-4 space-y-2">
                  <div className="skeleton h-8 w-full" />
                  <div className="skeleton h-8 w-full" />
                  <div className="skeleton h-8 w-11/12" />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid h-full min-h-0 gap-3 xl:grid-cols-12">
            {/* Seller lanes ------------------------------------------- */}
            <section
              aria-label="Seller lanes"
              className="grid min-h-0 gap-3 sm:grid-cols-2 xl:col-span-8 xl:grid-cols-3"
            >
              {lanes.map((lane) => (
                <SellerLane
                  key={lane.seller}
                  lane={lane}
                  winner={winner?.seller === lane.seller}
                  hasResult={Boolean(result)}
                  responding={
                    running &&
                    lane.lastWho !== null &&
                    lane.seller === lastRespondingSeller(state.events)
                  }
                />
              ))}
            </section>

            {/* Chart + offers ---------------------------------------- */}
            <aside className="flex min-h-0 flex-col gap-3 xl:col-span-4">
              <PriceChartCard
                lanes={lanes}
                target={runTarget ?? parsedTarget}
                running={running}
                maxRound={maxRound}
              />
              <OffersCard offers={offers} />
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}

/** The seller named by the latest offer/status event, if it is still live. */
function lastRespondingSeller(events: SseEvent[]): string | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.type === "offer" || event.type === "status") return event.seller;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Seller lane                                                        */
/* ------------------------------------------------------------------ */

function SellerLane({
  lane,
  winner,
  hasResult,
  responding,
}: {
  lane: Lane;
  winner: boolean;
  hasResult: boolean;
  responding: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const latest = lane.sellerOffers[lane.sellerOffers.length - 1] ?? null;
  const previous =
    lane.sellerOffers.length > 1 ? lane.sellerOffers[lane.sellerOffers.length - 2] : null;
  const price = latest?.price ?? lane.statusPrice;
  const delta = latest && previous ? latest.price - previous.price : null;
  const deltaPercent =
    delta !== null && previous && previous.price !== 0
      ? (delta / previous.price) * 100
      : null;

  useEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [lane.offers.length]);

  const badge = winner ? (
    <Badge tone="success">
      <Trophy className="size-3" aria-hidden="true" />
      Winner
    </Badge>
  ) : lane.status === "out" ? (
    <Badge tone="danger">Out</Badge>
  ) : lane.status === "deal" && hasResult ? (
    <Badge tone="neutral">Not selected</Badge>
  ) : lane.status === "deal" ? (
    <Badge tone="success">Deal reached</Badge>
  ) : hasResult ? (
    <Badge tone="neutral">Not selected</Badge>
  ) : responding ? (
    <Badge tone="accent" pulse>
      Responding
    </Badge>
  ) : (
    <Badge tone="neutral">Negotiating</Badge>
  );

  return (
    <article
      className={cn(
        "card flex min-h-[300px] flex-col xl:min-h-0",
        winner && "border-success-line bg-gradient-to-b from-success-soft/60 via-surface to-surface animate-glow",
        !winner && responding && "border-accent-line",
        !winner && hasResult && lane.status !== "deal" && "opacity-75",
      )}
    >
      <div className="flex items-start justify-between gap-2 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: lane.color }}
              aria-hidden="true"
            />
            <h3 className="truncate text-[13px] font-semibold text-ink">{lane.seller}</h3>
          </div>
          <p className="mt-0.5 text-[10px] text-faint">Round {lane.lastRound || 0}</p>
        </div>
        {badge}
      </div>

      <div className="flex items-end justify-between gap-2 px-4 pb-3 pt-3.5">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-faint">
            Current offer
          </p>
          <p
            key={`${price ?? "none"}-${latest?.index ?? "status"}`}
            className="num animate-price mt-1 text-[30px] font-semibold leading-none text-ink"
          >
            {price !== null && price !== undefined ? money(price) : "—"}
          </p>
          <p className="mt-1.5 text-[11px] text-muted">
            {latest
              ? `${Math.round(latest.deposit_percent)}% deposit · ${latest.delivery_days}-day delivery`
              : lane.note ?? "Waiting for an offer"}
          </p>
        </div>
        {delta !== null ? (
          <span
            className={cn(
              "num mb-0.5 inline-flex items-center gap-1 rounded-pill border px-2 py-1 text-[10px] font-medium",
              delta < 0
                ? "border-success-line bg-success-soft text-success"
                : "border-warning-line bg-warning-soft text-warning",
            )}
            title={`${delta < 0 ? "Lowered" : "Raised"} from the previous offer`}
          >
            {delta < 0 ? "▼" : "▲"} {money(Math.abs(delta))}
            {deltaPercent !== null ? ` (${Math.abs(deltaPercent).toFixed(1)}%)` : ""}
          </span>
        ) : null}
      </div>

      <div
        ref={scrollRef}
        role="log"
        aria-label={`Conversation with ${lane.seller}`}
        className="min-h-0 flex-1 space-y-2 overflow-y-auto border-t border-line/70 px-3 py-3"
      >
        {lane.offers.length === 0 ? (
          <p className="px-1 py-3 text-center text-[11px] text-faint">
            The conversation will appear here.
          </p>
        ) : (
          lane.offers.map((offer) => (
            <div
              key={`${offer.index}-${offer.who}`}
              className={cn(
                "animate-rise max-w-[94%] rounded-panel border px-2.5 py-2",
                offer.who === "buyer"
                  ? "ml-auto border-accent-line bg-accent-soft"
                  : "border-line bg-surface-2/80",
              )}
            >
              <div className="mb-0.5 flex items-baseline justify-between gap-3">
                <span
                  className={cn(
                    "text-[9px] font-semibold uppercase tracking-[0.1em]",
                    offer.who === "buyer" ? "text-accent" : "text-faint",
                  )}
                >
                  {offer.who === "buyer" ? "Your agent" : lane.seller}
                </span>
                <span className="num text-[9px] text-faint">R{offer.round}</span>
              </div>
              <p className="text-[11.5px] leading-snug text-ink/90">{offer.message}</p>
              <p className="num mt-1 text-[10px] text-faint">
                {money(offer.price)} · {Math.round(offer.deposit_percent)}% deposit ·{" "}
                {offer.delivery_days}d
              </p>
            </div>
          ))
        )}
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* Price chart                                                        */
/* ------------------------------------------------------------------ */

function PriceChartCard({
  lanes,
  target,
  running,
  maxRound,
}: {
  lanes: Lane[];
  target: number;
  running: boolean;
  maxRound: number;
}) {
  const series = lanes
    .map((lane) => ({ lane, points: lane.sellerOffers }))
    .filter((entry) => entry.points.length > 0);
  const allPrices = series.flatMap((entry) => entry.points.map((point) => point.price));
  const hasData = allPrices.length > 0;

  const W = 620;
  const H = 250;
  const L = 46;
  const R = 14;
  const T = 16;
  const B = 30;
  const values = hasData ? [...allPrices, target] : [target];
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const padding = Math.max(2, (rawMax - rawMin) * 0.16);
  const lo = Math.floor(rawMin - padding);
  const hi = Math.ceil(rawMax + padding);
  const span = Math.max(1, hi - lo);
  const axisMax = Math.max(MAX_ROUNDS, maxRound);
  const x = (round: number) => L + (round / axisMax) * (W - L - R);
  const y = (value: number) => T + (1 - (value - lo) / span) * (H - T - B);
  const ticks = [0, Math.round(axisMax / 2), axisMax];
  const gridValues = [lo, lo + span / 2, hi];

  return (
    <div className="card flex shrink-0 flex-col xl:h-[44%] xl:min-h-[240px]">
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
        <div className="flex items-center gap-2">
          <ChartSpline className="size-4 text-accent" aria-hidden="true" />
          <h2 className="text-[13px] font-semibold text-ink">Price movement</h2>
        </div>
        <Badge tone={running ? "accent" : "neutral"} pulse={running}>
          {running ? "Live" : "Final"}
        </Badge>
      </div>

      <div className="min-h-0 flex-1 px-3 pb-2 pt-2">
        {hasData ? (
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="h-full w-full"
            role="img"
            aria-label={`Seller prices by round, with your target of ${money(target)}`}
          >
            {gridValues.map((value) => (
              <g key={value}>
                <line
                  x1={L}
                  x2={W - R}
                  y1={y(value)}
                  y2={y(value)}
                  stroke="var(--color-line)"
                  strokeDasharray="3 5"
                />
                <text x={L - 8} y={y(value) + 4} fill="var(--color-faint)" fontSize="10" textAnchor="end" className="num">
                  ${Math.round(value)}
                </text>
              </g>
            ))}

            <line
              x1={L}
              x2={W - R}
              y1={y(target)}
              y2={y(target)}
              stroke="var(--color-accent)"
              strokeWidth="1.5"
              strokeDasharray="6 5"
              opacity="0.8"
            />
            <text
              x={W - R}
              y={y(target) - 6}
              fill="var(--color-accent)"
              fontSize="10"
              textAnchor="end"
              className="num"
            >
              Target {money(target)}
            </text>

            {ticks.map((tick) => (
              <text
                key={tick}
                x={x(tick)}
                y={H - 8}
                fill="var(--color-faint)"
                fontSize="10"
                textAnchor="middle"
              >
                {tick === 0 ? "Open" : `R${tick}`}
              </text>
            ))}

            {series.map(({ lane, points }) => (
              <g key={lane.seller}>
                <polyline
                  points={points.map((point) => `${x(point.round)},${y(point.price)}`).join(" ")}
                  fill="none"
                  stroke={lane.color}
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray="1200"
                  className="animate-draw"
                />
                {points.map((point) => (
                  <circle
                    key={point.index}
                    cx={x(point.round)}
                    cy={y(point.price)}
                    r="2.6"
                    fill="var(--color-surface)"
                    stroke={lane.color}
                    strokeWidth="1.8"
                  />
                ))}
                {points.length > 0 ? (
                  <circle
                    cx={x(points[points.length - 1].round)}
                    cy={y(points[points.length - 1].price)}
                    r="4"
                    fill={lane.color}
                  />
                ) : null}
              </g>
            ))}
          </svg>
        ) : (
          <div className="flex h-full min-h-[160px] flex-col items-center justify-center gap-2 text-center">
            <Activity className="size-5 text-faint" aria-hidden="true" />
            <p className="text-[11px] text-faint">
              Price movement appears as sellers respond.
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line/70 px-4 py-2">
        {lanes.map((lane) => (
          <span key={lane.seller} className="inline-flex items-center gap-1.5 text-[10px] text-muted">
            <span
              className="size-1.5 rounded-full"
              style={{ backgroundColor: lane.color }}
              aria-hidden="true"
            />
            {lane.seller}
          </span>
        ))}
        <span className="ml-auto inline-flex items-center gap-1.5 text-[10px] text-accent">
          <span className="h-px w-4 border-t border-dashed border-accent" aria-hidden="true" />
          Target
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Live offers (AG Grid Community)                                    */
/* ------------------------------------------------------------------ */

const offerColumns: ColDef<UiOffer>[] = [
  {
    headerName: "Side",
    valueGetter: (params) => (params.data?.who === "buyer" ? "Buyer" : "Seller"),
    width: 64,
    cellClass: "text-[11px] text-muted",
  },
  {
    field: "seller",
    headerName: "Seller",
    minWidth: 100,
    flex: 1.2,
    cellClass: "truncate text-[12px] font-medium text-ink",
    tooltipField: "seller",
  },
  {
    field: "price",
    headerName: "Price",
    width: 88,
    valueFormatter: (params) =>
      typeof params.value === "number" ? money(params.value) : "—",
    cellClass: "num text-[12px] font-semibold text-ink",
    headerClass: "ag-right-header",
  },
  {
    headerName: "Terms",
    width: 90,
    valueGetter: (params) =>
      params.data ? `${Math.round(params.data.deposit_percent)}% · ${params.data.delivery_days}d` : "",
    cellClass: "num text-[11px] text-muted",
  },
  {
    headerName: "R",
    width: 48,
    valueGetter: (params) => (params.data ? `R${params.data.round}` : ""),
    cellClass: "num text-[11px] text-faint",
  },
];

function OffersCard({ offers }: { offers: UiOffer[] }) {
  const gridRef = useRef<GridApi<UiOffer> | null>(null);

  useEffect(() => {
    const api = gridRef.current;
    if (!api || offers.length === 0) return;
    api.ensureIndexVisible(offers.length - 1, "bottom");
  }, [offers.length]);

  return (
    <div className="card flex min-h-[280px] flex-1 flex-col xl:min-h-0">
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
        <div className="flex items-center gap-2">
          <CircleDollarSign className="size-4 text-accent" aria-hidden="true" />
          <h2 className="text-[13px] font-semibold text-ink">Live offers</h2>
        </div>
        <Badge tone="neutral">{offers.length}</Badge>
      </div>
      <div
        role="region"
        aria-label="Live offers log"
        className="min-h-0 flex-1 overflow-hidden"
      >
        <DataGrid
          rowData={offers}
          columnDefs={offerColumns}
          getRowId={(params) => String(params.data.index)}
          defaultColDef={{ sortable: true, resizable: true, suppressHeaderMenuButton: true }}
          onGridReady={(params) => {
            gridRef.current = params.api;
            if (offers.length > 0) params.api.ensureIndexVisible(offers.length - 1, "bottom");
          }}
          overlayNoRowsTemplate='<span style="color:#a2a2b2;font-size:12px">Offers appear here as sellers respond.</span>'
          suppressCellFocus
          rowHeight={36}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Winner + payment                                                   */
/* ------------------------------------------------------------------ */

type Winner = NonNullable<NonNullable<ReturnType<typeof useNegotiation>[0]["result"]>["winner"]>;

function WinnerBanner({
  winner,
  deal,
  dealId,
  depositAmount,
  balanceAmount,
  savedAmount,
  savedPercent,
  alreadyPaid,
  paying,
  payError,
  onPay,
}: {
  winner: Winner;
  deal: Deal | null;
  dealId: string | null;
  depositAmount: number;
  balanceAmount: number;
  savedAmount: number;
  savedPercent: number;
  alreadyPaid: boolean;
  paying: boolean;
  payError: string | null;
  onPay: () => void;
}) {
  return (
    <section
      role="status"
      aria-label="Winning deal"
      className="animate-glow mt-3 flex shrink-0 flex-col gap-4 rounded-card border border-success-line bg-gradient-to-r from-success-soft via-surface to-surface px-4 py-3.5 shadow-success xl:flex-row xl:items-center xl:justify-between"
    >
      <div className="flex min-w-0 items-center gap-3.5">
        <span className="grid size-11 shrink-0 place-items-center rounded-panel border border-success-line bg-success-soft text-success">
          <Trophy className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-success">
              Deal reached
            </p>
            {deal ? <Badge tone="neutral">{deal.status === "complete" ? "Paid in full" : "Payment due"}</Badge> : null}
          </div>
          <p className="mt-0.5 truncate text-[15px] font-semibold text-ink">
            {winner.seller} accepted at{" "}
            <span className="num text-success">{money(winner.price)}</span>
          </p>
          <p className="mt-0.5 text-[11px] text-muted">
            {savedAmount > 0
              ? `${money(savedAmount)} (${savedPercent.toFixed(1)}%) below list. `
              : ""}
            {Math.round(winner.deposit_percent)}% deposit up front · {winner.delivery_days}-day delivery
          </p>
        </div>
      </div>

      <div className="grid shrink-0 grid-cols-3 gap-2 xl:w-[320px]">
        <div className="rounded-control border border-line bg-surface-2/60 px-2.5 py-1.5">
          <p className="text-[9px] uppercase tracking-[0.1em] text-faint">Now</p>
          <p className="num mt-0.5 text-[14px] font-semibold text-ink">{money(depositAmount)}</p>
        </div>
        <div className="rounded-control border border-line bg-surface-2/60 px-2.5 py-1.5">
          <p className="text-[9px] uppercase tracking-[0.1em] text-faint">On delivery</p>
          <p className="num mt-0.5 text-[14px] font-semibold text-ink">{money(balanceAmount)}</p>
        </div>
        <div className="rounded-control border border-line bg-surface-2/60 px-2.5 py-1.5">
          <p className="text-[9px] uppercase tracking-[0.1em] text-faint">Total</p>
          <p className="num mt-0.5 text-[14px] font-semibold text-ink">{money(winner.price)}</p>
        </div>
      </div>

      <div className="shrink-0">
        {alreadyPaid && dealId ? (
          <ButtonLink href={`/receipt?deal=${dealId}`} variant="success" size="md">
            View receipt
            <ArrowRight className="size-4" aria-hidden="true" />
          </ButtonLink>
        ) : (
          <Button
            variant="success"
            onClick={onPay}
            disabled={!dealId || paying}
            className="w-full min-w-[13.5rem] xl:w-auto"
          >
            {paying ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Opening PayPal…
              </>
            ) : (
              <>
                <Wallet className="size-4" aria-hidden="true" />
                Pay {money(depositAmount)} with PayPal
              </>
            )}
          </Button>
        )}
        <p className="mt-1.5 text-center text-[10px] text-faint xl:text-right">
          {money(balanceAmount)} released after delivery
        </p>
        {payError ? (
          <p role="alert" className="mt-1 max-w-[240px] text-[10px] text-danger">
            {payError}
          </p>
        ) : null}
      </div>
    </section>
  );
}
