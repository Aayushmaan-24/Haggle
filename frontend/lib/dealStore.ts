"use client";

import type { Deal, DealStatus } from "./types";

/**
 * Browser-local copies of deals the buyer has already seen. The backend keeps the
 * authoritative record, but it is in-memory and a restart clears it; these snapshots
 * keep the receipt and Recent Deals readable in this browser after that happens.
 *
 * Snapshots are display data only. They are never used to authorize a request, and no
 * payment or delivery action is offered while a deal is only available from here.
 */

const DEALS_KEY = "haggle.deal-snapshots.v1";
const MAX_DEALS = 20;

const KNOWN_STATUSES: DealStatus[] = [
  "negotiated",
  "awaiting_approval",
  "deposit_paid",
  "complete",
];

export interface SavedDeal {
  deal: Deal;
  savedAt: string;
}

function hasStorage(): boolean {
  return (
    typeof window !== "undefined" && typeof window.localStorage !== "undefined"
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isKnownStatus(value: unknown): value is DealStatus {
  return (
    typeof value === "string" && KNOWN_STATUSES.includes(value as DealStatus)
  );
}

/** Rebuilds only the public fields the API returns, rejecting anything malformed. */
function parseDeal(value: unknown): Deal | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;

  if (typeof record.deal_id !== "string" || record.deal_id.trim() === "") {
    return null;
  }
  if (typeof record.seller !== "string" || typeof record.item !== "string") {
    return null;
  }
  if (!isKnownStatus(record.status)) return null;

  for (const key of [
    "price",
    "deposit_percent",
    "delivery_days",
    "total",
    "deposit",
    "balance",
  ] as const) {
    if (!isFiniteNumber(record[key])) return null;
  }

  // `list_price` is nullable in the API response; the display code copes with either.
  const listPrice = isFiniteNumber(record.list_price)
    ? record.list_price
    : (null as unknown as number);

  return {
    deal_id: record.deal_id,
    seller: record.seller,
    item: record.item,
    price: record.price as number,
    deposit_percent: record.deposit_percent as number,
    delivery_days: record.delivery_days as number,
    list_price: listPrice,
    total: record.total as number,
    deposit: record.deposit as number,
    balance: record.balance as number,
    status: record.status,
  };
}

function parseSaved(value: unknown): SavedDeal | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const deal = parseDeal(record.deal);
  if (!deal) return null;

  const savedAt =
    typeof record.savedAt === "string" && record.savedAt.trim() !== ""
      ? record.savedAt
      : null;
  if (!savedAt) return null;

  return { deal, savedAt };
}

function readSaved(): SavedDeal[] {
  if (!hasStorage()) return [];

  try {
    const raw = window.localStorage.getItem(DEALS_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const unique = new Map<string, SavedDeal>();
    for (const entry of parsed) {
      const saved = parseSaved(entry);
      if (saved && !unique.has(saved.deal.deal_id)) {
        unique.set(saved.deal.deal_id, saved);
      }
    }
    return [...unique.values()].slice(0, MAX_DEALS);
  } catch {
    return [];
  }
}

function writeSaved(next: SavedDeal[]): void {
  if (!hasStorage()) return;

  try {
    window.localStorage.setItem(DEALS_KEY, JSON.stringify(next));
  } catch {
    // Storage can be unavailable (private mode, quota). The live server copy still
    // works; only the offline fallback is lost.
  }
}

/** Save a list fetched from the API, updating known deals and keeping older ones. */
export function rememberDeals(deals: Deal[]): void {
  if (!hasStorage()) return;

  const fresh = deals
    .map(parseDeal)
    .filter((deal): deal is Deal => deal !== null);
  if (fresh.length === 0) return;

  const current = readSaved();
  const savedAt = new Date().toISOString();
  const freshIds = new Set(fresh.map((deal) => deal.deal_id));

  writeSaved([
    ...fresh.map((deal) => ({ deal, savedAt })),
    ...current.filter((entry) => !freshIds.has(entry.deal.deal_id)),
  ].slice(0, MAX_DEALS));
}

/** Save a single deal, for example right after a fetch, payment or delivery. */
export function rememberDeal(deal: Deal): void {
  if (!hasStorage()) return;

  const parsed = parseDeal(deal);
  if (!parsed) return;

  const current = readSaved();
  writeSaved(
    [
      { deal: parsed, savedAt: new Date().toISOString() },
      ...current.filter((entry) => entry.deal.deal_id !== parsed.deal_id),
    ].slice(0, MAX_DEALS),
  );
}

/** Newest saved deal first. Used only as a fallback when the backend has no record. */
export function readSavedDeals(): SavedDeal[] {
  return readSaved();
}

export function findSavedDeal(dealId: string): SavedDeal | null {
  if (!dealId) return null;
  return readSaved().find((entry) => entry.deal.deal_id === dealId) ?? null;
}
