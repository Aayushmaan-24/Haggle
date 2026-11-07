"use client";

import { useSyncExternalStore } from "react";
import type { CompiledPolicy } from "./types";

/**
 * The backend stores compiled policies in server memory and exposes no endpoint
 * to list them. The only durable handle the browser gets is the `policy_id`
 * returned by a successful compile, so this store remembers that response (and
 * the current selection) locally. It never invents a policy: every entry comes
 * from `POST /api/policy/compile`, and the backend remains the authority on
 * whether an ID still exists when a negotiation starts.
 */

const POLICIES_KEY = "haggle.compiled-policies.v1";
const SELECTED_KEY = "haggle.selected-policy.v1";
const MAX_POLICIES = 8;

const EMPTY_POLICIES: CompiledPolicy[] = [];
const EMPTY_SELECTED = "";

const listeners = new Set<() => void>();

let policiesCache: CompiledPolicy[] | null = null;
let selectedCache: string | null = null;

function hasStorage(): boolean {
  return (
    typeof window !== "undefined" && typeof window.localStorage !== "undefined"
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parsePolicy(value: unknown): CompiledPolicy | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;

  const policyId = record.policy_id;
  const name = record.name;
  const personality = record.personality;
  const notes = record.notes;

  if (typeof policyId !== "string" || policyId.trim() === "") return null;
  if (typeof name !== "string" || name.trim() === "") return null;
  if (typeof personality !== "string" || typeof notes !== "string") return null;
  if (
    !isFiniteNumber(record.list_price) ||
    !isFiniteNumber(record.floor) ||
    !isFiniteNumber(record.deposit_percent) ||
    !isFiniteNumber(record.delivery_days)
  ) {
    return null;
  }

  return {
    policy_id: policyId,
    name,
    list_price: record.list_price,
    floor: record.floor,
    deposit_percent: record.deposit_percent,
    delivery_days: record.delivery_days,
    personality,
    notes,
  };
}

function readPolicies(): CompiledPolicy[] {
  if (!hasStorage()) return EMPTY_POLICIES;

  try {
    const raw = window.localStorage.getItem(POLICIES_KEY);
    if (!raw) return EMPTY_POLICIES;

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return EMPTY_POLICIES;

    const unique = new Map<string, CompiledPolicy>();
    for (const entry of parsed) {
      const policy = parsePolicy(entry);
      if (policy && !unique.has(policy.policy_id)) {
        unique.set(policy.policy_id, policy);
      }
    }
    return [...unique.values()].slice(0, MAX_POLICIES);
  } catch {
    return EMPTY_POLICIES;
  }
}

function readSelected(): string {
  if (!hasStorage()) return EMPTY_SELECTED;

  try {
    return window.localStorage.getItem(SELECTED_KEY)?.trim() ?? EMPTY_SELECTED;
  } catch {
    return EMPTY_SELECTED;
  }
}

function getPoliciesSnapshot(): CompiledPolicy[] {
  if (policiesCache === null) policiesCache = readPolicies();
  return policiesCache;
}

function getSelectedSnapshot(): string {
  if (selectedCache === null) selectedCache = readSelected();
  return selectedCache;
}

function getServerPoliciesSnapshot(): CompiledPolicy[] {
  return EMPTY_POLICIES;
}

function getServerSelectedSnapshot(): string {
  return EMPTY_SELECTED;
}

function notify(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  const onStorage = (event: StorageEvent) => {
    if (
      event.key !== null &&
      event.key !== POLICIES_KEY &&
      event.key !== SELECTED_KEY
    ) {
      return;
    }
    policiesCache = null;
    selectedCache = null;
    notify();
  };

  if (typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
  }

  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage);
    }
  };
}

function writePolicies(next: CompiledPolicy[]): void {
  if (!hasStorage()) return;

  try {
    window.localStorage.setItem(POLICIES_KEY, JSON.stringify(next));
  } catch {
    // Storage can be unavailable (private mode, quota). Keep the in-memory
    // snapshot so this page still reflects the compile that just happened.
  }

  policiesCache = next;
  notify();
}

/** Remember a policy only after the backend has returned its real ID. */
export function rememberPolicy(policy: CompiledPolicy): void {
  if (!hasStorage()) return;

  const current = getPoliciesSnapshot();
  const next = [
    policy,
    ...current.filter((entry) => entry.policy_id !== policy.policy_id),
  ].slice(0, MAX_POLICIES);

  writePolicies(next);
}

export function forgetPolicy(policyId: string): void {
  if (!hasStorage()) return;

  writePolicies(
    getPoliciesSnapshot().filter((entry) => entry.policy_id !== policyId),
  );

  if (getSelectedSnapshot() === policyId) setSelectedPolicyId("");
}

export function setSelectedPolicyId(policyId: string): void {
  if (!hasStorage()) return;

  try {
    if (policyId) window.localStorage.setItem(SELECTED_KEY, policyId);
    else window.localStorage.removeItem(SELECTED_KEY);
  } catch {
    // Keep the in-memory value even when persistence is unavailable.
  }

  selectedCache = policyId;
  notify();
}

export function useSavedPolicies(): CompiledPolicy[] {
  return useSyncExternalStore(
    subscribe,
    getPoliciesSnapshot,
    getServerPoliciesSnapshot,
  );
}

export function useSelectedPolicyId(): string {
  return useSyncExternalStore(
    subscribe,
    getSelectedSnapshot,
    getServerSelectedSnapshot,
  );
}
