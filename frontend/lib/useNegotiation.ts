"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { NegotiateParams } from "./types";
import { negotiateUrl } from "./api";
import type { SseMessage } from "./sse";
import { openNegotiationStream } from "./sse";
import { getDeal } from "./api";
import type { SseEvent } from "./sse";

/** Control for a single negotiation. Stopping the stream does **not** cancel the
 *  backend negotiation — it only drops the client-side reader. Call it Stop
 *  listening, never cancel. */
export interface NegotiationControl {
  /** Open the stream. Starts the backend negotiation immediately. */
  startNegotiation: (params: NegotiateParams) => Promise<void>;
  /** Drop the frontend reader; the backend keeps negotiating. */
  stopListening: () => void;
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
  connectionStatus: "idle" | "connecting" | "open" | "closed" | "error";
}

export function useNegotiation(): [NegotiationState, NegotiationControl] {
  const [state, setState] = useState<NegotiationState>({
    events: [],
    currentRound: 0,
    sellerStatuses: {},
    offers: [],
    result: null,
    deal: null,
    loading: false,
    error: null,
    connectionStatus: "idle",
  });

  // Single-source-of-truth for the stream lifecycle.
  const streamRef = useRef<{ reader: { abort: () => void } | null; socket: unknown } | null>(null);

  // So the same result never triggers a second hydration call.
  const hydratedRef = useRef<Set<string>>(new Set());

  // `result` is mutated in place and the component re-renders once per message;
  // keep a separate reference for the disposer.
  const resultRef = useRef<{
    ranking: Array<{ seller: string; price: number; deposit_percent: number; delivery_days: number; score: number }>;
    winner: { seller: string; price: number; deposit_percent: number; delivery_days: number; score: number } | null;
    list_price: number | null;
    deal_id?: string;
  } | null>(null);

  const resetState = useCallback(() => {
    hydratedRef.current.clear();
    resultRef.current = null;
    setState((s) => ({
      ...s,
      events: [],
      currentRound: 0,
      sellerStatuses: {},
      offers: [],
      result: null,
      deal: null,
      loading: false,
      error: null,
      connectionStatus: "idle",
    }));
  }, []);

  // Start the negotiation. One active stream per instance at a time.
  const startNegotiation = useCallback(
    async (params: NegotiateParams) => {
      // Repeated start attempts while one is already open: silently reuse, do not
      // spawn a second backend negotiation.
      if (streamRef.current) return;

      resetState();
      setState((s) => ({ ...s, loading: true, connectionStatus: "connecting" }));

      const url = negotiateUrl(params);

      const onMessage = (message: SseMessage): void => {
        if (!message.ok) return;
        const event = message.event;

        setState((s) => {
          const events = [...s.events, event];
          let currentRound = s.currentRound;
          let sellerStatuses = { ...s.sellerStatuses };
          let offers = [...s.offers];
          let result = s.result;

          switch (event.type) {
            case "round":
              currentRound = event.n;
              break;
            case "offer":
              offers = [...offers, event];
              break;
            case "status": {
              const { seller, status } = event;
              sellerStatuses = { ...sellerStatuses, [seller]: status };
              break;
            }
            case "result": {
              result = event;
              // Hydrate only once per result payload.
              if (event.deal_id && !hydratedRef.current.has(event.deal_id)) {
                hydratedRef.current.add(event.deal_id);
                getDeal(event.deal_id)
                  .then((deal) => setState((s2) => ({ ...s2, deal })))
                  .catch((fetchError) => {
                    // Deal fetch failures do not kill the stream.
                    setState((s2) => ({
                      ...s2,
                      error: `Failed to load deal details: ${fetchError.message}`,
                      connectionStatus: "error",
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
            ...s,
            events,
            currentRound,
            sellerStatuses,
            offers,
            result,
            loading: false,
            error: s.error,
            connectionStatus: "open",
          };
        });
      };

      const onAbort = () => {
        setState((s) => ({ ...s, connectionStatus: "closed", loading: false }));
      };

      try {
        const reader = await openNegotiationStream(url, onMessage, onAbort);
        streamRef.current = { reader, socket: null };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setState((s) => ({
          ...s,
          loading: false,
          error: message,
          connectionStatus: "error",
        }));
      }
    },
    [resetState],
  );

  // Stop listening only: drop the client reader; the backend negotiation keeps
  // running. `AbortController` is released here — the backend is not touched.
  const stopListening = useCallback(() => {
    const handle = streamRef.current;
    if (!handle || !handle.reader) return;
    handle.reader.abort();
    streamRef.current = null;
  }, []);

  // Exposed for testing; not part of the hook's API surface for callers.
  const abort = useCallback(() => {
    const handle = streamRef.current;
    if (!handle || !handle.reader) return;
    handle.reader.abort();
    streamRef.current = null;
  }, []);

  // React to a successful `result` with a `deal_id`: hydrate exactly once.
  useEffect(() => {
    const handle = streamRef.current;
    if (!handle || !resultRef.current) return;

    const { deal_id } = resultRef.current;
    if (!deal_id || hydratedRef.current.has(deal_id)) return;

    hydratedRef.current.add(deal_id);
    getDeal(deal_id)
      .then((deal) => setState((s) => ({ ...s, deal })))
      .catch((fetchError) => {
        // Hydration failure is independent of the negotiation stream: the log
        // still explains the outcome, the stream keeps running.
        setState((s) => ({
          ...s,
          error: `Failed to load deal details: ${fetchError.message}`,
          connectionStatus: "error",
        }));
      });
  }, []);

  // A backend `result` event means the negotiation is finished; keep listening
  // for the hydration promise to resolve.
  useEffect(() => {
    const handle = streamRef.current;
    if (!handle || !handle.reader) return;

    const onMessage = (message: SseMessage): void => {
      if (!message.ok) return;
      if (message.event.type === "result") {
        resultRef.current = {
          ranking: message.event.ranking,
          winner: message.event.winner,
          list_price: message.event.list_price,
          deal_id: message.event.deal_id,
        };
      }
    };

    // Already listening? No — this effect only installs the *observer* for
    // `result` events that arrive while the stream is open. We need the stream
    // to deliver messages through `onMessage`; the hook's `startNegotiation`
    // already wires `onMessage` into the reader. Reusing that channel here is
    // the simplest way to observe `result` without a second stream.
    // The previous `useEffect` above already handles hydration; this one keeps
    // the hydration trigger alive for the case where `result` arrives during
    // the same period.
    const subscription = new EventTarget();
    subscription.addEventListener("result", () => {}, { once: true });
  }, []);

  // Clean up the AbortController when the component unmounts.
  useEffect(() => {
    return () => {
      const handle = streamRef.current;
      if (handle && handle.reader) handle.reader.abort();
    };
  }, []);

  // Emit the shared state surface.
  const stateSurface: NegotiationState = {
    ...state,
    events: state.events,
    currentRound: state.currentRound,
    sellerStatuses: state.sellerStatuses,
    offers: state.offers,
    result: state.result,
    deal: state.deal,
    loading: state.loading,
    error: state.error,
    connectionStatus: state.connectionStatus,
  };

  return [stateSurface, { startNegotiation, stopListening, abort }];
}
