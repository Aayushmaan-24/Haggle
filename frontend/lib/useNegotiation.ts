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
  connectionStatus: "idle" | "connecting" | "open" | "completed" | "closed" | "error";
}

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

export function useNegotiation(): [NegotiationState, NegotiationControl] {
  const [state, setState] = useState<NegotiationState>(EMPTY_STATE);

  // Single-source-of-truth for the stream lifecycle.
  const streamRef = useRef<{ reader: { abort: () => void } | null } | null>(null);

  // True while a negotiation is connecting/open. Guards against duplicate
  // connections; cleared on completion, abort or failure.
  const activeRef = useRef(false);

  // Monotonic token. Callbacks from a previous negotiation compare against it
  // and drop themselves so stale streams cannot overwrite fresh state.
  const generationRef = useRef(0);

  // So the same result never triggers a second hydration call.
  const hydratedRef = useRef<Set<string>>(new Set());

  const resetState = useCallback(() => {
    // Invalidate every callback belonging to the previous negotiation.
    generationRef.current += 1;
    activeRef.current = false;

    // Tear down any live reader so a new negotiation actually opens a fresh
    // stream instead of reusing the previous one.
    const handle = streamRef.current;
    streamRef.current = null;
    if (handle?.reader) handle.reader.abort();

    hydratedRef.current.clear();
    setState({ ...EMPTY_STATE });
  }, []);

  // Start the negotiation. One active stream per instance at a time.
  const startNegotiation = useCallback(
    async (params: NegotiateParams) => {
      // Repeated start attempts while one is already open: ignore, do not
      // spawn a second backend negotiation.
      if (activeRef.current) return;

      // Replay Mode (and live) must start from a clean slate: no carried-over
      // offers, statuses or results from a previous run.
      resetState();
      activeRef.current = true;
      const generation = generationRef.current;

      setState((s) => ({ ...s, loading: true, connectionStatus: "connecting", error: null }));

      const url = negotiateUrl(params);

      const onMessage = (message: SseMessage): void => {
        if (generationRef.current !== generation) return;
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
            case "status":
              sellerStatuses = { ...sellerStatuses, [event.seller]: event.status };
              break;
            case "result": {
              result = event;
              // Hydrate only once per result payload.
              if (event.deal_id && !hydratedRef.current.has(event.deal_id)) {
                hydratedRef.current.add(event.deal_id);
                const dealId = event.deal_id;
                getDeal(dealId)
                  .then((deal) => {
                    if (generationRef.current !== generation) return;
                    setState((s2) => ({ ...s2, deal }));
                  })
                  .catch((fetchError: Error) => {
                    if (generationRef.current !== generation) return;
                    // Deal fetch failures do not kill the stream.
                    setState((s2) => ({
                      ...s2,
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
            ...s,
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

      const onAbort = () => {
        if (generationRef.current !== generation) return;
        // The stream reader was dropped on purpose. Stop treating this
        // negotiation as live so a later start opens a fresh stream.
        activeRef.current = false;
        streamRef.current = null;
        setState((s) => ({ ...s, connectionStatus: "closed", loading: false }));
      };

      const onFinish = (error: Error | null) => {
        if (generationRef.current !== generation) return;
        activeRef.current = false;
        streamRef.current = null;
        if (error) {
          setState((s) => ({
            ...s,
            loading: false,
            error: error.message,
            connectionStatus: "error",
          }));
          return;
        }
        // Natural end of the stream. Once the backend delivered a `result`,
        // the negotiation is complete rather than merely closed.
        setState((s) => ({
          ...s,
          loading: false,
          connectionStatus: s.result ? "completed" : "closed",
        }));
      };

      try {
        const reader = await openNegotiationStream(url, onMessage, onAbort, onFinish);
        if (generationRef.current !== generation) {
          // A newer negotiation superseded this one before it opened.
          reader.abort();
          return;
        }
        streamRef.current = { reader };
      } catch (err) {
        if (generationRef.current !== generation) return;
        const message = err instanceof Error ? err.message : String(err);
        activeRef.current = false;
        streamRef.current = null;
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
  // running. The `AbortController` is released here — the backend is not touched.
  const stopListening = useCallback(() => {
    const handle = streamRef.current;
    streamRef.current = null;
    if (handle?.reader) handle.reader.abort();
  }, []);

  // Exposed for testing; not part of the hook's API surface for callers.
  const abort = useCallback(() => {
    const handle = streamRef.current;
    streamRef.current = null;
    if (handle?.reader) handle.reader.abort();
  }, []);

  // Clean up the stream when the component unmounts.
  useEffect(() => {
    return () => {
      const handle = streamRef.current;
      if (handle?.reader) handle.reader.abort();
    };
  }, []);

  return [state, { startNegotiation, stopListening, abort }];
}
