"use client";

import { useSyncExternalStore } from "react";
import type { Product } from "./types";

/**
 * The backend catalog is read-only and exposes no endpoint for buyer-created
 * products. This store keeps only products the buyer explicitly saved in this
 * browser. Every entry is validated before it is shown again; the store never
 * invents prices or terms.
 */

const PRODUCTS_KEY = "haggle.custom-products.v1";
const MAX_PRODUCTS = 8;

const EMPTY_PRODUCTS: Product[] = [];

const listeners = new Set<() => void>();

let productsCache: Product[] | null = null;

function hasStorage(): boolean {
  return (
    typeof window !== "undefined" && typeof window.localStorage !== "undefined"
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parsePrice(value: unknown): { list: number; floor: number } | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;

  if (
    !isFiniteNumber(record.list) ||
    !isFiniteNumber(record.floor) ||
    record.list <= 0 ||
    record.floor <= 0 ||
    record.floor > record.list
  ) {
    return null;
  }

  return { list: record.list, floor: record.floor };
}

function parseProduct(value: unknown): Product | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;

  const id = record.id;
  const name = record.name;
  const item = record.item;

  if (typeof id !== "string" || id.trim() === "") return null;
  if (typeof name !== "string" || name.trim() === "") return null;
  if (typeof item !== "string" || item.trim() === "") return null;
  if (
    !isFiniteNumber(record.budget) ||
    !isFiniteNumber(record.target) ||
    record.budget <= 0 ||
    record.target <= 0 ||
    record.target > record.budget
  ) {
    return null;
  }
  if (typeof record.prices !== "object" || record.prices === null) return null;

  const prices: Record<string, { list: number; floor: number }> = {};
  for (const [seller, raw] of Object.entries(
    record.prices as Record<string, unknown>,
  )) {
    if (seller.trim() === "") return null;
    const price = parsePrice(raw);
    if (!price) return null;
    prices[seller] = price;
  }
  if (Object.keys(prices).length === 0) return null;

  return {
    id,
    name,
    item,
    budget: record.budget,
    target: record.target,
    prices,
  };
}

function readProducts(): Product[] {
  if (!hasStorage()) return EMPTY_PRODUCTS;

  try {
    const raw = window.localStorage.getItem(PRODUCTS_KEY);
    if (!raw) return EMPTY_PRODUCTS;

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return EMPTY_PRODUCTS;

    const unique = new Map<string, Product>();
    for (const entry of parsed) {
      const product = parseProduct(entry);
      if (product && !unique.has(product.id)) {
        unique.set(product.id, product);
      }
    }
    return [...unique.values()].slice(0, MAX_PRODUCTS);
  } catch {
    return EMPTY_PRODUCTS;
  }
}

function getProductsSnapshot(): Product[] {
  if (productsCache === null) productsCache = readProducts();
  return productsCache;
}

function getServerProductsSnapshot(): Product[] {
  return EMPTY_PRODUCTS;
}

function notify(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== PRODUCTS_KEY) return;
    productsCache = null;
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

function writeProducts(next: Product[]): void {
  if (!hasStorage()) return;

  try {
    window.localStorage.setItem(PRODUCTS_KEY, JSON.stringify(next));
  } catch {
    // Storage can be unavailable (private mode, quota). Keep the in-memory
    // snapshot so this page still reflects the save that just happened.
  }

  productsCache = next;
  notify();
}

/** Save a buyer-defined product, replacing an earlier copy with the same id. */
export function rememberProduct(product: Product): void {
  if (!hasStorage()) return;

  const current = getProductsSnapshot();
  const next = [
    product,
    ...current.filter((entry) => entry.id !== product.id),
  ].slice(0, MAX_PRODUCTS);

  writeProducts(next);
}

export function forgetProduct(productId: string): void {
  if (!hasStorage()) return;

  writeProducts(
    getProductsSnapshot().filter((entry) => entry.id !== productId),
  );
}

export function useSavedProducts(): Product[] {
  return useSyncExternalStore(
    subscribe,
    getProductsSnapshot,
    getServerProductsSnapshot,
  );
}
