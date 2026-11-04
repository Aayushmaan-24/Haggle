"use client";

import { useState } from "react";
import { useNegotiation, type NegotiationState } from "@/lib/useNegotiation";
import { PageHeader } from "@/components/shell/PageHeader";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button, ButtonLink } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

/**
 * Minimal functional trading floor for Phase 2.
 *
 * Test surface: item, budget, target, replay toggle, Start / Stop listening,
 * connection status, round, event log, seller statuses, offers, result and the
 * hydrated deal. No seller comparison table, no charts, no payment controls.
 */
export default function TradingFloorPage() {
  const [state, control] = useNegotiation();

  const [item, setItem] = useState("a 27-inch monitor");
  const [budget, setBudget] = useState("90");
  const [target, setTarget] = useState("85");
  const [replay, setReplay] = useState(false);
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setBusy(true);
    await control.startNegotiation({
      item,
      budget: Number(budget) || undefined,
      target: Number(target) || undefined,
      replay,
    });
    setBusy(false);
  };

  const stop = () => {
    control.stopListening();
  };

  return (
    <>
      <PageHeader
        eyebrow="Negotiation"
        title="Trading Floor"
        description="The buyer agent negotiates price, deposit and delivery with every seller in parallel, using real competing offers as leverage."
        actions={
          <div className="flex shrink-0 items-center gap-2">
            {state.connectionStatus === "open" ? (
              <Button variant="secondary" onClick={stop}>
                Stop listening
              </Button>
            ) : (
              <Button onClick={start} disabled={busy}>
                {busy ? "Starting…" : "Start negotiation"}
              </Button>
            )}
            <ButtonLink href="/" variant="ghost" size="sm">
              Overview
            </ButtonLink>
          </div>
        }
      />

      {state.error ? (
        <Panel>
          <PanelHeader
            eyebrow="Negotiation"
            title="Negotiation stopped"
            description={state.error}
          />
        </Panel>
      ) : null}

      {!state.error && (
        <div className="space-y-6">
          {/* Mandate card */}
          <Panel>
            <PanelHeader
              eyebrow="Mandate"
              title="Negotiation parameters"
              description="Send to the buyer agent. Any field left blank defaults to the backend contract."
            />
            <div className="space-y-4">
              <label className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-ink">Item</span>
                <input
                  value={item}
                  onChange={(e) => setItem(e.target.value)}
                  className="h-9 w-full rounded-lg border border-line bg-surface-2 px-3 text-sm text-ink outline-none focus:border-accent"
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-muted">Budget ($)</span>
                  <input
                    type="number"
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    min={1}
                    className="h-9 w-full rounded-lg border border-line bg-surface-2 px-3 text-sm text-ink outline-none focus:border-accent"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-muted">Target ($)</span>
                  <input
                    type="number"
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    min={1}
                    className="h-9 w-full rounded-lg border border-line bg-surface-2 px-3 text-sm text-ink outline-none focus:border-accent"
                  />
                </label>
              </div>
              <div className="flex items-center gap-3">
                <input
                  id="replay"
                  type="checkbox"
                  checked={replay}
                  onChange={(e) => setReplay(e.target.checked)}
                  className="h-4 w-4 rounded border-line bg-surface-2 text-accent focus:ring-accent-ring"
                />
                <label htmlFor="replay" className="text-sm text-muted">
                  Replay mode — consume the recorded run straight from the backend.
                  No live models, no rate limits.
                </label>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="primary"
                  onClick={start}
                  disabled={busy || state.connectionStatus === "open"}
                  className="flex-1"
                >
                  Start negotiation
                </Button>
                {state.connectionStatus === "open" ? (
                  <Button variant="secondary" onClick={stop} className="flex-1">
                    Stop listening
                  </Button>
                ) : null}
              </div>
            </div>
          </Panel>

          {/* Status card */}
          <Panel>
            <PanelHeader
              eyebrow="Session"
              title="Negotiation status"
              action={
                <span className="flex items-center gap-2 text-sm text-muted">
                  <span
                    className={cn(
                      "size-2 rounded-full",
                      state.connectionStatus === "open" && "bg-success",
                      state.connectionStatus === "connecting" && "bg-warning",
                      state.connectionStatus === "closed" && "bg-faint",
                      state.connectionStatus === "error" && "bg-danger",
                    )}
                    aria-hidden="true"
                  />
                  {state.connectionStatus === "open"
                    ? "Listening"
                    : state.connectionStatus === "connecting"
                      ? "Connecting…"
                      : state.connectionStatus === "closed"
                        ? "Stopped listening"
                        : "Error"}
                  {state.loading ? " · Running" : null}
                </span>
              }
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <p className="text-xs text-muted">Round</p>
                <p className="text-2xl font-semibold text-ink">{state.currentRound}</p>
              </div>
              <div className="space-y-2">
                <p className="text-xs text-muted">Seller statuses</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(state.sellerStatuses).map(([seller, status]) => (
                    <StatusBadge
                      key={seller}
                      variant={
                        status === "active"
                          ? "negotiating"
                          : status === "deal"
                            ? "deal"
                            : status === "out"
                              ? "out"
                              : "negotiating"
                      }
                    />
                  ))}
                  {Object.keys(state.sellerStatuses).length === 0 ? (
                    <span className="text-xs text-faint">Awaiting first status event</span>
                  ) : null}
                </div>
              </div>
            </div>
          </Panel>

          {/* Event log + offers card */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Panel>
              <PanelHeader
                eyebrow="Activity"
                title="Event log"
                description="Order preserved; every well-formed event from the stream."
              />
              <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                {state.events.length === 0 ? (
                  <p className="text-xs text-faint">Waiting for events…</p>
                ) : (
                  state.events.map((event, index) => (
                    <EventRow key={`${index}-${JSON.stringify(event)}`} event={event} />
                  ))
                )}
              </div>
            </Panel>

            <Panel>
              <PanelHeader
                eyebrow="Offers"
                title="Received offers"
                description="Every buyer and seller offer in arrival order."
              />
              <div className="space-y-3">
                {state.offers.map((offer, index) => (
                  <div
                    key={`${index}-${offer.seller}-${offer.who}`}
                    className="flex flex-wrap items-start gap-3 rounded-lg border border-line-bg-surface p-3"
                  >
                    <span className="font-mono text-xs text-faint">{index + 1}</span>
                    <span className="text-xs text-muted">{offer.seller}</span>
                    <span
                      className={cn(
                        "text-xs font-medium",
                        offer.who === "seller" ? "text-accent" : "text-info",
                      )}
                    >
                      {offer.who === "seller" ? "Seller" : "Buyer"}
                    </span>
                    <span className="font-mono text-sm text-ink">
                      ${offer.price.toFixed(2)} · {offer.deposit_percent}% dep · {offer.delivery_days}d
                    </span>
                    <span className="min-w-[60%] truncate text-xs text-muted">
                      {offer.message}
                    </span>
                  </div>
                ))}
                {state.offers.length === 0 ? (
                  <p className="text-xs text-faint">No offers yet</p>
                ) : null}
              </div>
            </Panel>
          </div>

          {/* Result card */}
          {state.result ? (
            <Panel>
              <PanelHeader
                eyebrow="Result"
                title="Final result"
                action={
                  <div className="flex flex-wrap items-center gap-2">
                    {state.result.winner ? (
                      <span className="text-sm font-medium text-accent">
                        Winner: {state.result.winner.seller}
                      </span>
                    ) : (
                      <span className="text-sm text-muted">No winner</span>
                    )}
                    {state.result.list_price ? (
                      <span className="text-sm text-muted">
                        List price: ${state.result.list_price.toFixed(2)}
                      </span>
                    ) : null}
                  </div>
                }
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-xs text-muted">Ranking</p>
                  <ol className="space-y-1.5">
                    {state.result.ranking.map((entry) => (
                      <li
                        key={entry.seller}
                        className="flex items-center gap-2 text-sm"
                      >
                        <span
                          className={cn(
                            "size-1.5 shrink-0 rounded-full",
                            entry === state.result?.winner
                              ? "bg-accent"
                              : "bg-surface-3",
                          )}
                          aria-hidden="true"
                        />
                        <span className="text-muted">{entry.seller}</span>
                        <span className="font-mono text-ink">
                          ${entry.price.toFixed(2)}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
                <div className="space-y-2">
                  <p className="text-xs text-muted">Deal ID / Winner price</p>
                  <div className="flex flex-wrap items-center gap-2">
                    {state.result.deal_id ? (
                      <>
                        <span className="font-mono text-xs text-faint">
                          /api/deals/{state.result.deal_id}
                        </span>
                        <ButtonLink
                          href={`/receipt?deal=${state.result.deal_id}`}
                          variant="secondary"
                          size="sm"
                        >
                          View deal
                        </ButtonLink>
                      </>
                    ) : (
                      <span className="text-sm text-muted">No deal ID in result</span>
                    )}
                    {state.result.winner ? (
                      <span className="font-mono text-sm text-ink">
                        {state.result.winner.price.toFixed(2)}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            </Panel>
          ) : null}

          {/* Hydrated deal card */}
          {state.deal ? (
            <Panel>
              <PanelHeader
                eyebrow="Deal"
                title="Hydrated deal"
                description="Fetched from `GET /api/deals/{id}` by the engine."
                action={
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-accent">
                    {state.deal.deal_id} · {state.deal.seller}
                  </span>
                }
              />
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex justify-between border-b border-line pb-1.5">
                  <span className="text-muted">Item</span>
                  <span className="text-ink">{state.deal.item}</span>
                </div>
                <div className="flex justify-between border-b border-line pb-1.5">
                  <span className="text-muted">Seller</span>
                  <span className="text-ink">{state.deal.seller}</span>
                </div>
                <div className="flex justify-between border-b border-line pb-1.5">
                  <span className="text-muted">Price</span>
                  <span className="font-mono text-ink">${state.deal.price.toFixed(2)}</span>
                </div>
                <div className="flex justify-between border-b border-line pb-1.5">
                  <span className="text-muted">Deposit</span>
                  <span className="text-ink">{state.deal.deposit_percent}%</span>
                </div>
                <div className="flex justify-between border-b border-line pb-1.5">
                  <span className="text-muted">Total</span>
                  <span className="font-mono text-ink">${state.deal.total.toFixed(2)}</span>
                </div>
                <div className="flex justify-between border-b border-line pb-1.5">
                  <span className="text-muted">Balance</span>
                  <span className="font-mono text-ink">${state.deal.balance.toFixed(2)}</span>
                </div>
                <div className="flex justify-between border-b border-line pb-1.5">
                  <span className="text-muted">List price</span>
                  <span className="font-mono text-ink">${state.deal.list_price.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Status</span>
                  <StatusBadge variant={state.deal.status === "negotiated" ? "deal" : state.deal.status === "awaiting_approval" ? "pending" : state.deal.status === "deposit_paid" ? "deal" : state.deal.status === "complete" ? "complete" : "negotiating"} />
                </div>
              </dl>
            </Panel>
          ) : null}

          {state.connectionStatus === "closed" && state.events.length === 0 ? (
            <EmptyState
              title="No negotiation"
              description="Choose a set of parameters and press Start negotiation to see the stream open."
              action={
                <Button onClick={start}>Start negotiation</Button>
              }
            />
          ) : null}
        </div>
      )}

      {state.connectionStatus === "connecting" ? (
        <Panel>
          <PanelHeader eyebrow="Negotiation" title="Starting…" />
          <LoadingState description="Streaming negotiation events from the backend…" />
        </Panel>
      ) : null}
    </>
  );
}

function EventRow({
  event,
}: {
  event:
    | { type: "round"; n: number }
    | { type: "offer"; seller: string; who: "buyer" | "seller"; price: number; deposit_percent: number; delivery_days: number; message: string }
    | { type: "status"; seller: string; status: "deal" | "out"; note: string; price: number | null }
    | { type: "result"; ranking: Array<{ seller: string; price: number; deposit_percent: number; delivery_days: number; score: number }>; winner: { seller: string; price: number; deposit_percent: number; delivery_days: number; score: number } | null; list_price: number | null; deal_id?: string }
    | { type: "notice"; message: string }
    | { type: "error"; message: string }
    | { type: "reset" }
    | { type: "unknown"; raw: string };
}) {
  switch (event.type) {
    case "round":
      return (
        <div className="flex items-center gap-2 text-sm text-muted">
          <span className="font-mono text-faint">round</span>
          <span className="font-mono text-ink">{event.n}</span>
        </div>
      );
    case "offer":
      return (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-mono text-faint">offer</span>
          <span className="text-accent">{event.seller}</span>
          <span className="text-muted">{event.who}</span>
          <span className="font-mono text-ink">${event.price.toFixed(2)}</span>
          <span className="text-xs text-muted">{event.message}</span>
        </div>
      );
    case "status":
      return (
        <div className="flex items-center gap-2 text-sm">
          <span className="font-mono text-faint">status</span>
          <StatusBadge
            variant={event.status === "out" ? "out" : event.status === "deal" ? "deal" : "negotiating"}
          />
          {event.price !== null ? (
            <span className="font-mono text-ink">${event.price.toFixed(2)}</span>
          ) : null}
          <span className="text-xs text-muted">{event.note}</span>
        </div>
      );
    case "result":
      return (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-mono text-faint">result</span>
          {event.winner ? (
            <>
              <span className="text-accent">{event.winner.seller}</span>
              <span className="font-mono text-ink">${event.winner.price.toFixed(2)}</span>
              {event.deal_id ? (
                <span className="font-mono text-xs text-faint">
                  /api/deals/{event.deal_id}
                </span>
              ) : null}
            </>
          ) : (
            <span className="text-muted">no winner</span>
          )}
        </div>
      );
    case "notice":
      return (
        <div className="flex items-center gap-2 text-sm text-amber-300">
          <span className="font-mono text-faint">notice</span>
          <span className="text-xs text-muted">{event.message}</span>
        </div>
      );
    case "error":
      return (
        <div className="flex items-center gap-2 text-sm text-danger">
          <span className="font-mono text-faint">error</span>
          <span className="text-xs text-muted">{event.message}</span>
        </div>
      );
    case "reset":
      return (
        <div className="flex items-center gap-2 text-sm text-faint">
          <span className="font-mono text-faint">reset</span>
        </div>
      );
    default:
      return (
        <div className="flex items-center gap-2 text-sm text-muted">
          <span className="font-mono text-faint">{event.type}</span>
          <span className="font-mono text-xs text-faint">{JSON.stringify(event)}</span>
        </div>
      );
  }
}
