/**
 * Payload shapes for the Haggle backend.
 *
 * These mirror `backend/app.py`, `backend/market.py` and `backend/policy_compiler.py`
 * exactly. They are hand-written rather than generated because the backend exposes no
 * schema client and the surface is small enough to keep auditable.
 */

export type DealStatus = "negotiated" | "awaiting_approval" | "deposit_paid" | "complete";

/** Response of `GET /api/deals/{id}` (the backend's `public()` allow-list, 12 keys). */
export interface Deal {
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
  status: DealStatus;
}

/** Response of `POST /api/deals/{id}/pay`. The URL is a PayPal-hosted approval page. */
export interface PayResponse {
  approve_url: string;
}

/**
 * Response of `POST /api/policy/compile`.
 * Note the field is `floor`, not `floor_price`; the compiler schema is internal.
 */
export interface CompiledPolicy {
  policy_id: string;
  name: string;
  list_price: number;
  floor: number;
  deposit_percent: number;
  delivery_days: number;
  personality: string;
  notes: string;
}

/** Response entry of `GET /api/products`. Seller keys match `backend/market.py`. */
export interface Product {
  id: string;
  name: string;
  item: string;
  budget: number;
  target: number;
  prices: Record<string, { list: number; floor: number }>;
}

export interface RankingEntry {
  seller: string;
  price: number;
  deposit_percent: number;
  delivery_days: number;
  /** Lower is better: price * (1 + 0.05 * deposit%) + 0.5 * delivery days. */
  score: number;
}

/* ------------------------------------------------------------------ */
/* SSE events from `GET /api/negotiate`                                */
/* ------------------------------------------------------------------ */

/** `n` is 0 for the opening offers, then 1..5. */
export interface RoundEvent {
  type: "round";
  n: number;
}

export type OfferRole = "buyer" | "seller";

/** Offers carry no round number and no timestamp; round is tracked client-side. */
export interface OfferEvent {
  type: "offer";
  seller: string;
  who: OfferRole;
  price: number;
  deposit_percent: number;
  delivery_days: number;
  message: string;
}

export type SellerRunStatus = "deal" | "out";

/** `price` is `null` on walk-away/deadline events. `note` is human-readable. */
export interface StatusEvent {
  type: "status";
  seller: string;
  status: SellerRunStatus;
  note: string;
  price: number | null;
}

/** `deal_id` is only present when `winner` is non-null. */
export interface ResultEvent {
  type: "result";
  ranking: RankingEntry[];
  winner: RankingEntry | null;
  list_price: number | null;
  deal_id?: string;
}

/** Emitted when live models fail and the server falls back to the recorded replay. */
export interface NoticeEvent {
  type: "notice";
  message: string;
}

export interface ErrorEvent {
  type: "error";
  message: string;
}

/** Emitted before a fallback replay so the client can clear the floor. */
export interface ResetEvent {
  type: "reset";
}

export type NegotiationEvent =
  | RoundEvent
  | OfferEvent
  | StatusEvent
  | ResultEvent
  | NoticeEvent
  | ErrorEvent
  | ResetEvent;

/* ------------------------------------------------------------------ */
/* Request parameters                                                  */
/* ------------------------------------------------------------------ */

/** `GET /api/negotiate` query parameters. `policy_id` is omitted when absent. */
export interface NegotiateParams {
  item?: string;
  budget?: number;
  target?: number;
  policyId?: string;
  replay?: boolean;
  /** Per-seller price and delivery overrides. Live negotiations only. */
  sellerPrices?: Record<
    string,
    { list: number; floor: number; delivery_days?: number }
  >;
}
