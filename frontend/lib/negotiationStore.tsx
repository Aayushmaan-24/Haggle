"use client";

import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import type { NegotiateParams } from "./types";
import {
  clearNegotiationRun,
  useNegotiation,
  useNegotiationRun,
  type NegotiationRun,
  type NegotiationState,
} from "./useNegotiation";

/**
 * The negotiation lives outside the route tree — and outside React itself — so
 * navigating between pages cannot destroy it. `AppShell` renders this provider
 * once, but even if React remounts that shell (Fast Refresh, StrictMode, a layout
 * re-render), the module store in `useNegotiation.ts` keeps the reader, state and
 * run metadata alive.
 *
 * This is display and stream state only. Deal creation, ownership, payment and
 * delivery remain server-side; the provider never starts a negotiation on its own.
 */

export type { NegotiationRun } from "./useNegotiation";

export interface NegotiationSession {
  state: NegotiationState;
  run: NegotiationRun;
  /** Clears the previous run, then opens exactly one new stream. */
  startNegotiation: (params: NegotiateParams, run: NegotiationRun) => Promise<void>;
  /** Drop the reader only; the backend keeps negotiating. */
  stopListening: () => void;
  /** Close any stream and clear the negotiation, including its run metadata. */
  resetNegotiation: () => void;
  /** Clear the run metadata without touching the stream. */
  clearRun: () => void;
}

const NegotiationContext = createContext<NegotiationSession | null>(null);

export function NegotiationProvider({ children }: { children: ReactNode }) {
  const [state, control] = useNegotiation();
  const run = useNegotiationRun();

  const value = useMemo<NegotiationSession>(
    () => ({
      state,
      run,
      // The controller clears the previous run and records the new mandate in the
      // same synchronous step, so the connecting state always knows its run.
      startNegotiation: control.startNegotiation,
      stopListening: control.stopListening,
      resetNegotiation: control.reset,
      clearRun: clearNegotiationRun,
    }),
    [state, run, control],
  );

  return (
    <NegotiationContext.Provider value={value}>
      {children}
    </NegotiationContext.Provider>
  );
}

/** Reads the shared negotiation. Must be rendered under `NegotiationProvider`. */
export function useNegotiationSession(): NegotiationSession {
  const session = useContext(NegotiationContext);
  if (!session) {
    throw new Error(
      "useNegotiationSession must be used inside NegotiationProvider.",
    );
  }
  return session;
}
