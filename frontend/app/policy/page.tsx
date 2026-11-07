"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CircleDollarSign,
  Handshake,
  Loader2,
  PackageCheck,
  Percent,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Store,
  Trash2,
  Wand2,
} from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/LoadingState";
import { ApiError, compilePolicy, NEGOTIATE_DEFAULTS } from "@/lib/api";
import type { CompiledPolicy } from "@/lib/types";
import {
  forgetPolicy,
  rememberPolicy,
  setSelectedPolicyId,
  useSavedPolicies,
  useSelectedPolicyId,
} from "@/lib/policyStore";
import { cn } from "@/lib/cn";

const MAX_RULES = 2000;

const EXAMPLES = [
  {
    label: "Balanced",
    rules:
      "I'm Northwind Supply. List at $120, never go below $96, a 30% deposit, and I can deliver in 4 days. Friendly but firm.",
  },
  {
    label: "Premium",
    rules:
      "My shop is Studio Supply. List price $240, floor $204, 40% deposit, delivery in 2 days. Premium quality, confident tone.",
  },
  {
    label: "Volume",
    rules:
      "Call me Bulk Barn. List at $75, accept down to $60, 15% deposit, 6-day delivery. Compete on volume and speed.",
  },
];

const RULES_OF_ENGAGEMENT = [
  {
    icon: CircleDollarSign,
    title: "Your floor holds",
    body: "Your agent will never accept below the floor in your policy. If the buyer cannot reach it, the seller walks away.",
  },
  {
    icon: Percent,
    title: "Deposit is fixed",
    body: "The deposit percentage you set is what the buyer pays up front through PayPal. It does not change mid-negotiation.",
  },
  {
    icon: PackageCheck,
    title: "Delivery is fixed",
    body: `Your delivery time is locked for every round. This buyer looks for ${NEGOTIATE_DEFAULTS.maxDeliveryDays} days or fewer.`,
  },
  {
    icon: ShieldCheck,
    title: "The buyer has limits too",
    body: "The buyer never goes above its budget, and keeps pushing toward its target while rounds remain.",
  },
];

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatPercent(value: number): string {
  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
}

type Status = "idle" | "building" | "success" | "error";

export default function PolicyPage() {
  const [rules, setRules] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [policy, setPolicy] = useState<CompiledPolicy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const savedPolicies = useSavedPolicies();
  const selectedPolicyId = useSelectedPolicyId();

  const trimmed = rules.trim();
  const rulesError =
    trimmed.length === 0
      ? "Write at least one rule before building your policy."
      : rules.length > MAX_RULES
        ? `Keep your rules to ${MAX_RULES} characters or fewer.`
        : null;
  const showRulesError = Boolean(rulesError) && touched;
  const building = status === "building";

  async function submit() {
    setTouched(true);
    if (rulesError) return;

    setStatus("building");
    setError(null);

    try {
      const compiled = await compilePolicy(trimmed);
      rememberPolicy(compiled);
      setPolicy(compiled);
      setStatus("success");
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : "We could not build that policy. Check your connection, then try again.",
      );
      setStatus("error");
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit();
  }

  function chooseExample(example: string) {
    setRules(example);
    setTouched(false);
    setStatus("idle");
    setError(null);
    setPolicy(null);
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Seller console"
        title="Seller Policy"
        description="Describe how you sell, in your own words. Haggle turns it into clear rules your seller agent follows for every offer."
        actions={
          <>
            <Badge tone="neutral" dot={false}>
              <ScrollText className="size-3" aria-hidden="true" />
              No code
            </Badge>
            <Link
              href="/trading-floor"
              className={buttonClasses("secondary", "md")}
            >
              Open Trading Floor
            </Link>
          </>
        }
      />

      <div className="grid items-start gap-4 xl:grid-cols-[1.02fr_0.98fr]">
        {/* Composer --------------------------------------------------- */}
        <section aria-labelledby="composer-heading" className="card">
          <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div>
              <p className="label mb-1.5 text-accent">Step 1 · Describe</p>
              <h2 id="composer-heading" className="text-h3 font-semibold text-ink">
                Your selling rules
              </h2>
              <p className="mt-0.5 text-small text-muted">
                Plain English. Prices, percentages and delivery times all help.
              </p>
            </div>
            <span className="num shrink-0 rounded-pill border border-line bg-surface-2 px-2 py-1 text-[10px] text-faint">
              {savedPolicies.length}/8 saved
            </span>
          </div>

          <form onSubmit={handleSubmit} aria-busy={building} className="p-5">
            <label htmlFor="rules" className="block text-[13px] font-medium text-ink">
              How should your seller behave?
            </label>
            <p id="rules-help" className="mt-1 text-small leading-relaxed text-muted">
              Include your shop name, list price, lowest accepted price, deposit and
              delivery time. Anything you leave out gets a sensible default, noted below
              the preview.
            </p>

            <textarea
              id="rules"
              name="rules"
              rows={7}
              value={rules}
              onChange={(event) => setRules(event.target.value)}
              onBlur={() => setTouched(true)}
              maxLength={MAX_RULES}
              placeholder="e.g. I'm Northwind Supply. List at $120, never go below $96, 30% deposit, delivery in 4 days."
              aria-invalid={showRulesError || undefined}
              aria-describedby={
                showRulesError ? "rules-help rules-count rules-error" : "rules-help rules-count"
              }
              className={cn(
                "field mt-3 h-auto min-h-[176px] resize-y py-3 leading-relaxed",
                showRulesError && "border-danger-line",
              )}
            />

            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <p id="rules-count" className="num text-[11px] text-faint">
                {rules.length} / {MAX_RULES}
              </p>
              <span className="text-[11px] text-faint">Nothing is shared until you build.</span>
            </div>

            {showRulesError ? (
              <p id="rules-error" role="alert" className="mt-2 text-[12px] text-danger">
                {rulesError}
              </p>
            ) : null}

            <div className="mt-5 border-t border-line pt-4">
              <p className="label mb-2">Try an example</p>
              <div className="flex flex-wrap gap-2">
                {EXAMPLES.map((example) => (
                  <button
                    key={example.label}
                    type="button"
                    onClick={() => chooseExample(example.rules)}
                    disabled={building}
                    className="inline-flex h-8 items-center gap-1.5 rounded-pill border border-line bg-surface-2 px-3 text-[12px] font-medium text-muted transition-colors duration-150 hover:border-accent-line hover:bg-accent-soft hover:text-ink disabled:opacity-50"
                  >
                    <Wand2 className="size-3 text-accent" aria-hidden="true" />
                    {example.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[12px] leading-relaxed text-muted">
                Building takes a few seconds. Each build creates a new policy.
              </p>
              <Button type="submit" disabled={building} className="shrink-0">
                {building ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    Building…
                  </>
                ) : (
                  <>
                    <Sparkles className="size-4" aria-hidden="true" />
                    Build policy
                  </>
                )}
              </Button>
            </div>

            <p role="status" className="sr-only">
              {building
                ? "Building your policy."
                : status === "success"
                  ? "Policy ready."
                  : ""}
            </p>
          </form>
        </section>

        {/* Preview ---------------------------------------------------- */}
        <section aria-labelledby="preview-heading" className="card min-h-[420px]">
          <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
            <div>
              <p className="label mb-1.5 text-accent">Step 2 · Review</p>
              <h2 id="preview-heading" className="text-h3 font-semibold text-ink">
                Policy preview
              </h2>
            </div>
            {status === "success" && policy ? (
              <Badge tone="success">
                <Check className="size-3" aria-hidden="true" />
                Ready
              </Badge>
            ) : (
              <Badge tone="neutral">{building ? "Building" : "Waiting"}</Badge>
            )}
          </div>

          <div className="p-5">
            {building ? (
              <div role="status" aria-busy="true" aria-label="Building policy preview">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="mt-3 h-7 w-2/3" />
                <div className="mt-6 grid grid-cols-2 gap-3">
                  <Skeleton className="h-20 w-full" rounded="rounded-panel" />
                  <Skeleton className="h-20 w-full" rounded="rounded-panel" />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-3">
                  <Skeleton className="h-14 w-full" rounded="rounded-panel" />
                  <Skeleton className="h-14 w-full" rounded="rounded-panel" />
                  <Skeleton className="h-14 w-full" rounded="rounded-panel" />
                </div>
                <Skeleton className="mt-5 h-10 w-full" rounded="rounded-control" />
              </div>
            ) : status === "error" && error ? (
              <ErrorState
                title="That policy did not build"
                description={error}
                action={
                  <Button variant="secondary" onClick={() => void submit()}>
                    Try again
                  </Button>
                }
              />
            ) : status === "success" && policy ? (
              <PolicyPreview
                policy={policy}
                onUse={() => setSelectedPolicyId(policy.policy_id)}
              />
            ) : (
              <PreviewPlaceholder />
            )}
          </div>
        </section>
      </div>

      {/* Saved policies ------------------------------------------------ */}
      <section aria-labelledby="saved-heading">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="label mb-1.5 text-accent">Step 3 · Use</p>
            <h2 id="saved-heading" className="text-h2 font-semibold text-ink">
              Saved policies
            </h2>
            <p className="mt-1 max-w-xl text-body text-muted">
              Pick the policy your next negotiation should use. Saved policies stay in
              this browser for this session.
            </p>
          </div>
          {selectedPolicyId ? (
            <Badge tone="accent">
              <Check className="size-3" aria-hidden="true" />
              One selected
            </Badge>
          ) : null}
        </div>

        {savedPolicies.length === 0 ? (
          <EmptyState
            icon={Store}
            title="No saved policies yet"
            description="Build your first policy above. It will appear here, ready to use on the Trading Floor."
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => document.getElementById("rules")?.focus()}
              >
                Start with your rules
              </Button>
            }
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {savedPolicies.map((saved) => {
              const selected = saved.policy_id === selectedPolicyId;
              return (
                <li key={saved.policy_id}>
                  <article
                    className={cn(
                      "card flex h-full flex-col p-4 transition-colors",
                      selected && "border-accent-line bg-accent-soft/30",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="truncate text-[14px] font-semibold text-ink">
                          {saved.name}
                        </h3>
                        <p className="mt-0.5 text-[11px] text-faint">
                          {selected ? "Used by your next negotiation" : "Saved policy"}
                        </p>
                      </div>
                      {selected ? (
                        <Badge tone="accent">In use</Badge>
                      ) : (
                        <span className="grid size-7 shrink-0 place-items-center rounded-control border border-line bg-surface-2 text-faint">
                          <ScrollText className="size-3.5" aria-hidden="true" />
                        </span>
                      )}
                    </div>

                    <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-line/70 pt-3">
                      <div>
                        <dt className="text-[10px] uppercase tracking-[0.08em] text-faint">
                          List
                        </dt>
                        <dd className="num mt-0.5 text-[13px] font-medium text-ink">
                          {usd.format(saved.list_price)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[10px] uppercase tracking-[0.08em] text-faint">
                          Floor
                        </dt>
                        <dd className="num mt-0.5 text-[13px] font-medium text-ink">
                          {usd.format(saved.floor)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[10px] uppercase tracking-[0.08em] text-faint">
                          Deposit
                        </dt>
                        <dd className="num mt-0.5 text-[13px] font-medium text-ink">
                          {formatPercent(saved.deposit_percent)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[10px] uppercase tracking-[0.08em] text-faint">
                          Delivery
                        </dt>
                        <dd className="num mt-0.5 text-[13px] font-medium text-ink">
                          {saved.delivery_days}d
                        </dd>
                      </div>
                    </dl>

                    <div className="mt-auto flex items-center gap-2 pt-4">
                      <Link
                        href="/trading-floor"
                        onClick={() => setSelectedPolicyId(saved.policy_id)}
                        className={buttonClasses(
                          selected ? "secondary" : "primary",
                          "sm",
                          "flex-1",
                        )}
                      >
                        {selected ? "Negotiate with it" : "Use policy"}
                        <ArrowRight className="size-3.5" aria-hidden="true" />
                      </Link>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Remove ${saved.name}`}
                        title="Remove policy"
                        onClick={() => forgetPolicy(saved.policy_id)}
                        className="px-2"
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                      </Button>
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Enforcement reference ---------------------------------------- */}
      <section aria-labelledby="enforcement-heading" className="card p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="label mb-1.5 text-accent">What your agent enforces</p>
            <h2 id="enforcement-heading" className="text-h2 font-semibold text-ink">
              Clear rules, every round
            </h2>
          </div>
          <p className="max-w-md text-small leading-relaxed text-faint">
            Your policy is checked before every offer. Recorded replays follow their
            original script, so they do not use saved policies.
          </p>
        </div>

        <div className="mt-5 grid gap-x-8 gap-y-5 border-t border-line pt-5 sm:grid-cols-2 xl:grid-cols-4">
          {RULES_OF_ENGAGEMENT.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.title} className="flex gap-3">
                <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-control border border-line bg-surface-2 text-accent">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <div>
                  <h3 className="text-[13px] font-semibold text-ink">{item.title}</h3>
                  <p className="mt-0.5 text-small leading-relaxed text-muted">{item.body}</p>
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-5 flex items-center gap-2 border-t border-line pt-4 text-micro text-faint">
          <Handshake className="size-3.5" aria-hidden="true" />
          Policies are kept for this browser session. Building a new policy does not
          replace the old one.
        </p>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Preview states                                                     */
/* ------------------------------------------------------------------ */

function PreviewPlaceholder() {
  const rows = [
    { label: "Shop name", value: "Your shop" },
    { label: "List price", value: "$—" },
    { label: "Floor", value: "$—" },
    { label: "Deposit", value: "—%" },
    { label: "Delivery", value: "— days" },
  ];

  return (
    <div className="flex min-h-[340px] flex-col justify-between gap-6">
      <div>
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-panel border border-line bg-surface-2 text-faint">
            <FileTextIcon />
          </span>
          <div>
            <p className="text-[13px] font-medium text-ink">Your terms appear here</p>
            <p className="text-[11px] text-faint">Clear fields, no guesswork</p>
          </div>
        </div>

        <dl className="mt-5 space-y-2.5">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex items-center justify-between gap-4 rounded-control border border-dashed border-line-strong/60 px-3 py-2"
            >
              <dt className="text-[12px] text-muted">{row.label}</dt>
              <dd className="num text-[12px] text-faint">{row.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <p className="rounded-panel border border-accent-line/50 bg-accent-soft/40 px-3.5 py-3 text-[12px] leading-relaxed text-muted">
        Write your rules, then build the policy. You will see every number before it is
        used in a negotiation.
      </p>
    </div>
  );
}

function FileTextIcon() {
  return <ScrollText className="size-4" aria-hidden="true" />;
}

function PolicyPreview({
  policy,
  onUse,
}: {
  policy: CompiledPolicy;
  onUse: () => void;
}) {
  const floorShare =
    policy.list_price > 0 ? Math.round((policy.floor / policy.list_price) * 100) : 0;
  const tooSlow = policy.delivery_days > NEGOTIATE_DEFAULTS.maxDeliveryDays;

  return (
    <div className="animate-rise">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="label text-faint">Shop</p>
          <h3 className="mt-1 truncate text-[20px] font-semibold tracking-[-0.02em] text-ink">
            {policy.name}
          </h3>
          <p className="mt-0.5 text-[11px] text-faint">
            Every number below is fixed for the negotiation.
          </p>
        </div>
        <span className="grid size-9 shrink-0 place-items-center rounded-panel border border-success-line bg-success-soft text-success">
          <Check className="size-4" aria-hidden="true" />
        </span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2.5">
        <div className="rounded-panel border border-line bg-surface-2/60 px-3.5 py-3">
          <p className="text-[10px] uppercase tracking-[0.1em] text-faint">List price</p>
          <p className="num mt-1 text-[22px] font-semibold leading-none text-ink">
            {usd.format(policy.list_price)}
          </p>
        </div>
        <div className="rounded-panel border border-accent-line bg-accent-soft/50 px-3.5 py-3">
          <p className="text-[10px] uppercase tracking-[0.1em] text-accent">Your floor</p>
          <p className="num mt-1 text-[22px] font-semibold leading-none text-ink">
            {usd.format(policy.floor)}
          </p>
          <p className="mt-1 text-[10px] text-muted">{floorShare}% of list · never below</p>
        </div>
      </div>

      <div className="mt-2.5 grid grid-cols-3 gap-2.5">
        <div className="rounded-control border border-line bg-surface-2/60 px-2.5 py-2">
          <p className="text-[9px] uppercase tracking-[0.08em] text-faint">Deposit</p>
          <p className="num mt-0.5 text-[13px] font-semibold text-ink">
            {formatPercent(policy.deposit_percent)}
          </p>
        </div>
        <div className="rounded-control border border-line bg-surface-2/60 px-2.5 py-2">
          <p className="text-[9px] uppercase tracking-[0.08em] text-faint">Delivery</p>
          <p className="num mt-0.5 text-[13px] font-semibold text-ink">
            {policy.delivery_days}d
          </p>
        </div>
        <div className="rounded-control border border-line bg-surface-2/60 px-2.5 py-2">
          <p className="text-[9px] uppercase tracking-[0.08em] text-faint">Deposit due</p>
          <p className="num mt-0.5 text-[13px] font-semibold text-ink">
            {usd.format((policy.list_price * policy.deposit_percent) / 100)}
          </p>
        </div>
      </div>

      <div className="mt-4 h-1.5 overflow-hidden rounded-pill bg-surface-3" aria-hidden="true">
        <div
          className="h-full rounded-pill bg-gradient-to-r from-accent to-info"
          style={{ width: `${Math.min(100, Math.max(0, floorShare))}%` }}
        />
      </div>
      <p className="mt-1 text-[10px] text-faint">
        Room to negotiate: {usd.format(Math.max(0, policy.list_price - policy.floor))} below
        list before your floor.
      </p>

      <dl className="mt-4 space-y-2 border-t border-line pt-4">
        <div className="flex gap-3">
          <dt className="w-[92px] shrink-0 text-[11px] text-faint">Style</dt>
          <dd className="min-w-0 text-[12px] leading-relaxed text-muted">
            {policy.personality || "No particular style given."}
          </dd>
        </div>
        <div className="flex gap-3">
          <dt className="w-[92px] shrink-0 text-[11px] text-faint">Assumptions</dt>
          <dd className="min-w-0 text-[12px] leading-relaxed text-muted">
            {policy.notes || "Everything in your rules was clear."}
          </dd>
        </div>
      </dl>

      {tooSlow ? (
        <p className="mt-4 flex gap-2 rounded-control border border-warning-line bg-warning-soft px-3 py-2.5 text-[12px] leading-relaxed text-warning">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {policy.delivery_days}-day delivery is beyond this buyer&apos;s{" "}
          {NEGOTIATE_DEFAULTS.maxDeliveryDays}-day limit. The seller may be passed over
          before the first round.
        </p>
      ) : null}

      <div className="mt-5 flex flex-col gap-2 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[11px] leading-relaxed text-faint">
          Saved automatically. Use it in your next live negotiation.
        </p>
        <Link
          href="/trading-floor"
          onClick={onUse}
          className={buttonClasses("primary", "md", "shrink-0")}
        >
          Use in a negotiation
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
