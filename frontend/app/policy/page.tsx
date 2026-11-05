"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Handshake,
  LayoutDashboard,
  TrendingUp,
} from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button, ButtonLink, buttonClasses } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import {
  ApiError,
  compilePolicy,
  NEGOTIATE_DEFAULTS,
} from "@/lib/api";
import type { CompiledPolicy } from "@/lib/types";
import { rememberPolicy, setSelectedPolicyId } from "@/lib/policyStore";
import { cn } from "@/lib/cn";

const MAX_RULES = 2000;

const EXAMPLE_RULES =
  "never go below 80% of list, I like a 30% deposit, I can ship in 3 days";

const STEPS = [
  {
    title: "Write the rules",
    body: `Say how you sell in plain English — a price, a floor, a deposit, a delivery time. The backend accepts 1 to ${MAX_RULES} characters.`,
  },
  {
    title: "Compile",
    body: "A model extracts the fields, then code clamps each number to a valid range before the policy is stored in server memory.",
  },
  {
    title: "Join the market",
    body: "The compiled policy is remembered in this browser so the Trading Floor can select it. A live negotiation started with its id adds your shop as a fourth seller; replay mode ignores policies.",
  },
];

/** Ranges are read from `policy_compiler.compile_rules`, not chosen here. */
const COMPILED_FIELDS = [
  {
    label: "Shop name",
    range: "Up to 40 characters",
    note: "Falls back to “My Shop” when the compiler returns nothing.",
  },
  {
    label: "List price",
    range: "At least $1.00",
    note: "The opening price your seller quotes, before any discount.",
  },
  {
    label: "Floor",
    range: "$0 up to the list price",
    note: "The lowest offer your seller accepts. Clamped so it can never exceed list.",
  },
  {
    label: "Deposit",
    range: "0–100%",
    note: "Share of the total captured up front; the balance is due on delivery.",
  },
  {
    label: "Delivery",
    range: "1–30 whole days",
    note: "Fixed for the whole negotiation — the model cannot extend it mid-round.",
  },
  {
    label: "Personality",
    range: "Up to 120 characters",
    note: "A short negotiating style injected into the seller's prompts.",
  },
  {
    label: "Notes",
    range: "Up to 300 characters",
    note: "The compiler's remarks about numbers it had to assume.",
  },
];

const GUARDRAILS = [
  "An offer below the shop's floor is rejected and corrected in code before it is recorded.",
  "A seller reply cannot change the declared delivery time; code resets it on every round.",
  `The buyer's delivery cap is fixed at ${NEGOTIATE_DEFAULTS.maxDeliveryDays} days, so a slower seller is marked out during the opening offers.`,
  "The buyer never accepts above its budget, nor above its target while rounds remain.",
  "A shop name that matches a default seller (Firm Co, Flex Ltd, Premium Hub) gets “ (You)” appended, so lanes stay distinct.",
  "Policies live in server memory only. There is no endpoint to list, reload or edit one after it is compiled.",
];

const NEXT_LINKS = [
  {
    href: "/trading-floor",
    label: "Trading Floor",
    body: "Run and watch a live negotiation.",
    icon: Handshake,
  },
  {
    href: "/benchmark",
    label: "Benchmark",
    body: "See recorded runs and guard results.",
    icon: TrendingUp,
  },
  {
    href: "/",
    label: "Overview",
    body: "How the whole flow fits together.",
    icon: LayoutDashboard,
  },
];

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

type Status = "idle" | "compiling" | "success" | "error";

export default function PolicyPage() {
  const [rules, setRules] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [policy, setPolicy] = useState<CompiledPolicy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const trimmed = rules.trim();
  const rulesError =
    trimmed.length === 0
      ? "Write at least one rule before compiling."
      : rules.length > MAX_RULES
        ? `Keep the rules to ${MAX_RULES} characters or fewer.`
        : null;
  const showRulesError = Boolean(rulesError) && touched;
  const compiling = status === "compiling";

  async function submit() {
    setTouched(true);
    if (rulesError) return;

    setStatus("compiling");
    setError(null);
    setPolicy(null);

    try {
      const compiled = await compilePolicy(trimmed);
      rememberPolicy(compiled);
      setPolicy(compiled);
      setStatus("success");
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : "The compiler could not be reached. Check that the backend is running, then try again.",
      );
      setStatus("error");
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit();
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Seller Console"
        title="Seller Policy"
        description="Describe how your shop sells in plain English. The compiler turns those rules into a structured seller policy — name, list price, floor, deposit and delivery — that the negotiation engine enforces in code."
        actions={
          <ButtonLink href="/trading-floor" variant="secondary">
            Open Trading Floor
          </ButtonLink>
        }
      />

      <ol className="grid gap-3 sm:grid-cols-3">
        {STEPS.map((step, index) => (
          <li
            key={step.title}
            className="rounded-panel border border-line bg-surface p-4"
          >
            <span className="font-mono text-[11px] text-lavender">
              {String(index + 1).padStart(2, "0")}
            </span>
            <h2 className="mt-1.5 text-sm font-semibold text-ink">
              {step.title}
            </h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">
              {step.body}
            </p>
          </li>
        ))}
      </ol>

      <section aria-labelledby="compile-heading" className="space-y-4">
        <div className="space-y-1">
          <h2
            id="compile-heading"
            className="text-lg font-semibold tracking-[-0.01em] text-ink"
          >
            Compile your rules
          </h2>
          <p className="max-w-2xl text-sm leading-relaxed text-muted">
            Nothing is sent until you compile. The result is a new policy, not an
            edit of an earlier one.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          aria-busy={compiling}
          className="rounded-panel border border-line bg-surface p-5 sm:p-6"
        >
          <label htmlFor="rules" className="block text-sm font-medium text-ink">
            Selling rules
          </label>
          <p
            id="rules-help"
            className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted"
          >
            Mention any prices, percentages, delivery times or shop name you care
            about. Numbers the compiler has to guess are listed in its notes.
          </p>

          <textarea
            id="rules"
            name="rules"
            rows={7}
            value={rules}
            onChange={(event) => setRules(event.target.value)}
            maxLength={MAX_RULES}
            placeholder="e.g. never go below 80% of list, I like a 30% deposit, I can ship in 3 days"
            aria-invalid={showRulesError || undefined}
            aria-describedby={
              showRulesError
                ? "rules-help rules-count rules-error"
                : "rules-help rules-count"
            }
            className={cn(
              "mt-3 w-full resize-y rounded-lg border bg-surface-2 px-3 py-2.5 text-sm leading-relaxed text-ink transition-colors placeholder:text-muted focus:border-accent",
              showRulesError ? "border-danger" : "border-line",
            )}
          />

          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p
              id="rules-count"
              className="font-mono text-[11px] tabular-nums text-muted"
            >
              {rules.length} / {MAX_RULES} characters
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setRules(EXAMPLE_RULES);
                setTouched(false);
              }}
            >
              Fill in an example
            </Button>
          </div>

          {showRulesError ? (
            <p id="rules-error" role="alert" className="mt-2 text-[12px] text-danger">
              {rulesError}
            </p>
          ) : null}

          <div className="mt-5 flex flex-col gap-2 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[12px] leading-relaxed text-muted">
              Compiling calls the model, so it can take a few seconds and may fail
              when the free tier is busy.
            </p>
            <Button type="submit" disabled={compiling} className="shrink-0">
              {compiling ? "Compiling…" : "Compile policy"}
            </Button>
          </div>

          <p role="status" className="sr-only">
            {compiling
              ? "Compiling your rules."
              : status === "success"
                ? "Policy compiled."
                : ""}
          </p>
        </form>

        {compiling ? (
          <LoadingState
            variant="pulse"
            description="Reading your rules and settling on the policy fields…"
          />
        ) : null}

        {status === "error" && error ? (
          <ErrorState
            title="The policy did not compile"
            description={error}
            action={
              <Button variant="secondary" onClick={() => void submit()}>
                Try again
              </Button>
            }
          />
        ) : null}

        {status === "success" && policy ? (
          <CompiledPolicyCard policy={policy} />
        ) : null}

        {status === "idle" ? (
          <EmptyState
            title="No policy compiled in this session"
            description="Your compiled fields appear here. The backend exposes no endpoint for listing or reloading policies, so earlier ones cannot be shown — and a server restart clears them."
          />
        ) : null}
      </section>

      <section aria-labelledby="reference-heading" className="space-y-4">
        <div className="space-y-1">
          <h2
            id="reference-heading"
            className="text-lg font-semibold tracking-[-0.01em] text-ink"
          >
            What you control, and what code decides
          </h2>
          <p className="max-w-2xl text-sm leading-relaxed text-muted">
            Your rules set the numbers. The ranges below are applied afterwards and
            cannot be overridden from this screen.
          </p>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-panel border border-line bg-surface p-5 sm:p-6">
            <h3 className="text-sm font-semibold text-ink">
              Fields the compiler extracts
            </h3>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">
              Every value is clamped to its range after the model responds.
            </p>
            <ul className="mt-4">
              {COMPILED_FIELDS.map((field) => (
                <li
                  key={field.label}
                  className="grid gap-1 border-t border-line/70 py-3 first:border-0 first:pt-0 sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:gap-4"
                >
                  <p className="text-[13px] font-medium text-ink">
                    {field.label}
                  </p>
                  <div className="min-w-0">
                    <p className="font-mono text-[12px] text-lavender">
                      {field.range}
                    </p>
                    <p className="mt-0.5 text-[13px] leading-relaxed text-muted">
                      {field.note}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-panel border border-line bg-surface p-5 sm:p-6">
            <h3 className="text-sm font-semibold text-ink">
              Fixed guardrails
            </h3>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">
              Enforced by the negotiation engine on both sides of the table.
            </p>
            <ul className="mt-4 space-y-2.5">
              {GUARDRAILS.map((guard) => (
                <li key={guard} className="flex gap-2.5">
                  <span
                    className="mt-[7px] size-1.5 shrink-0 rounded-full bg-lavender"
                    aria-hidden="true"
                  />
                  <span className="text-[13px] leading-relaxed text-muted">
                    {guard}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <nav aria-labelledby="next-heading" className="space-y-3">
        <h2
          id="next-heading"
          className="text-[11px] font-medium uppercase tracking-[0.08em] text-lavender"
        >
          Where to next
        </h2>
        <ul className="grid gap-3 sm:grid-cols-3">
          {NEXT_LINKS.map((link) => {
            const Icon = link.icon;

            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="group flex h-full items-start gap-3 rounded-panel border border-line bg-surface p-4 transition-colors duration-150 hover:border-line-strong hover:bg-surface-2"
                >
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-lavender-linethin bg-lavender-soft">
                    <Icon className="size-4 text-lavender" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
                      {link.label}
                      <ArrowRight
                        className="size-3.5 text-lavender transition-transform duration-150 group-hover:translate-x-0.5"
                        aria-hidden="true"
                      />
                    </span>
                    <span className="mt-0.5 block text-[13px] leading-relaxed text-muted">
                      {link.body}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

function CompiledPolicyCard({ policy }: { policy: CompiledPolicy }) {
  const floorShare =
    policy.list_price > 0
      ? Math.round((policy.floor / policy.list_price) * 100)
      : 0;
  const tooSlow = policy.delivery_days > NEGOTIATE_DEFAULTS.maxDeliveryDays;

  return (
    <section
      aria-labelledby="result-heading"
      className="rounded-panel border border-line bg-surface p-5 sm:p-6"
    >
      <div className="flex flex-col gap-3 border-b border-line pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-medium text-success">
            <Check className="size-3" aria-hidden="true" />
            Compiled
          </span>
          <h3
            id="result-heading"
            className="mt-2 text-base font-semibold text-ink"
          >
            {policy.name}
          </h3>
          <p className="mt-1 break-all font-mono text-[11px] text-muted">
            policy_id {policy.policy_id}
          </p>
        </div>
        <p className="text-[12px] leading-relaxed text-muted sm:max-w-[16rem] sm:text-right">
          Held in server memory. A server restart clears it.
        </p>
      </div>

      <dl className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2">
        <Fact label="List price" value={usd.format(policy.list_price)} mono />
        <Fact
          label="Floor"
          value={usd.format(policy.floor)}
          hint={`${floorShare}% of the list price`}
          mono
        />
        <Fact
          label="Deposit"
          value={`${formatNumber(policy.deposit_percent)}%`}
          hint="Captured up front through PayPal"
          mono
        />
        <Fact
          label="Delivery"
          value={`${policy.delivery_days} ${policy.delivery_days === 1 ? "day" : "days"}`}
          hint="Fixed for every round"
          mono
        />
        <Fact
          label="Personality"
          value={policy.personality || "—"}
          className="sm:col-span-2"
        />
        <Fact
          label="Notes"
          value={policy.notes || "—"}
          className="sm:col-span-2"
        />
      </dl>

      {tooSlow ? (
        <p className="mt-4 flex gap-2.5 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2.5 text-[13px] leading-relaxed text-warning">
          <AlertTriangle
            className="mt-0.5 size-4 shrink-0"
            aria-hidden="true"
          />
          This policy promises {policy.delivery_days} days, beyond the buyer’s
          fixed {NEGOTIATE_DEFAULTS.maxDeliveryDays}-day cap. That seller would be
          marked out during the opening offers instead of competing.
        </p>
      ) : null}

      <div className="mt-5 flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-md text-[12px] leading-relaxed text-muted">
          Saved in this browser so the Trading Floor can offer it for the next
          negotiation. The policy itself stays in backend memory.
        </p>
        <Link
          href="/trading-floor"
          onClick={() => setSelectedPolicyId(policy.policy_id)}
          className={buttonClasses("primary", "sm", "shrink-0")}
        >
          Use in a negotiation
        </Link>
      </div>
    </section>
  );
}

function Fact({
  label,
  value,
  hint,
  mono = false,
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-1 break-words text-[13px] text-ink",
          mono && "font-mono",
        )}
      >
        {value}
      </dd>
      {hint ? (
        <p className="mt-0.5 text-[12px] leading-relaxed text-muted">{hint}</p>
      ) : null}
    </div>
  );
}
