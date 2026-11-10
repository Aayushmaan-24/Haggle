"use client";

/**
 * The Trading Floor setup is tab-scoped on purpose: a fresh tab starts from the
 * default product, while navigating between pages (or reloading) in the same tab
 * keeps the buyer's mandate. Session storage is browser-only, so every access is
 * guarded and every loaded value is validated before it reaches React state.
 */

const SETUP_KEY = "haggle.trading-setup.v1";

export const SETUP_SELLERS = ["Firm Co", "Flex Ltd", "Premium Hub"] as const;

export type SetupSellerPrice = { list: string; floor: string };

export type SetupCustomProduct = {
  id: string;
  name: string;
};

export type TradingSetup = {
  productId: string;
  customProduct: SetupCustomProduct | null;
  item: string;
  budget: string;
  target: string;
  sellerPrices: Record<string, SetupSellerPrice>;
  policyId: string;
  replay: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseCustomProduct(value: unknown): SetupCustomProduct | null | undefined {
  if (value === null || value === undefined) return null;
  if (!isRecord(value)) return undefined;
  if (typeof value.id !== "string" || typeof value.name !== "string") return undefined;
  return { id: value.id, name: value.name };
}

function parseSellerPrices(
  value: unknown,
): Record<string, SetupSellerPrice> | null {
  if (!isRecord(value)) return null;

  const prices: Record<string, SetupSellerPrice> = {};
  for (const seller of SETUP_SELLERS) {
    const entry = value[seller];
    if (!isRecord(entry)) return null;
    if (typeof entry.list !== "string" || typeof entry.floor !== "string") return null;
    prices[seller] = { list: entry.list, floor: entry.floor };
  }
  return prices;
}

function parseSetup(value: unknown): TradingSetup | null {
  if (!isRecord(value)) return null;

  const { productId, item, budget, target, policyId, replay } = value;
  const customProduct = parseCustomProduct(value.customProduct);
  const sellerPrices = parseSellerPrices(value.sellerPrices);

  if (typeof productId !== "string" || productId.trim() === "") return null;
  if (customProduct === undefined) return null;
  if (typeof item !== "string") return null;
  if (typeof budget !== "string") return null;
  if (typeof target !== "string") return null;
  if (!sellerPrices) return null;
  if (typeof policyId !== "string") return null;
  if (typeof replay !== "boolean") return null;

  return {
    productId,
    customProduct,
    item,
    budget,
    target,
    sellerPrices,
    policyId,
    replay,
  };
}

function hasStorage(): boolean {
  return (
    typeof window !== "undefined" && typeof window.sessionStorage !== "undefined"
  );
}

/** Reads and validates the setup for this tab. Missing or corrupt data returns null. */
export function loadSetup(): TradingSetup | null {
  if (!hasStorage()) return null;

  try {
    const raw = window.sessionStorage.getItem(SETUP_KEY);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    return parseSetup(parsed);
  } catch {
    return null;
  }
}

export function saveSetup(setup: TradingSetup): void {
  if (!hasStorage()) return;

  try {
    window.sessionStorage.setItem(SETUP_KEY, JSON.stringify(setup));
  } catch {
    // Private mode or a full quota should never block the trading controls.
  }
}

export function clearSetup(): void {
  if (!hasStorage()) return;

  try {
    window.sessionStorage.removeItem(SETUP_KEY);
  } catch {
    // Nothing else to do when storage is unavailable.
  }
}
