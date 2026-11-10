import type {
  CompiledPolicy,
  Deal,
  NegotiateParams,
  PayResponse,
  Product,
} from "./types";
import { rememberDeal, rememberDeals } from "./dealStore";

const DEV_API_BASE = "http://localhost:8000";

/**
 * Same origin in production (FastAPI serves `frontend/out`), the local backend in
 * development. Set `NEXT_PUBLIC_API_BASE` at build time to override.
 */
export const API_BASE = (
  process.env.NEXT_PUBLIC_API_BASE ??
  (process.env.NODE_ENV === "development" ? DEV_API_BASE : "")
).replace(/\/+$/, "");

/** Defaults the backend applies when `/api/negotiate` is called without parameters. */
export const NEGOTIATE_DEFAULTS = {
  item: "a 27-inch monitor",
  budget: 90,
  target: 85,
  /** `market.MANDATE.max_delivery_days` is fixed server-side; there is no query param. */
  maxDeliveryDays: 7,
} as const;

/** HTTP failure with the backend's `detail` message when it provides one. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

/**
 * FastAPI returns JSON `{"detail": ...}` for handled errors but a plain-text body for
 * unhandled 500s (e.g. an exhausted model quota), so both shapes are read here.
 */
async function readError(response: Response): Promise<ApiError> {
  const raw = await response.text().catch(() => "");
  let message = raw.trim();

  try {
    const parsed: unknown = JSON.parse(raw);
    const detail =
      typeof parsed === "object" && parsed !== null
        ? (parsed as { detail?: unknown }).detail
        : undefined;

    if (typeof detail === "string") {
      message = detail;
    } else if (Array.isArray(detail)) {
      message = detail
        .map((entry) =>
          typeof entry === "object" && entry !== null && "msg" in entry
            ? String((entry as { msg?: unknown }).msg ?? "")
            : "",
        )
        .filter(Boolean)
        .join(", ");
    }
  } catch {
    // Not JSON: keep the raw text (FastAPI's unhandled 500 body).
  }

  if (!message) message = `Request failed with status ${response.status}.`;
  if (message.length > 300) message = `${message.slice(0, 300)}…`;

  return new ApiError(response.status, message);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), {
    cache: "no-store",
    // The anonymous identity cookie is HttpOnly, so the browser attaches it here.
    credentials: "include",
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) throw await readError(response);
  return (await response.json()) as T;
}

/**
 * Latest deals in backend memory for this browser, newest first. `request` always
 * bypasses HTTP caching, and the response refreshes the local snapshots used as an
 * offline fallback.
 */
export async function getDeals(limit = 20): Promise<Deal[]> {
  const deals = await request<Deal[]>(`/api/deals?limit=${limit}`);
  if (Array.isArray(deals)) rememberDeals(deals);
  return deals;
}

/**
 * 404 means the deal is unknown to this browser or left server memory (restart). The
 * receipt falls back to the saved snapshot; the backend never accepts that snapshot
 * for payment or delivery.
 */
export async function getDeal(dealId: string): Promise<Deal> {
  const deal = await request<Deal>(`/api/deals/${encodeURIComponent(dealId)}`);
  rememberDeal(deal);
  return deal;
}

/** Moves the deal to `awaiting_approval` and returns the PayPal approval URL. */
export function payDeal(dealId: string): Promise<PayResponse> {
  return request<PayResponse>(`/api/deals/${encodeURIComponent(dealId)}/pay`, {
    method: "POST",
  });
}

/** Captures the remaining balance. Only valid while the deal is `deposit_paid`. */
export async function deliverDeal(dealId: string): Promise<Deal> {
  const deal = await request<Deal>(
    `/api/deals/${encodeURIComponent(dealId)}/deliver`,
    { method: "POST" },
  );
  rememberDeal(deal);
  return deal;
}

/** Compiles 1–2000 characters of plain-English rules into a seller policy. */
export function compilePolicy(rules: string): Promise<CompiledPolicy> {
  return request<CompiledPolicy>("/api/policy/compile", {
    method: "POST",
    body: JSON.stringify({ rules }),
  });
}

/** Catalog defaults for the Trading Floor's product picker. */
export function getProducts(): Promise<Product[]> {
  return request<Product[]>("/api/products");
}

/** Creates a seller policy from explicit terms, without the model compiler. */
export function createManualPolicy(input: {
  name: string;
  list_price: number;
  floor: number;
  deposit_percent: number;
  delivery_days: number;
  personality: string;
}): Promise<CompiledPolicy> {
  return request<CompiledPolicy>("/api/policy/manual", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/**
 * Builds the SSE URL. Consumed by the streaming client in `lib/sse.ts` (Phase 2);
 * this only assembles the verified query contract.
 */
export function negotiateUrl(params: NegotiateParams = {}): string {
  const query = new URLSearchParams();
  const { item, budget, target, policyId, replay, sellerPrices } = params;

  if (item !== undefined) query.set("item", item);
  if (budget !== undefined) query.set("budget", String(budget));
  if (target !== undefined) query.set("target", String(target));
  if (policyId) query.set("policy_id", policyId);
  if (replay) query.set("replay", "true");
  if (sellerPrices !== undefined) query.set("prices", JSON.stringify(sellerPrices));

  const search = query.toString();
  return apiUrl(`/api/negotiate${search ? `?${search}` : ""}`);
}
