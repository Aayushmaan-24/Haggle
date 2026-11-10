"use client";

import { useSyncExternalStore } from "react";
import type { NegotiateParams } from "./types";
import { getDeal, negotiateUrl } from "./api";
import type { SseEvent, SseMessage } from "./sse";
import { openNegotiationStream } from "./sse";

/** Control for a single negotiation. Stopping the stream does **not** cancel the
 *  backend negotiation — it only drops the client-side reader. Call it Stop
 *  listening, never cancel. */
export interface NegotiationControl {
  /** Open the stream. Starts the backend negotiation immediately. */
  startNegotiation: (params: NegotiateParams, run?: NegotiationRun) => Promise<void>;
  /** Drop the frontend reader; the backend keeps negotiating. */
  stopListening: () => void;
  /**
   * Close any open reader and return the state to its empty form. Called before a
   * new negotiation so a previous stream can never be reused or duplicated.
   */
  reset: () => void;
  /** Strictly for tests: abandon the request without touching the backend. */
  abort: () => void;
}

/** Shared state surface for the negotiation UI. */
export interface NegotiationState {
  events: SseEvent[];
  currentRound: number;
  sellerStatuses: Record<string, "deal" | "out" | "active">;
  offers: Array<{
    seller: string;
    who: "buyer" | "seller";
    price: number;
    deposit_percent: number;
    delivery_days: number;
    message: string;
  }>;
  result:
    | {
        ranking: Array<{
          seller: string;
          price: number;
          deposit_percent: number;
          delivery_days: number;
          score: number;
        }>;
        winner: {
          seller: string;
          price: number;
          deposit_percent: number;
          delivery_days: number;
          score: number;
        } | null;
        list_price: number | null;
        deal_id?: string;
      }
    | null;
  deal:
    | {
        deal_id: string;
        seller: string;
        item: string;
        price: number;
        deposit_percent: number;
        delivery_days: number;
        list_price: number;
        total: number;
        deposit: number;
        balance: number;
        status: "negotiated" | "awaiting_approval" | "deposit_paid" | "complete";
      }
    | null;
  loading: boolean;
  error: string | null;
  connectionStatus: "idle" | "connecting" | "open" | "completed" | "closed" | "error";
}

/** Metadata describing the run currently shown, so the result renders after navigating. */
export interface NegotiationRun {
  /** Mandate snapshot captured when the run started; used to hide stale results. */
  runSignature: string | null;
  runProductName: string;
  runTarget: number | null;
  attemptedPolicyId: string | null;
}

export const EMPTY_RUN: NegotiationRun = {
  runSignature: null,
  runProductName: "",
  runTarget: null,
  attemptedPolicyId: null,
};

const EMPTY_STATE: NegotiationState = {
  events: [],
  currentRound: 0,
  sellerStatuses: {},
  offers: [],
  result: null,
  deal: null,
  loading: false,
  error: null,
  connectionStatus: "idle",
};

/**
 * The negotiating session is intentionally **not** React state.
 *
 * React can unmount and remount a provider for reasons that have nothing to do with
 * the negotiation: Fast Refresh in `next dev`, StrictMode's double mount, or a
 * layout re-render during a route change. When the controller lived in a hook, any
 * of those aborted the SSE reader and wiped the transcript, which looked like the
 * negotiation vanishing after sidebar navigation.
 *
 * This module-scoped store owns the reader, the generation token and the snapshots.
 * Components subscribe to it; unmounting them has no effect on the stream. Only an
 * explicit `reset()` (or a full document load) ends a run.
 */
let state: NegotiationState = EMPTY_STATE;
let run: NegotiationRun = EMPTY_RUN;

const listeners = new Set<() => void>();

/** The live reader handle; `null` once the stream finishes or is dropped. */
let reader: { abort: () => void } | null = null;

/** True while a negotiation is connecting/open. Guards against duplicate connections. */
let active = false;

/** Monotonic token: callbacks from a previous negotiation drop themselves. */
let generation = 0;

/** So the same result never triggers a second hydration call. */
const hydrated = new Set<string>();

function emit(): void {
  for (const listener of Array.from(listeners)) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function setState(update: (current: NegotiationState) => NegotiationState): void {
  const next = update(state);
  if (next === state) return;
  state = next;
  emit();
}

function setRun(nextRun: NegotiationRun): void {
  run = nextRun;
  emit();
}

function clearRun(): void {
  if (run === EMPTY_RUN) return;
  run = EMPTY_RUN;
  emit();
}

function reset(): void {
  // Invalidate every callback belonging to the previous negotiation.
  generation += 1;
  active = false;

  // Tear down any live reader so a new negotiation actually opens a fresh stream
  // instead of reusing the previous one.
  const handle = reader;
  reader = null;
  if (handle) handle.abort();

  hydrated.clear();
  run = EMPTY_RUN;
  state = { ...EMPTY_STATE };
  emit();
}

async function startNegotiation(
  params: NegotiateParams,
  nextRun?: NegotiationRun,
): Promise<void> {
  // Repeated start attempts while one is already open: ignore, do not spawn a
  // second backend negotiation.
  if (active) return;

  // Replay Mode (and live) must start from a clean slate: no carried-over offers,
  // statuses or results from a previous run.
  reset();
  if (nextRun) setRun(nextRun);
  active = true;
  const currentGeneration = generation;

  setState((current) => ({
    ...current,
    loading: true,
    connectionStatus: "connecting",
    error: null,
  }));

  const url = negotiateUrl(params);

  const onMessage = (message: SseMessage): void => {
    if (generation !== currentGeneration) return;
    if (!message.ok) return;
    const event = message.event;

    setState((current) => {
      const events = [...current.events, event];
      let currentRound = current.currentRound;
      let sellerStatuses = { ...current.sellerStatuses };
      let offers = [...current.offers];
      let result = current.result;

      switch (event.type) {
        case "round":
          currentRound = event.n;
          break;
        case "offer":
          offers = [...offers, event];
          break;
        case "status":
          sellerStatuses = { ...sellerStatuses, [event.seller]: event.status };
          break;
        case "result": {
          result = event;
          // Hydrate only once per result payload.
          if (event.deal_id && !hydrated.has(event.deal_id)) {
            hydrated.add(event.deal_id);
            const dealId = event.deal_id;
            getDeal(dealId)
              .then((deal) => {
                if (generation !== currentGeneration) return;
                setState((latest) => ({ ...latest, deal }));
              })
              .catch((fetchError: Error) => {
                if (generation !== currentGeneration) return;
                // Deal fetch failures do not kill the stream.
                setState((latest) => ({
                  ...latest,
                  error: `Failed to load deal details: ${fetchError.message}`,
                }));
              });
          }
          break;
        }
        case "reset":
          sellerStatuses = {};
          result = null;
          break;
        case "notice":
        case "error":
          // A server `error` is a notice, not a fatal UI error.
          break;
      }

      return {
        ...current,
        events,
        currentRound,
        sellerStatuses,
        offers,
        result,
        loading: false,
        connectionStatus: "open",
      };
    });
  };

  const onAbort = (): void => {
    if (generation !== currentGeneration) return;
    // The stream reader was dropped on purpose. Stop treating this negotiation as
    // live so a later start opens a fresh stream.
    active = false;
    reader = null;
    setState((current) => ({ ...current, connectionStatus: "closed", loading: false }));
  };

  const onFinish = (error: Error | null): void => {
    if (generation !== currentGeneration) return;
    active = false;
    reader = null;
    if (error) {
      setState((current) => ({
        ...current,
        loading: false,
        error: error.message,
        connectionStatus: "error",
      }));
      return;
    }
    // Natural end of the stream. Once the backend delivered a `result`, the
    // negotiation is complete rather than merely closed.
    setState((current) => ({
      ...current,
      loading: false,
      connectionStatus: current.result ? "completed" : "closed",
    }));
  };

  try {
    const nextReader = await openNegotiationStream(url, onMessage, onAbort, onFinish);
    if (generation !== currentGeneration) {
      // A newer negotiation superseded this one before it opened.
      nextReader.abort();
      return;
    }
    reader = nextReader;
  } catch (error) {
    if (generation !== currentGeneration) return;
    const message = error instanceof Error ? error.message : String(error);
    active = false;
    reader = null;
    setState((current) => ({
      ...current,
      loading: false,
      error: message,
      connectionStatus: "error",
    }));
  }
}

// Stop listening only: drop the client reader; the backend negotiation keeps
// running. The `AbortController` is released here — the backend is not touched.
function stopListening(): void {
  const handle = reader;
  reader = null;
  if (handle) handle.abort();
}

const control: NegotiationControl = {
  startNegotiation,
  stopListening,
  reset,
  abort: stopListening,
};

export function useNegotiation(): [NegotiationState, NegotiationControl] {
  const snapshot = useSyncExternalStore(
    subscribe,
    () => state,
    () => EMPTY_STATE,
  );
  return [snapshot, control];
}

/** Subscribes to the run metadata that belongs to the current negotiation. */
export function useNegotiationRun(): NegotiationRun {
  return useSyncExternalStore(
    subscribe,
    () => run,
    () => EMPTY_RUN,
  );
}

/** Forget the run metadata without touching the stream. */
export function clearNegotiationRun(): void {
  clearRun();
}
