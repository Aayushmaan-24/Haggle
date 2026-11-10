"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { ColDef, GridApi } from "ag-grid-community";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ChartSpline,
  ChevronDown,
  CircleDollarSign,
  Gavel,
  Info,
  Loader2,
  Play,
  Radio,
  RefreshCw,
  RotateCcw,
  Save,
  ServerCrash,
  ShoppingBag,
  SlidersHorizontal,
  Trash2,
  Trophy,
  Wallet,
} from "lucide-react";
import type { SseEvent } from "@/lib/sse";
import { useNegotiation } from "@/lib/useNegotiation";
import { getProducts, payDeal } from "@/lib/api";
import type { Deal, Product } from "@/lib/types";
import {
  forgetPolicy,
  setSelectedPolicyId,
  useSavedPolicies,
  useSelectedPolicyId,
} from "@/lib/policyStore";
import {
  forgetProduct,
  rememberProduct,
  useSavedProducts,
} from "@/lib/productStore";
import { cn } from "@/lib/cn";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { DataGrid } from "@/components/grid/DataGrid";
import { SkeletonCard } from "@/components/ui/LoadingState";

type OfferEvent = Extract<SseEvent, { type: "offer" }>;
type UiOffer = OfferEvent & { index: number; round: number };

type Lane = {
  seller: string;
  color: string;
  offers: UiOffer[];
  sellerOffers: UiOffer[];
  status: "deal" | "out" | null;
  note: string | null;
  statusPrice: number | null;
  lastRound: number;
  lastMessage: string;
  lastWho: "buyer" | "seller" | null;
};

const MAX_ROUNDS = 5;

/** Names must match `backend/market.py` exactly. Prices are entered per run. */
const SELLER_NAMES = ["Firm Co", "Flex Ltd", "Premium Hub"] as const;

/** `/api/products` only carries list/floor, so delivery keeps the market defaults. */
const SELLER_DELIVERY: Record<string, string> = {
  "Firm Co": "4",
  "Flex Ltd": "6",
  "Premium Hub": "2",
};

const CUSTOM_PRODUCT_ID = "__custom__";
const CUSTOM_PRODUCT_LABEL = "Custom product…";
const EMPTY_EVENTS: SseEvent[] = [];

/** Used only when `/api/products` fails; the API returns this same product. */
const FALLBACK_PRODUCT: Product = {
  id: "monitor",
  name: "27-inch monitor",
  item: "a 27-inch monitor",
  budget: 90,
  target: 85,
  prices: {
    "Firm Co": { list: 105, floor: 85 },
    "Flex Ltd": { list: 98, floor: 76 },
    "Premium Hub": { list: 118, floor: 88 },
  },
};

type SellerPriceInput = { list: string; floor: string; delivery: string };
type ProductsStatus = "loading" | "ready" | "error";

function blankSellerPriceInputs(): Record<string, SellerPriceInput> {
  return Object.fromEntries(
    SELLER_NAMES.map((name) => [name, { list: "", floor: "", delivery: "" }]),
  );
}

/** A new custom product starts with only prices empty; delivery keeps market defaults. */
function customSellerPriceInputs(): Record<string, SellerPriceInput> {
  return Object.fromEntries(
    SELLER_NAMES.map((name) => [
      name,
      { list: "", floor: "", delivery: SELLER_DELIVERY[name] ?? "4" },
    ]),
  );
}

function sellerPriceInputsFor(product: Product): Record<string, SellerPriceInput> {
  return Object.fromEntries(
    SELLER_NAMES.map((name) => {
      const price = product.prices[name];
      return [
        name,
        {
          list: price ? String(price.list) : "",
          floor: price ? String(price.floor) : "",
          delivery: SELLER_DELIVERY[name] ?? "4",
        },
      ];
    }),
  );
}

/** The backend wants an item phrase; custom names only get the article prefix. */
function itemPhraseFor(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "";
  return /^an?\s+/i.test(trimmed) ? trimmed : `a ${trimmed}`;
}

function newCustomProductId(): string {
  return `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Lane hues in first-appearance order. Eight distinct colours keep the chart,
 * name dot and legend readable on the dark canvas even when a custom policy
 * joins the three default sellers.
 */
const SELLER_COLORS = [
  "#8b6cff", // violet
  "#4fd1c5", // teal
  "#f0a35e", // amber
  "#ff5ca8", // hot pink
  "#b8f24b", // lime
  "#64b5ff", // sky
  "#f7d154", // yellow
  "#ff8a65", // coral
] as const;

function money(value: number): string {
  return `$${value.toFixed(2)}`;
}

/** Wrap with modulo so a seller can never fall outside the palette. */
function sellerColor(index: number): string {
  const count = SELLER_COLORS.length;
  return SELLER_COLORS[((index % count) + count) % count] ?? SELLER_COLORS[0];
}

/**
 * Folds the raw event stream into seller lanes and the flat offers log.
 * A `reset` event clears everything that came before it, so a fallback replay
 * starts from an empty floor rather than stacking on the failed live run.
 */
function derive(events: SseEvent[]): {
  lanes: Lane[];
  offers: UiOffer[];
  maxRound: number;
} {
  const laneMap = new Map<string, Lane>();
  const offers: UiOffer[] = [];
  let maxRound = 0;
  let round = 0;

  const ensureLane = (seller: string): Lane => {
    let lane = laneMap.get(seller);
    if (!lane) {
      lane = {
        seller,
        color: sellerColor(laneMap.size),
        offers: [],
        sellerOffers: [],
        status: null,
        note: null,
        statusPrice: null,
        lastRound: 0,
        lastMessage: "",
        lastWho: null,
      };
      laneMap.set(seller, lane);
    }
    return lane;
  };

  for (const event of events) {
    switch (event.type) {
      case "round":
        round = event.n;
        maxRound = Math.max(maxRound, round);
        break;
      case "offer": {
        const offer: UiOffer = { ...event, index: offers.length, round };
        offers.push(offer);
        const lane = ensureLane(event.seller);
        lane.offers.push(offer);
        if (event.who === "seller") lane.sellerOffers.push(offer);
        lane.lastRound = round;
        lane.lastMessage = event.message;
        lane.lastWho = event.who;
        break;
      }
      case "status": {
        const lane = ensureLane(event.seller);
        lane.status = event.status;
        lane.note = event.note;
        lane.statusPrice = event.price;
        lane.lastRound = round;
        lane.lastMessage = event.note;
        lane.lastWho = null;
        break;
      }
      case "reset":
        laneMap.clear();
        offers.length = 0;
        maxRound = 0;
        round = 0;
        break;
      default:
        break;
    }
  }

  return { lanes: [...laneMap.values()], offers, maxRound };
}

const INPUT_ERROR = "border-danger-line";

export default function TradingFloorPage() {
  const [state, control] = useNegotiation();
  const savedPolicies = useSavedPolicies();
  const selectedPolicyId = useSelectedPolicyId();
  const selectedPolicy = savedPolicies.find((item) => item.policy_id === selectedPolicyId) ?? null;
  const savedProducts = useSavedProducts();

  const [item, setItem] = useState(FALLBACK_PRODUCT.item);
  const [budget, setBudget] = useState(String(FALLBACK_PRODUCT.budget));
  const [target, setTarget] = useState(String(FALLBACK_PRODUCT.target));
  const [replay, setReplay] = useState(false);
  const [runTarget, setRunTarget] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [touched, setTouched] = useState<{ item?: boolean; budget?: boolean; target?: boolean }>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [attemptedPolicyId, setAttemptedPolicyId] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [sellerPricesOpen, setSellerPricesOpen] = useState(false);
  const [sellerPrices, setSellerPrices] = useState<Record<string, SellerPriceInput>>(
    () => sellerPriceInputsFor(FALLBACK_PRODUCT),
  );
  const [products, setProducts] = useState<Product[]>([FALLBACK_PRODUCT]);
  const [productsStatus, setProductsStatus] = useState<ProductsStatus>("loading");
  const [productsAttempt, setProductsAttempt] = useState(0);
  const [selectedProductId, setSelectedProductId] = useState(FALLBACK_PRODUCT.id);
  const [customName, setCustomName] = useState("");
  const [customNotice, setCustomNotice] = useState<string | null>(null);
  const [runSignature, setRunSignature] = useState<string | null>(null);
  const [runProductName, setRunProductName] = useState("");
  const productSelectRef = useRef<HTMLSelectElement>(null);
  const customNameRef = useRef<HTMLInputElement>(null);

  const selectedCatalogProduct =
    products.find((product) => product.id === selectedProductId) ?? null;
  const selectedSavedProduct =
    savedProducts.find((product) => product.id === selectedProductId) ?? null;
  const selectedProduct = selectedCatalogProduct ?? selectedSavedProduct;
  const customMode =
    selectedProductId === CUSTOM_PRODUCT_ID || Boolean(selectedSavedProduct);
  const selectedProductLabel = customMode
    ? customName.trim() || "Custom product"
    : (selectedProduct?.name ?? FALLBACK_PRODUCT.name);

  useEffect(() => {
    let cancelled = false;

    getProducts()
      .then((list) => {
        if (cancelled) return;
        const next = Array.isArray(list)
          ? list.filter(
              (product): product is Product =>
                typeof product === "object" &&
                product !== null &&
                typeof product.id === "string" &&
                typeof product.name === "string" &&
                typeof product.item === "string" &&
                typeof product.prices === "object" &&
                product.prices !== null,
            )
          : [];

        if (next.length === 0) {
          setProducts([FALLBACK_PRODUCT]);
          setProductsStatus("error");
          return;
        }

        setProducts(next);
        setProductsStatus("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setProducts([FALLBACK_PRODUCT]);
        setProductsStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [productsAttempt]);

  const parsedBudget = Number(budget);
  const parsedTarget = Number(target);

  const customNameError =
    customMode && customName.trim().length === 0 ? "Enter a product name." : null;
  const itemError = customMode
    ? customNameError
    : item.trim().length === 0
      ? "Choose a product."
      : null;
  const budgetError =
    budget.trim() === ""
      ? "Enter a budget."
      : Number.isFinite(parsedBudget) && parsedBudget > 0
        ? null
        : "Budget must be greater than $0.";
  const targetError =
    target.trim() === ""
      ? "Enter a target price."
      : Number.isFinite(parsedTarget) && parsedTarget > 0
        ? null
        : "Target must be greater than $0.";
  const relationError =
    !budgetError && !targetError && parsedTarget > parsedBudget
      ? "Target cannot exceed your budget."
      : null;

  const showItemError = Boolean(itemError) && (submitAttempted || touched.item);
  const showBudgetError = Boolean(budgetError) && (submitAttempted || touched.budget);
  const showTargetError = Boolean(targetError) && (submitAttempted || touched.target);
  const showRelationError = Boolean(relationError) && (submitAttempted || touched.target);
  const isValid = !itemError && !budgetError && !targetError && !relationError;

  const sellerPriceErrors = useMemo(() => {
    const errors: Record<string, string | null> = {};
    for (const name of SELLER_NAMES) {
      const entry = sellerPrices[name];
      const listText = entry?.list.trim() ?? "";
      const floorText = entry?.floor.trim() ?? "";
      const deliveryText = entry?.delivery.trim() ?? "";
      const list = Number(listText);
      const floor = Number(floorText);
      const delivery = Number(deliveryText);

      if (listText === "" || floorText === "" || deliveryText === "") {
        errors[name] = "Enter list price, lowest price and delivery days.";
      } else if (
        !Number.isFinite(list) ||
        !Number.isFinite(floor) ||
        !Number.isFinite(delivery)
      ) {
        errors[name] = "List, lowest and delivery must be numbers.";
      } else if (list <= 0) {
        errors[name] = "List price must be above $0.";
      } else if (floor <= 0) {
        errors[name] = "Lowest price must be above $0.";
      } else if (floor > list) {
        errors[name] = "Lowest price cannot be above the list price.";
      } else if (!Number.isInteger(delivery) || delivery < 1 || delivery > 30) {
        errors[name] = "Delivery must be a whole number from 1 to 30 days.";
      } else {
        errors[name] = null;
      }
    }
    return errors;
  }, [sellerPrices]);

  const sellerPricesValid = SELLER_NAMES.every((name) => !sellerPriceErrors[name]);
  // Replay ignores overrides, so invalid edits only block a live run.
  const sellerPricesBlocking = !replay && !sellerPricesValid;
  const showCustomPolicy = Boolean(selectedPolicy);

  const marketAverageList = (() => {
    const source = selectedSavedProduct ?? selectedCatalogProduct;
    const values = source
      ? SELLER_NAMES.map((name) => source.prices[name]?.list)
      : SELLER_NAMES.map((name) => Number(sellerPrices[name]?.list ?? ""));
    const valid = values.filter(
      (value): value is number =>
        typeof value === "number" && Number.isFinite(value) && value > 0,
    );
    if (valid.length === 0) return null;
    return valid.reduce((sum, value) => sum + value, 0) / valid.length;
  })();

  const priceSanityWarning =
    !replay &&
    selectedPolicy !== null &&
    marketAverageList !== null &&
    (selectedPolicy.list_price < marketAverageList * 0.5 ||
      selectedPolicy.list_price > marketAverageList * 1.6);

  const sessionActive =
    state.connectionStatus === "open" || state.connectionStatus === "connecting";

  // A policy is only attached to live runs; the recorded replay has its own cast.
  const policyId = replay ? undefined : selectedPolicy?.policy_id;

  const currentSignature = JSON.stringify({
    productId: selectedProductId,
    item: item.trim(),
    budget: budget.trim(),
    target: target.trim(),
    replay,
    policyId: policyId ?? "",
    prices: replay
      ? null
      : SELLER_NAMES.map((name) => [
          name,
          sellerPrices[name]?.list.trim() ?? "",
          sellerPrices[name]?.floor.trim() ?? "",
          sellerPrices[name]?.delivery.trim() ?? "",
        ]),
  });

  // Editing any mandate setting after a finished run hides that run's result.
  const staleResult =
    runSignature !== null && state.result !== null && runSignature !== currentSignature;
  const visibleEvents = staleResult ? EMPTY_EVENTS : state.events;

  const running = sessionActive && !state.result;
  const canStart =
    !submitting &&
    !sessionActive &&
    !sellerPricesBlocking &&
    isValid &&
    productsStatus !== "loading";

  const failedPolicy = attemptedPolicyId
    ? (savedPolicies.find((policy) => policy.policy_id === attemptedPolicyId) ?? null)
    : null;
  const policyUnavailable =
    Boolean(failedPolicy) &&
    state.connectionStatus === "error" &&
    state.error?.trim().toLowerCase() === "unknown policy";

  const { lanes, offers, maxRound } = useMemo(
    () => derive(visibleEvents),
    [visibleEvents],
  );

  const notice = useMemo(() => {
    for (let index = visibleEvents.length - 1; index >= 0; index -= 1) {
      const event = visibleEvents[index];
      if (event.type === "notice") return event.message;
    }
    return null;
  }, [visibleEvents]);

  const serverError = useMemo(() => {
    for (let index = visibleEvents.length - 1; index >= 0; index -= 1) {
      const event = visibleEvents[index];
      if (event.type === "error") return event.message;
    }
    return null;
  }, [visibleEvents]);

  const result = staleResult ? null : state.result;
  const winner = result?.winner ?? null;
  const dealId = staleResult ? null : (state.deal?.deal_id ?? result?.deal_id ?? null);
  const alreadyPaid =
    !staleResult && state.deal !== null && state.deal.status !== "negotiated";
  const fatalError = staleResult ? null : (state.error ?? serverError);
  const connecting =
    state.connectionStatus === "connecting" && visibleEvents.length === 0;
  const currentRound = staleResult ? 0 : state.currentRound;

  const depositAmount = winner
    ? (state.deal?.deposit ?? (winner.price * winner.deposit_percent) / 100)
    : 0;
  const balanceAmount = winner ? (state.deal?.balance ?? winner.price - depositAmount) : 0;
  const savedAmount =
    winner && result?.list_price ? Math.max(0, result.list_price - winner.price) : 0;
  const savedPercent =
    winner && result?.list_price && result.list_price > 0
      ? (savedAmount / result.list_price) * 100
      : 0;

  function applyProduct(
    product: Product,
    options?: { custom?: boolean; expandPrices?: boolean },
  ) {
    setSelectedProductId(product.id);
    setItem(product.item);
    setBudget(String(product.budget));
    setTarget(String(product.target));
    setCustomName(options?.custom ? product.name : "");
    setSellerPrices(sellerPriceInputsFor(product));
    if (options?.expandPrices) setSellerPricesOpen(true);
    setCustomNotice(null);
    setTouched({});
  }

  function handleReplayChange(enabled: boolean) {
    setReplay(enabled);
    if (!enabled) return;

    // Replay is a fixed recording. Lock the floor to the monitor it was recorded with.
    const monitor =
      products.find((product) => product.id === FALLBACK_PRODUCT.id) ?? FALLBACK_PRODUCT;
    applyProduct(monitor);
    setSellerPricesOpen(false);
  }

  function chooseProduct(value: string) {
    if (value === CUSTOM_PRODUCT_ID) {
      setSelectedProductId(CUSTOM_PRODUCT_ID);
      setItem("");
      setBudget("");
      setTarget("");
      setCustomName("");
      setSellerPrices(customSellerPriceInputs());
      setSellerPricesOpen(true);
      setCustomNotice(null);
      setTouched({});
      return;
    }

    const saved = savedProducts.find((product) => product.id === value);
    if (saved) {
      applyProduct(saved, { custom: true, expandPrices: true });
      return;
    }

    const product = products.find((entry) => entry.id === value);
    if (product) applyProduct(product);
  }

  function updateCustomName(value: string) {
    setCustomName(value);
    setItem(itemPhraseFor(value));
    setCustomNotice(null);
  }

  function saveCustomProduct() {
    if (!customMode || !isValid || !sellerPricesValid) return;

    const name = customName.trim();
    const product: Product = {
      id: selectedSavedProduct?.id ?? newCustomProductId(),
      name,
      item: itemPhraseFor(name),
      budget: parsedBudget,
      target: parsedTarget,
      prices: Object.fromEntries(
        SELLER_NAMES.map((seller) => [
          seller,
          {
            list: Number(sellerPrices[seller].list),
            floor: Number(sellerPrices[seller].floor),
          },
        ]),
      ),
    };

    rememberProduct(product);
    setSelectedProductId(product.id);
    setItem(product.item);
    setCustomName(product.name);
    setCustomNotice("Saved to this browser.");
  }

  function deleteSelectedCustomProduct() {
    if (!selectedSavedProduct) return;
    forgetProduct(selectedSavedProduct.id);
    const monitor =
      products.find((product) => product.id === FALLBACK_PRODUCT.id) ?? FALLBACK_PRODUCT;
    applyProduct(monitor);
    setSellerPricesOpen(false);
    setCustomNotice(null);
  }

  function resetToProductDefaults() {
    if (replay) return;

    if (selectedSavedProduct) {
      applyProduct(selectedSavedProduct, { custom: true, expandPrices: true });
      return;
    }
    if (selectedCatalogProduct) {
      applyProduct(selectedCatalogProduct);
      return;
    }
    if (selectedProductId === CUSTOM_PRODUCT_ID) {
      setItem("");
      setBudget("");
      setTarget("");
      setCustomName("");
      setSellerPrices(customSellerPriceInputs());
      setSellerPricesOpen(true);
      setCustomNotice(null);
      setTouched({});
    }
  }

  function updateSellerPrice(
    name: string,
    field: "list" | "floor" | "delivery",
    value: string,
  ) {
    setSellerPrices((current) => ({
      ...current,
      [name]: { ...current[name], [field]: value },
    }));
  }

  function clearSellerPrices() {
    setSellerPrices(blankSellerPriceInputs());
  }

  function matchShopPrices() {
    if (!selectedPolicy) return;
    setSellerPrices(
      Object.fromEntries(
        SELLER_NAMES.map((name) => [
          name,
          {
            list: String(selectedPolicy.list_price),
            floor: String(selectedPolicy.floor),
            delivery: String(selectedPolicy.delivery_days),
          },
        ]),
      ),
    );
  }

  /** Numeric overrides for the live endpoint; replay keeps its recorded prices. */
  function liveSellerPrices():
    | Record<string, { list: number; floor: number; delivery_days: number }>
    | undefined {
    if (replay) return undefined;
    return Object.fromEntries(
      SELLER_NAMES.map((name) => [
        name,
        {
          list: Number(sellerPrices[name].list),
          floor: Number(sellerPrices[name].floor),
          delivery_days: Number(sellerPrices[name].delivery),
        },
      ]),
    );
  }

  function start() {
    setSubmitAttempted(true);
    if (sellerPricesBlocking) setSellerPricesOpen(true);
    if (!isValid || sellerPricesBlocking || submitting || sessionActive) return;

    setSubmitting(true);
    setRunSignature(currentSignature);
    setRunProductName(selectedProductLabel);
    setAttemptedPolicyId(policyId ?? null);
    setRunTarget(parsedTarget);
    setPayError(null);
    void control
      .startNegotiation({
        item: item.trim(),
        budget: parsedBudget,
        target: parsedTarget,
        replay,
        policyId,
        sellerPrices: liveSellerPrices(),
      })
      .finally(() => setSubmitting(false));
  }

  async function pay() {
    if (!dealId || paying) return;
    setPaying(true);
    setPayError(null);
    try {
      const response = await payDeal(dealId);
      window.location.assign(response.approve_url);
    } catch (cause) {
      setPayError(cause instanceof Error ? cause.message : String(cause));
      setPaying(false);
    }
  }

  const status = (() => {
    if (connecting) return { label: "Connecting", tone: "warning" as const };
    if (running) return { label: "Live", tone: "accent" as const };
    if (result) return { label: "Complete", tone: "success" as const };
    if (state.connectionStatus === "error") return { label: "Stopped", tone: "danger" as const };
    if (state.connectionStatus === "closed") return { label: "Paused", tone: "neutral" as const };
    return { label: "Ready", tone: "neutral" as const };
  })();

  const policyHelp = replay
    ? "Recorded playback follows a saved run, so seller policies are skipped."
    : selectedPolicy
      ? `${selectedPolicy.name} is attached to your next live negotiation.`
      : savedPolicies.length === 0
        ? "No saved policies yet — the three default sellers will negotiate."
        : "Using the three default sellers.";

  return (
    <div className="xl:flex xl:min-h-[calc(100dvh-8.5rem)] xl:flex-col">
      {/* Header -------------------------------------------------------- */}
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label mb-1.5 text-accent">Live negotiation</p>
          <h1 className="text-h1 font-semibold text-ink">Trading Floor</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={status.tone} pulse={running}>
            {status.label}
          </Badge>
          {running || result ? (
            <span className="num rounded-pill border border-line bg-surface-2 px-2.5 py-1 text-[11px] text-muted">
              Round {Math.min(currentRound, MAX_ROUNDS)} / {MAX_ROUNDS}
            </span>
          ) : null}
          {sessionActive ? (
            <Button variant="secondary" size="sm" onClick={control.stopListening}>
              Stop listening
            </Button>
          ) : null}
        </div>
      </div>

      {/* Mandate ------------------------------------------------------- */}
      <div className="card shrink-0 p-3">
        <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,0.62fr)_minmax(0,0.62fr)_minmax(0,1.15fr)_auto_auto] xl:items-end">
          <div className="space-y-1.5">
            <label htmlFor="product" className="label block">
              Product
            </label>
            <select
              ref={productSelectRef}
              id="product"
              value={selectedProductId}
              onChange={(event) => chooseProduct(event.target.value)}
              disabled={replay || sessionActive || productsStatus === "loading"}
              className="field truncate"
            >
              {productsStatus === "loading" ? (
                <option value={FALLBACK_PRODUCT.id}>Loading products…</option>
              ) : (
                products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))
              )}
              {savedProducts.length > 0 ? (
                <optgroup label="Saved in this browser">
                  {savedProducts.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              <option value={CUSTOM_PRODUCT_ID}>{CUSTOM_PRODUCT_LABEL}</option>
            </select>

            {productsStatus === "loading" ? (
              <p className="flex items-center gap-1.5 text-[10px] text-faint">
                <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                Loading product catalog…
              </p>
            ) : null}

            {customMode ? (
              <div className="space-y-1.5 pt-1">
                <label htmlFor="custom-name" className="label block">
                  Product name
                </label>
                <input
                  ref={customNameRef}
                  id="custom-name"
                  value={customName}
                  onChange={(event) => updateCustomName(event.target.value)}
                  onBlur={() =>
                    setTouched((current) => ({ ...current, item: true }))
                  }
                  placeholder="e.g. Vintage desk lamp"
                  aria-invalid={showItemError || undefined}
                  aria-describedby={showItemError ? "custom-name-error" : undefined}
                  className={cn("field", showItemError && INPUT_ERROR)}
                />
                {showItemError ? (
                  <p id="custom-name-error" className="text-[11px] text-danger">
                    {itemError}
                  </p>
                ) : null}
                {selectedSavedProduct ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-line bg-surface-2/50 px-2.5 py-1.5">
                    <span className="inline-flex items-center gap-1.5 text-[10px] text-faint">
                      <ShoppingBag className="size-3" aria-hidden="true" />
                      Saved in this browser
                    </span>
                    <div className="flex items-center gap-2">
                      {customNotice ? (
                        <span className="text-[10px] text-success">{customNotice}</span>
                      ) : null}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={deleteSelectedCustomProduct}
                        className="h-6 px-1.5 text-danger hover:bg-danger-soft"
                        aria-label={`Delete ${selectedSavedProduct.name}`}
                      >
                        <Trash2 className="size-3" aria-hidden="true" />
                        Delete
                      </Button>
                    </div>
                  </div>
                ) : customNotice ? (
                  <p className="text-[10px] text-success">{customNotice}</p>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="budget" className="label block">
              Budget
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-small text-faint">
                $
              </span>
              <input
                id="budget"
                type="number"
                min={1}
                step="0.01"
                inputMode="decimal"
                value={budget}
                onChange={(event) => setBudget(event.target.value)}
                onBlur={() => setTouched((current) => ({ ...current, budget: true }))}
                aria-invalid={showBudgetError || undefined}
                aria-describedby={showBudgetError ? "budget-error" : undefined}
                className={cn("field num pl-6", showBudgetError && INPUT_ERROR)}
              />
            </div>
            {showBudgetError ? (
              <p id="budget-error" className="text-[11px] text-danger">
                {budgetError}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="target" className="label block">
              Target price
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-small text-faint">
                $
              </span>
              <input
                id="target"
                type="number"
                min={1}
                step="0.01"
                inputMode="decimal"
                value={target}
                onChange={(event) => setTarget(event.target.value)}
                onBlur={() => setTouched((current) => ({ ...current, target: true }))}
                aria-invalid={showTargetError || showRelationError || undefined}
                aria-describedby={
                  showTargetError
                    ? "target-error"
                    : showRelationError
                      ? "target-relation-error"
                      : undefined
                }
                className={cn(
                  "field num pl-6",
                  (showTargetError || showRelationError) && INPUT_ERROR,
                )}
              />
            </div>
            {showTargetError ? (
              <p id="target-error" className="text-[11px] text-danger">
                {targetError}
              </p>
            ) : null}
            {!showTargetError && showRelationError ? (
              <p id="target-relation-error" className="text-[11px] text-danger">
                {relationError}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="policy" className="label block">
              Seller policy
            </label>
            <select
              id="policy"
              value={selectedPolicy?.policy_id ?? ""}
              onChange={(event) => setSelectedPolicyId(event.target.value)}
              disabled={replay || savedPolicies.length === 0 || sessionActive}
              className="field truncate"
            >
              <option value="">Default sellers</option>
              {savedPolicies.map((policy) => (
                <option key={policy.policy_id} value={policy.policy_id}>
                  {policy.name} — {money(policy.list_price)} list
                </option>
              ))}
            </select>

            {selectedPolicy ? (
              <dl
                aria-label="Selected seller policy"
                className="grid grid-cols-4 gap-1.5 rounded-control border border-line bg-surface-2/60 px-2.5 py-1.5"
              >
                <div className="min-w-0">
                  <dt className="text-[8px] uppercase tracking-[0.08em] text-faint">List</dt>
                  <dd className="num truncate text-[10px] font-medium text-ink">
                    {money(selectedPolicy.list_price)}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-[8px] uppercase tracking-[0.08em] text-faint">Floor</dt>
                  <dd className="num truncate text-[10px] font-medium text-ink">
                    {money(selectedPolicy.floor)}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-[8px] uppercase tracking-[0.08em] text-faint">Deposit</dt>
                  <dd className="num truncate text-[10px] font-medium text-ink">
                    {Math.round(selectedPolicy.deposit_percent)}%
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-[8px] uppercase tracking-[0.08em] text-faint">Delivery</dt>
                  <dd className="num truncate text-[10px] font-medium text-ink">
                    {selectedPolicy.delivery_days}d
                  </dd>
                </div>
              </dl>
            ) : null}

            {priceSanityWarning ? (
              <p className="flex items-start gap-1.5 rounded-control border border-warning-line bg-warning-soft px-2.5 py-1.5 text-[10px] leading-relaxed text-warning">
                <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
                This shop&apos;s prices look far from this product&apos;s market, so it
                may win or lose by default.
              </p>
            ) : null}
          </div>

          <div className="flex items-end">
            <label
              htmlFor="replay"
              className="flex h-10 w-full cursor-pointer items-center gap-2.5 rounded-control border border-line bg-surface-2 px-3 transition-colors hover:border-line-strong"
              title="Play back a recorded negotiation instead of calling live models."
            >
              <input
                id="replay"
                type="checkbox"
                checked={replay}
                onChange={(event) => handleReplayChange(event.target.checked)}
                disabled={sessionActive}
                className="size-4 rounded border-line bg-surface-3 accent-[var(--color-accent)]"
              />
              <span className="text-[12px] font-medium text-ink">Replay</span>
            </label>
          </div>

          <Button
            onClick={start}
            disabled={!canStart}
            className="h-10 xl:min-w-[9.5rem]"
            title={result ? "Negotiate again with these limits" : "Start negotiating"}
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Starting
              </>
            ) : result ? (
              <>
                <Play className="size-3.5 fill-current" aria-hidden="true" />
                Negotiate again
              </>
            ) : (
              <>
                <Gavel className="size-4" aria-hidden="true" />
                Start negotiation
              </>
            )}
          </Button>
        </div>

        {productsStatus === "error" ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-control border border-warning-line bg-warning-soft px-3 py-2">
            <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-warning">
              Could not load the product catalog. Using the 27-inch monitor default.
            </p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setProductsStatus("loading");
                setProductsAttempt((value) => value + 1);
              }}
            >
              <RefreshCw className="size-3.5" aria-hidden="true" />
              Retry
            </Button>
          </div>
        ) : null}

        {replay ? (
          <p className="mt-2 flex items-center gap-2 rounded-control border border-info-line bg-info-soft px-3 py-2 text-[11px] text-info">
            <Info className="size-3.5 shrink-0" aria-hidden="true" />
            Recorded negotiations always use the 27-inch monitor.
          </p>
        ) : null}

        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <p className="min-w-0 flex-1 truncate text-[11px] text-faint">
            {policyHelp}
            {!replay && savedPolicies.length === 0 ? (
              <>
                {" "}
                <Link href="/policy" className="text-accent hover:underline">
                  Create a policy
                </Link>
              </>
            ) : null}
          </p>
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-faint">
            <Button
              variant="ghost"
              size="sm"
              onClick={resetToProductDefaults}
              disabled={replay}
              className="h-7 px-2 text-[11px]"
            >
              <RotateCcw className="size-3.5" aria-hidden="true" />
              Reset to product defaults
            </Button>
            {result && sessionActive ? <span>Stop listening to start again.</span> : null}
            {sessionActive ? (
              <span className="hidden sm:inline">
                Stopping only closes this view; the negotiation keeps running.
              </span>
            ) : null}
          </div>
        </div>

        {/* Seller prices ------------------------------------------------ */}
        <div className="mt-2.5 border-t border-line/70 pt-2.5">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <button
              type="button"
              onClick={() => setSellerPricesOpen((open) => !open)}
              aria-expanded={sellerPricesOpen}
              aria-controls="seller-prices-panel"
              className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted transition-colors hover:text-ink"
            >
              <SlidersHorizontal className="size-3.5 text-accent" aria-hidden="true" />
              Seller prices
              {sellerPricesBlocking ? (
                <span className="font-normal text-danger">· check values</span>
              ) : null}
              <ChevronDown
                className={cn(
                  "size-3.5 transition-transform",
                  sellerPricesOpen && "rotate-180",
                )}
                aria-hidden="true"
              />
            </button>
            <span className="text-[10px] text-faint">
              {replay
                ? "Recorded negotiations use fixed prices."
                : "Used for live negotiations only."}
            </span>
          </div>

          {sellerPricesOpen ? (
            <div id="seller-prices-panel" className="mt-2.5">
              {replay ? (
                <p className="mb-2 rounded-control border border-line bg-surface-2/60 px-3 py-2 text-[11px] text-faint">
                  Recorded negotiations use fixed prices.
                </p>
              ) : null}

              <div
                className={cn(
                  "grid gap-2 sm:grid-cols-2",
                  showCustomPolicy ? "xl:grid-cols-4" : "xl:grid-cols-3",
                  replay && "opacity-50",
                )}
                aria-disabled={replay || undefined}
              >
                {SELLER_NAMES.map((name) => {
                  const error = sellerPriceErrors[name];
                  const entry = sellerPrices[name];
                  const slug = name.toLowerCase().replace(/\s+/g, "-");
                  return (
                    <div
                      key={name}
                      className="rounded-control border border-line bg-surface-2/40 p-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[11px] font-medium text-ink">
                          {name}
                        </span>
                        {error ? (
                          <span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-danger">
                            Invalid
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1.5 grid grid-cols-3 gap-2">
                        <label htmlFor={`seller-${slug}-list`} className="block">
                          <span className="label mb-1 block text-[9px]">List price</span>
                          <input
                            id={`seller-${slug}-list`}
                            type="number"
                            min={0.01}
                            step="0.01"
                            inputMode="decimal"
                            placeholder="0.00"
                            value={entry.list}
                            onChange={(event) =>
                              updateSellerPrice(name, "list", event.target.value)
                            }
                            disabled={replay}
                            aria-invalid={Boolean(error) || undefined}
                            aria-describedby={error ? `seller-${slug}-error` : undefined}
                            className={cn("field num h-8 px-2 text-[12px]", error && INPUT_ERROR)}
                          />
                        </label>
                        <label htmlFor={`seller-${slug}-floor`} className="block">
                          <span className="label mb-1 block text-[9px]">Lowest price</span>
                          <input
                            id={`seller-${slug}-floor`}
                            type="number"
                            min={0.01}
                            step="0.01"
                            inputMode="decimal"
                            placeholder="0.00"
                            value={entry.floor}
                            onChange={(event) =>
                              updateSellerPrice(name, "floor", event.target.value)
                            }
                            disabled={replay}
                            aria-invalid={Boolean(error) || undefined}
                            aria-describedby={error ? `seller-${slug}-error` : undefined}
                            className={cn("field num h-8 px-2 text-[12px]", error && INPUT_ERROR)}
                          />
                        </label>
                        <label htmlFor={`seller-${slug}-delivery`} className="block">
                          <span className="label mb-1 block text-[9px]">Delivery</span>
                          <input
                            id={`seller-${slug}-delivery`}
                            type="number"
                            min={1}
                            max={30}
                            step="1"
                            inputMode="numeric"
                            placeholder="days"
                            value={entry.delivery}
                            onChange={(event) =>
                              updateSellerPrice(name, "delivery", event.target.value)
                            }
                            disabled={replay}
                            aria-invalid={Boolean(error) || undefined}
                            aria-describedby={error ? `seller-${slug}-error` : undefined}
                            className={cn("field num h-8 px-2 text-[12px]", error && INPUT_ERROR)}
                          />
                        </label>
                      </div>
                      {error ? (
                        <p id={`seller-${slug}-error`} className="mt-1 text-[10px] text-danger">
                          {error}
                        </p>
                      ) : null}
                    </div>
                  );
                })}

                {showCustomPolicy && selectedPolicy ? (
                  <div className="rounded-control border border-accent-line bg-accent-soft/40 p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[11px] font-medium text-ink">
                        {selectedPolicy.name}
                      </span>
                      <Badge tone="accent">Custom</Badge>
                    </div>
                    <div className="mt-1.5 grid grid-cols-3 gap-2">
                      <div>
                        <span className="label mb-1 block text-[9px]">List price</span>
                        <p className="num text-[12px] font-medium text-ink">
                          {money(selectedPolicy.list_price)}
                        </p>
                      </div>
                      <div>
                        <span className="label mb-1 block text-[9px]">Lowest price</span>
                        <p className="num text-[12px] font-medium text-ink">
                          {money(selectedPolicy.floor)}
                        </p>
                      </div>
                      <div>
                        <span className="label mb-1 block text-[9px]">Delivery</span>
                        <p className="num text-[12px] font-medium text-ink">
                          {selectedPolicy.delivery_days}d
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={matchShopPrices}
                      disabled={replay}
                      className="mt-2 w-full"
                    >
                      Match my shop prices
                    </Button>
                  </div>
                ) : null}
              </div>

              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[10px] text-faint">
                  Lowest price must be above $0 and not above list. Sellers above 7
                  delivery days are marked out.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {customMode ? (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={saveCustomProduct}
                      disabled={replay || !isValid || !sellerPricesValid}
                    >
                      <Save className="size-3.5" aria-hidden="true" />
                      Save to this browser
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearSellerPrices}
                    disabled={replay}
                  >
                    <RotateCcw className="size-3.5" aria-hidden="true" />
                    Clear values
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {running ? (
          <div className="mt-2 h-1 overflow-hidden rounded-pill bg-surface-3">
            <div
              className="h-full rounded-pill bg-gradient-to-r from-accent to-info transition-[width] duration-500"
              style={{ width: `${Math.min(100, (currentRound / MAX_ROUNDS) * 100)}%` }}
            />
          </div>
        ) : null}

        {submitAttempted && (!isValid || sellerPricesBlocking) ? (
          <p role="alert" className="mt-2 text-[11px] text-danger">
            {!isValid
              ? "Fix the highlighted fields to start the negotiation."
              : "Fix the seller prices to start the negotiation."}
          </p>
        ) : null}
      </div>

      {/* Inline banners ------------------------------------------------- */}
      {notice ? (
        <div className="mt-3 flex shrink-0 items-start gap-2.5 rounded-panel border border-warning-line bg-warning-soft px-3.5 py-2.5">
          <Radio className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-[12px] font-semibold text-warning">Recorded negotiation</p>
            <p className="text-[11px] leading-relaxed text-warning/85">{notice}</p>
          </div>
        </div>
      ) : null}

      {policyUnavailable && failedPolicy ? (
        <div className="mt-3 flex shrink-0 flex-wrap items-center gap-3 rounded-panel border border-danger-line bg-danger-soft px-3.5 py-2.5">
          <p className="min-w-0 flex-1 text-[12px] leading-relaxed text-danger">
            “{failedPolicy.name}” is no longer available on the server. Remove it or pick
            another policy.
          </p>
          <Button
            variant="danger"
            size="sm"
            onClick={() => forgetPolicy(failedPolicy.policy_id)}
          >
            Remove policy
          </Button>
        </div>
      ) : null}

      {fatalError && !result ? (
        <div className="mt-3 flex shrink-0 items-start gap-2.5 rounded-panel border border-danger-line bg-danger-soft px-3.5 py-2.5">
          <ServerCrash className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold text-danger">The floor went quiet</p>
            <p className="text-[11px] leading-relaxed text-danger/85">{fatalError}</p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              (customMode ? customNameRef : productSelectRef).current?.focus()
            }
          >
            Edit mandate
          </Button>
        </div>
      ) : null}

      {/* Winner -------------------------------------------------------- */}
      {result && winner ? (
        <WinnerBanner
          winner={winner}
          productName={runProductName}
          deal={state.deal}
          dealId={dealId}
          depositAmount={depositAmount}
          balanceAmount={balanceAmount}
          savedAmount={savedAmount}
          savedPercent={savedPercent}
          alreadyPaid={alreadyPaid}
          paying={paying}
          payError={payError}
          onPay={() => void pay()}
        />
      ) : null}

      {result && !winner ? (
        <div className="mt-3 flex shrink-0 items-start gap-3 rounded-panel border border-warning-line bg-warning-soft px-4 py-3">
          <Info className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          <div>
            <p className="text-[13px] font-semibold text-warning">No deal this time</p>
            <p className="text-[11px] leading-relaxed text-warning/85">
              Every seller stayed outside your limits. Raise the budget or relax the target,
              then run the floor again.
            </p>
          </div>
        </div>
      ) : null}

      {/* Arena --------------------------------------------------------- */}
      <div className="mt-2.5 xl:flex-1">
        {visibleEvents.length === 0 && !connecting ? (
          <div className="card flex h-full min-h-[420px] flex-col items-center justify-center p-8 text-center xl:min-h-0">
            <div className="relative">
              <span
                aria-hidden="true"
                className="absolute -inset-6 rounded-full bg-accent/10 blur-2xl"
              />
              <span className="relative grid size-14 place-items-center rounded-card border border-accent-line bg-accent-soft text-accent">
                <Gavel className="size-6" aria-hidden="true" />
              </span>
            </div>
            <h2 className="mt-5 text-h2 font-semibold text-ink">Your floor is ready</h2>
            <p className="mt-2 max-w-md text-small leading-relaxed text-muted">
              Set a mandate above and start the negotiation. Seller lanes, live prices, the
              conversation and every offer will appear here at once.
            </p>
            <div className="mt-6 grid gap-2 text-left sm:grid-cols-3">
              {[
                { icon: Wallet, label: "Deposit secured" },
                { icon: ChartSpline, label: "Prices compared" },
                { icon: Trophy, label: "Best deal wins" },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <span
                    key={item.label}
                    className="flex items-center gap-2 rounded-control border border-line bg-surface-2/60 px-3 py-2 text-[11px] text-muted"
                  >
                    <Icon className="size-3.5 text-accent" aria-hidden="true" />
                    {item.label}
                  </span>
                );
              })}
            </div>
          </div>
        ) : connecting ? (
          <div className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard className="hidden sm:block" />
              <SkeletonCard className="hidden xl:block" />
            </div>
            <div className="card min-h-[280px] p-card">
              <div className="skeleton h-3 w-28" />
              <div className="skeleton mt-4 h-52 w-full" />
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {/* Seller lanes ------------------------------------------- */}
            <section
              aria-label="Seller lanes"
              className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] gap-3"
            >
              {lanes.map((lane) => (
                <SellerLane
                  key={lane.seller}
                  lane={lane}
                  winner={winner?.seller === lane.seller}
                  hasResult={Boolean(result)}
                  responding={
                    running &&
                    lane.lastWho !== null &&
                    lane.seller === lastRespondingSeller(visibleEvents)
                  }
                />
              ))}
            </section>

            {/* Price chart + live offers, full width below the lanes --- */}
            <MarketCard
              lanes={lanes}
              offers={offers}
              target={runTarget ?? parsedTarget}
              running={running}
              maxRound={maxRound}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/** The seller named by the latest offer/status event, if it is still live. */
function lastRespondingSeller(events: SseEvent[]): string | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.type === "offer" || event.type === "status") return event.seller;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Seller lane                                                        */
/* ------------------------------------------------------------------ */

function SellerLane({
  lane,
  winner,
  hasResult,
  responding,
}: {
  lane: Lane;
  winner: boolean;
  hasResult: boolean;
  responding: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const latest = lane.sellerOffers[lane.sellerOffers.length - 1] ?? null;
  const previous =
    lane.sellerOffers.length > 1 ? lane.sellerOffers[lane.sellerOffers.length - 2] : null;
  const price = latest?.price ?? lane.statusPrice;
  const delta = latest && previous ? latest.price - previous.price : null;
  const deltaPercent =
    delta !== null && previous && previous.price !== 0
      ? (delta / previous.price) * 100
      : null;
  const changeNote =
    delta === null
      ? latest
        ? `Opening at ${money(latest.price)}`
        : lane.statusPrice !== null
          ? "Waiting for a final offer"
          : "Waiting for an offer"
      : delta < 0
        ? `Lowered ${money(Math.abs(delta))} from the last offer`
        : delta > 0
          ? `Raised ${money(delta)} from the last offer`
          : "Holding at the same price";

  useEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [lane.offers.length, lane.status]);

  const badge = winner ? (
    <Badge tone="success">
      <Trophy className="size-3" aria-hidden="true" />
      Winner
    </Badge>
  ) : lane.status === "out" ? (
    <Badge tone="danger">Out</Badge>
  ) : lane.status === "deal" && hasResult ? (
    <Badge tone="neutral">Not selected</Badge>
  ) : lane.status === "deal" ? (
    <Badge tone="success">Deal reached</Badge>
  ) : hasResult ? (
    <Badge tone="neutral">Not selected</Badge>
  ) : responding ? (
    <Badge tone="accent" pulse>
      Responding
    </Badge>
  ) : (
    <Badge tone="neutral">Negotiating</Badge>
  );

  return (
    <article
      className={cn(
        "card flex flex-col",
        winner && "border-success-line bg-gradient-to-b from-success-soft/60 via-surface to-surface animate-glow",
        !winner && responding && "border-accent-line",
        !winner && hasResult && lane.status !== "deal" && "opacity-75",
      )}
    >
      <div className="flex items-start justify-between gap-2 border-b border-line px-3.5 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <span
              className="mt-1 size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: lane.color }}
              aria-hidden="true"
            />
            <h3 className="min-w-0 break-words text-[13px] font-semibold leading-snug text-ink">
              {lane.seller}
            </h3>
          </div>
          <p className="mt-0.5 truncate text-[10px] text-faint">
            Round {lane.lastRound || 0}
            {latest
              ? ` · ${Math.round(latest.deposit_percent)}% deposit · ${latest.delivery_days}d`
              : lane.note
                ? ` · ${lane.note}`
                : ""}
          </p>
        </div>
        {badge}
      </div>

      <div className="px-3.5 pb-2.5 pt-2.5">
        <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-faint">
          Current offer
        </p>
        <p
          key={`${price ?? "none"}-${latest?.index ?? "status"}`}
          className="num animate-price mt-0.5 text-[30px] font-semibold leading-[1.08] text-ink"
        >
          {price !== null && price !== undefined ? money(price) : "—"}
        </p>
        <p
          className={cn(
            "mt-1 truncate text-[11px]",
            delta !== null && delta < 0
              ? "text-success"
              : delta !== null && delta > 0
                ? "text-warning"
                : "text-muted",
          )}
          title={deltaPercent !== null ? `${Math.abs(deltaPercent).toFixed(1)}% change` : undefined}
        >
          {changeNote}
        </p>
      </div>

      <div
        ref={scrollRef}
        role="log"
        aria-label={`Conversation with ${lane.seller}`}
        className="h-40 shrink-0 space-y-2 overflow-y-auto border-t border-line/70 px-3 py-2.5 xl:h-32"
      >
        {lane.offers.length === 0 ? (
          <p className="px-1 py-3 text-center text-[11px] text-faint">
            The conversation will appear here.
          </p>
        ) : (
          lane.offers.map((offer) => (
            <div
              key={`${offer.index}-${offer.who}`}
              className={cn(
                "animate-rise max-w-[94%] rounded-panel border px-2.5 py-2",
                offer.who === "buyer"
                  ? "ml-auto border-accent-line bg-accent-soft"
                  : "border-line bg-surface-2/80",
              )}
            >
              <div className="mb-0.5 flex items-baseline justify-between gap-3">
                <span
                  className={cn(
                    "text-[9px] font-semibold uppercase tracking-[0.1em]",
                    offer.who === "buyer" ? "text-accent" : "text-faint",
                  )}
                >
                  {offer.who === "buyer" ? "Your agent" : lane.seller}
                </span>
                <span className="num text-[9px] text-faint">R{offer.round}</span>
              </div>
              <p className="text-[11.5px] leading-snug text-ink/90">{offer.message}</p>
              <p className="num mt-1 text-[10px] text-faint">
                {money(offer.price)} · {Math.round(offer.deposit_percent)}% deposit ·{" "}
                {offer.delivery_days}d
              </p>
            </div>
          ))
        )}
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* Price chart + live offers                                          */
/* ------------------------------------------------------------------ */

function MarketCard({
  lanes,
  offers,
  target,
  running,
  maxRound,
}: {
  lanes: Lane[];
  offers: UiOffer[];
  target: number;
  running: boolean;
  maxRound: number;
}) {
  const [offersOpen, setOffersOpen] = useState(false);

  return (
    <div className="card flex min-h-[380px] flex-col xl:flex-1">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <ChartSpline className="size-4 text-accent" aria-hidden="true" />
          <h2 className="text-[13px] font-semibold text-ink">Price movement</h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setOffersOpen((open) => !open)}
            aria-expanded={offersOpen}
            aria-controls="live-offers-panel"
            className="inline-flex items-center gap-1.5 rounded-control border border-line bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-muted transition-colors hover:text-ink"
          >
            <CircleDollarSign className="size-3.5 text-accent" aria-hidden="true" />
            Live offers
            <span className="num rounded-pill bg-surface-3 px-1.5 text-[10px] text-muted">
              {offers.length}
            </span>
            <ChevronDown
              className={cn(
                "size-3.5 transition-transform",
                offersOpen && "rotate-180",
              )}
              aria-hidden="true"
            />
          </button>
          <Badge tone={running ? "accent" : "neutral"} pulse={running}>
            {running ? "Live" : "Final"}
          </Badge>
        </div>
      </div>

      <PriceChart lanes={lanes} target={target} maxRound={maxRound} />

      {offersOpen ? (
        <div id="live-offers-panel" className="border-t border-line">
          <OffersTable offers={offers} />
        </div>
      ) : null}
    </div>
  );
}

function PriceChart({
  lanes,
  target,
  maxRound,
}: {
  lanes: Lane[];
  target: number;
  maxRound: number;
}) {
  const series = lanes
    .map((lane) => ({ lane, points: lane.sellerOffers }))
    .filter((entry) => entry.points.length > 0);
  const allPrices = series.flatMap((entry) => entry.points.map((point) => point.price));
  const hasData = allPrices.length > 0;

  const values = hasData ? [...allPrices, target] : [target];
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const padding = Math.max(2, (rawMax - rawMin) * 0.16);
  const lo = Math.floor(rawMin - padding);
  const hi = Math.ceil(rawMax + padding);
  const span = Math.max(1, hi - lo);
  const axisMax = Math.max(MAX_ROUNDS, maxRound);
  const ticks = [0, Math.round(axisMax / 2), axisMax];
  const gridValues = [lo, lo + span / 2, hi];

  // Percentages position the HTML dots/labels; the 1000x320 viewBox keeps the
  // SVG lines in sync while `preserveAspectRatio="none"` scales to any width.
  const xPercent = (round: number) => (round / axisMax) * 100;
  const yPercent = (value: number) => (1 - (value - lo) / span) * 100;
  const xCoord = (round: number) => xPercent(round) * 10;
  const yCoord = (value: number) => yPercent(value) * 3.2;
  const targetTop = Math.max(0, Math.min(100, yPercent(target)));
  const targetNearTop = targetTop < 14;

  return (
    <>
      <div
        data-testid="price-chart"
        className="relative min-h-[280px] flex-1 px-3 pb-1 pt-2"
      >
        {hasData ? (
          <div className="relative h-full min-h-[264px]">
            <div className="absolute bottom-7 left-12 right-3 top-3">
              <svg
                viewBox="0 0 1000 320"
                preserveAspectRatio="none"
                className="absolute inset-0 h-full w-full overflow-visible"
                role="img"
                aria-label={`Seller prices by round, with your target of ${money(target)}`}
              >
                {series.map(({ lane, points }) => (
                  <polyline
                    key={lane.seller}
                    points={points
                      .map(
                        (point) =>
                          `${xCoord(point.round)},${yCoord(point.price)}`,
                      )
                      .join(" ")}
                    fill="none"
                    stroke={lane.color}
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </svg>

              {gridValues.map((value, index) => (
                <div
                  key={`grid-${index}`}
                  className="pointer-events-none absolute inset-x-0 border-t border-dashed border-line/60"
                  style={{ top: `${yPercent(value)}%` }}
                  aria-hidden="true"
                />
              ))}

              <div
                className="pointer-events-none absolute inset-x-0 border-t border-dashed border-accent/80"
                style={{ top: `${targetTop}%` }}
                aria-hidden="true"
              />

              {series.map(({ lane, points }) =>
                points.map((point, index) => {
                  const last = index === points.length - 1;
                  return (
                    <span
                      key={`${lane.seller}-${point.index}`}
                      className={cn(
                        "pointer-events-none absolute rounded-full border-2",
                        last ? "size-2.5" : "size-2",
                      )}
                      style={{
                        left: `${xPercent(point.round)}%`,
                        top: `${yPercent(point.price)}%`,
                        transform: "translate(-50%, -50%)",
                        backgroundColor: last ? lane.color : "var(--color-surface)",
                        borderColor: lane.color,
                      }}
                      aria-hidden="true"
                    />
                  );
                }),
              )}

              <span
                className="num pointer-events-none absolute left-0 whitespace-nowrap rounded-pill border border-accent-line bg-surface/90 px-1.5 py-0.5 text-[10px] font-semibold text-accent"
                style={{
                  top: `${targetTop}%`,
                  transform: targetNearTop ? "translateY(8px)" : "translateY(-115%)",
                }}
              >
                Your target {money(target)}
              </span>

              {gridValues.map((value, index) => (
                <span
                  key={`y-label-${index}`}
                  className="num pointer-events-none absolute right-full mr-2 -translate-y-1/2 whitespace-nowrap text-[10px] text-faint"
                  style={{ top: `${yPercent(value)}%` }}
                >
                  ${Math.round(value)}
                </span>
              ))}

              {ticks.map((tick) => (
                <span
                  key={tick}
                  className="pointer-events-none absolute top-full mt-1.5 whitespace-nowrap text-[10px] text-faint"
                  style={{
                    left: `${xPercent(tick)}%`,
                    transform:
                      tick === 0
                        ? "translateX(0)"
                        : tick === axisMax
                          ? "translateX(-100%)"
                          : "translateX(-50%)",
                  }}
                >
                  {tick === 0 ? "Open" : `R${tick}`}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-2 text-center">
            <Activity className="size-5 text-faint" aria-hidden="true" />
            <p className="text-[12px] font-medium text-muted">Prices will appear here</p>
            <p className="text-[10px] text-faint">
              Seller lines appear with their first offer.
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line/70 px-3.5 py-2">
        {lanes.map((lane) => (
          <span
            key={lane.seller}
            className="inline-flex min-w-0 items-center gap-1.5 text-[11px] text-muted sm:text-[12px]"
          >
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: lane.color }}
              aria-hidden="true"
            />
            <span className="min-w-0 truncate">{lane.seller}</span>
          </span>
        ))}
        <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-accent sm:text-[12px]">
          <span className="h-px w-4 border-t border-dashed border-accent" aria-hidden="true" />
          Your target
        </span>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Live offers (AG Grid Community)                                    */
/* ------------------------------------------------------------------ */

const offerColumns: ColDef<UiOffer>[] = [
  {
    headerName: "Side",
    valueGetter: (params) => (params.data?.who === "buyer" ? "Buyer" : "Seller"),
    width: 64,
    cellClass: "text-[11px] text-muted",
  },
  {
    field: "seller",
    headerName: "Seller",
    minWidth: 100,
    flex: 1.2,
    cellClass: "truncate text-[12px] font-medium text-ink",
    tooltipField: "seller",
  },
  {
    field: "price",
    headerName: "Price",
    width: 88,
    valueFormatter: (params) =>
      typeof params.value === "number" ? money(params.value) : "—",
    cellClass: "num text-[12px] font-semibold text-ink",
    headerClass: "ag-right-header",
  },
  {
    headerName: "Terms",
    width: 90,
    valueGetter: (params) =>
      params.data ? `${Math.round(params.data.deposit_percent)}% · ${params.data.delivery_days}d` : "",
    cellClass: "num text-[11px] text-muted",
  },
  {
    headerName: "R",
    width: 48,
    valueGetter: (params) => (params.data ? `R${params.data.round}` : ""),
    cellClass: "num text-[11px] text-faint",
  },
];

function OffersTable({ offers }: { offers: UiOffer[] }) {
  const gridRef = useRef<GridApi<UiOffer> | null>(null);

  useEffect(() => {
    const api = gridRef.current;
    if (!api || offers.length === 0) return;
    api.ensureIndexVisible(offers.length - 1, "bottom");
  }, [offers.length]);

  return (
    <div
      role="region"
      aria-label="Live offers log"
      className="h-[240px] overflow-hidden"
    >
      <DataGrid
        rowData={offers}
        columnDefs={offerColumns}
        getRowId={(params) => String(params.data.index)}
        defaultColDef={{ sortable: true, resizable: true, suppressHeaderMenuButton: true }}
        onGridReady={(params) => {
          gridRef.current = params.api;
          if (offers.length > 0) params.api.ensureIndexVisible(offers.length - 1, "bottom");
        }}
        overlayNoRowsTemplate='<span style="color:#a2a2b2;font-size:12px">Offers appear here as sellers respond.</span>'
        suppressCellFocus
        rowHeight={36}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Winner + payment                                                   */
/* ------------------------------------------------------------------ */

type Winner = NonNullable<NonNullable<ReturnType<typeof useNegotiation>[0]["result"]>["winner"]>;

function WinnerBanner({
  winner,
  productName,
  deal,
  dealId,
  depositAmount,
  balanceAmount,
  savedAmount,
  savedPercent,
  alreadyPaid,
  paying,
  payError,
  onPay,
}: {
  winner: Winner;
  productName: string;
  deal: Deal | null;
  dealId: string | null;
  depositAmount: number;
  balanceAmount: number;
  savedAmount: number;
  savedPercent: number;
  alreadyPaid: boolean;
  paying: boolean;
  payError: string | null;
  onPay: () => void;
}) {
  return (
    <section
      role="status"
      aria-label="Winning deal"
      className="animate-glow mt-2.5 flex shrink-0 flex-col gap-3 rounded-card border border-success-line bg-gradient-to-r from-success-soft via-surface to-surface px-4 py-2.5 shadow-success xl:flex-row xl:items-center xl:justify-between"
    >
      <div className="flex min-w-0 items-center gap-3.5">
        <span className="grid size-11 shrink-0 place-items-center rounded-panel border border-success-line bg-success-soft text-success">
          <Trophy className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-success">
              Deal reached
            </p>
            <Badge tone="neutral" dot={false}>
              <ShoppingBag className="size-3" aria-hidden="true" />
              {productName || "Your purchase"}
            </Badge>
            {deal ? <Badge tone="neutral">{deal.status === "complete" ? "Paid in full" : "Payment due"}</Badge> : null}
          </div>
          <p className="mt-0.5 truncate text-[15px] font-semibold text-ink">
            {winner.seller} accepted at{" "}
            <span className="num text-success">{money(winner.price)}</span>
          </p>
          <p className="mt-0.5 text-[11px] text-muted">
            {savedAmount > 0
              ? `${money(savedAmount)} (${savedPercent.toFixed(1)}%) below list. `
              : ""}
            {Math.round(winner.deposit_percent)}% deposit up front · {winner.delivery_days}-day delivery
          </p>
        </div>
      </div>

      <div className="grid shrink-0 grid-cols-3 gap-2 xl:w-[320px]">
        <div className="rounded-control border border-line bg-surface-2/60 px-2.5 py-1.5">
          <p className="text-[9px] uppercase tracking-[0.1em] text-faint">Now</p>
          <p className="num mt-0.5 text-[14px] font-semibold text-ink">{money(depositAmount)}</p>
        </div>
        <div className="rounded-control border border-line bg-surface-2/60 px-2.5 py-1.5">
          <p className="text-[9px] uppercase tracking-[0.1em] text-faint">On delivery</p>
          <p className="num mt-0.5 text-[14px] font-semibold text-ink">{money(balanceAmount)}</p>
        </div>
        <div className="rounded-control border border-line bg-surface-2/60 px-2.5 py-1.5">
          <p className="text-[9px] uppercase tracking-[0.1em] text-faint">Total</p>
          <p className="num mt-0.5 text-[14px] font-semibold text-ink">{money(winner.price)}</p>
        </div>
      </div>

      <div className="shrink-0">
        {alreadyPaid && dealId ? (
          <ButtonLink href={`/receipt?deal=${dealId}`} variant="success" size="md">
            View receipt
            <ArrowRight className="size-4" aria-hidden="true" />
          </ButtonLink>
        ) : (
          <Button
            variant="success"
            onClick={onPay}
            disabled={!dealId || paying}
            className="w-full min-w-[13.5rem] xl:w-auto"
          >
            {paying ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Opening PayPal…
              </>
            ) : (
              <>
                <Wallet className="size-4" aria-hidden="true" />
                Pay {money(depositAmount)} with PayPal
              </>
            )}
          </Button>
        )}
        <p className="mt-1.5 text-center text-[10px] text-faint xl:text-right">
          {money(balanceAmount)} released after delivery
        </p>
        {payError ? (
          <p role="alert" className="mt-1 max-w-[240px] text-[10px] text-danger">
            {payError}
          </p>
        ) : null}
      </div>
    </section>
  );
}
