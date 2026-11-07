import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Handshake,
  ReceiptText,
  ScrollText,
  ShieldCheck,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { SandboxBadge } from "@/components/shell/SandboxBadge";
import { NEGOTIATE_DEFAULTS } from "@/lib/api";
import { cn } from "@/lib/cn";

export const metadata: Metadata = {
  title: { absolute: "Haggle — AI negotiation, settled with PayPal" },
  description:
    "An AI buyer agent negotiates price, deposit and delivery with several seller agents at once, ranks the final offers, and settles the winning deal through PayPal.",
};

const STEPS = [
  {
    title: "Set the mandate",
    body: "Item, budget, target price and a 7-day delivery cap. The agent cannot accept terms outside them.",
  },
  {
    title: "Negotiate in parallel",
    body: "Buyer and seller agents trade offers over several rounds.",
  },
  {
    title: "Rank the offers",
    body: "Final offers are scored on price, deposit and delivery.",
  },
  {
    title: "Settle through PayPal",
    body: "The full amount is authorized; the deposit is captured up front and the balance on delivery.",
  },
];

type Feature = {
  href: string;
  title: string;
  body: string;
  cta: string;
  icon: LucideIcon;
};

const FEATURES: Feature[] = [
  {
    href: "/trading-floor",
    title: "Trading Floor",
    body: "Watch every seller respond round by round, and the deal the buyer agent accepts.",
    cta: "Open the floor",
    icon: Handshake,
  },
  {
    href: "/policy",
    title: "Seller Policy",
    body: "Turn plain-English pricing rules into a seller agent that competes in the market.",
    cta: "Write a policy",
    icon: ScrollText,
  },
  {
    href: "/benchmark",
    title: "Benchmark",
    body: "Fixed-seed runs checked against budget, price floor and delivery deadline.",
    cta: "See the scenarios",
    icon: TrendingUp,
  },
  {
    href: "/receipt",
    title: "Deal & receipt",
    body: "Agreed terms, deposit, balance and payment status.",
    cta: "View settlement",
    icon: ReceiptText,
  },
];

const GUARDS = [
  "A seller offer below its price floor is rejected and corrected.",
  "An acceptance above budget, or above target while rounds remain, is blocked.",
  "Competing prices must come from another seller's real offer.",
  "A seller cannot promise a delivery time it cannot meet.",
];

export default function OverviewPage() {
  return (
    <div className="space-y-10">
      {/* Hero ------------------------------------------------------------- */}
      <section
        aria-labelledby="hero-heading"
        className="relative overflow-hidden rounded-panel border border-line bg-surface"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-accent/10 blur-3xl"
        />
        <div className="relative grid gap-8 p-6 sm:p-8 xl:grid-cols-[minmax(0,1fr)_19rem] xl:items-center xl:gap-10">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-lavender">
              AI negotiation sandbox
            </p>
            <h1
              id="hero-heading"
              className="mt-3 text-3xl font-semibold leading-[1.15] tracking-[-0.02em] text-ink sm:text-4xl"
            >
              Let an AI buyer haggle with every seller at once.
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted sm:text-[15px]">
              Set one mandate — item, budget, target price. A buyer agent negotiates
              price, deposit and delivery with several sellers at once, then settles
              the winning deal through PayPal.
            </p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center">
              <ButtonLink href="/trading-floor">Open Trading Floor</ButtonLink>
              <ButtonLink href="/policy" variant="secondary">
                Write seller rules
              </ButtonLink>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <SandboxBadge />
            </div>
          </div>

          <div className="rounded-panel border border-line bg-surface-2/60 p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-lavender">
                Example mandate
              </p>
              <span className="rounded-md border border-lavender-linethin bg-lavender-soft px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.06em] text-lavender">
                Hard limit
              </span>
            </div>
            <dl className="mt-4">
              <MandateRow label="Item" value={NEGOTIATE_DEFAULTS.item} />
              <MandateRow
                label="Budget"
                value={`$${NEGOTIATE_DEFAULTS.budget.toFixed(2)}`}
                mono
              />
              <MandateRow
                label="Target price"
                value={`$${NEGOTIATE_DEFAULTS.target.toFixed(2)}`}
                mono
              />
              <MandateRow
                label="Delivery"
                value={`${NEGOTIATE_DEFAULTS.maxDeliveryDays} days max`}
              />
            </dl>
            <p className="mt-4 border-t border-line pt-3 text-[11px] leading-relaxed text-muted">
              Backend defaults.
            </p>
          </div>
        </div>
      </section>

      {/* How it works ----------------------------------------------------- */}
      <section aria-labelledby="how-heading" className="space-y-4">
        <div className="space-y-1">
          <h2
            id="how-heading"
            className="text-lg font-semibold tracking-[-0.01em] text-ink"
          >
            How a negotiation runs
          </h2>
        </div>

        <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {STEPS.map((step, index) => (
            <li
              key={step.title}
              className="rounded-panel border border-line bg-surface p-5"
            >
              <span className="font-mono text-[11px] text-lavender">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-2 text-sm font-semibold text-ink">{step.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Workspace destinations ------------------------------------------- */}
      <section aria-labelledby="features-heading" className="space-y-4">
        <div className="space-y-1">
          <h2
            id="features-heading"
            className="text-lg font-semibold tracking-[-0.01em] text-ink"
          >
            Explore the workspace
          </h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {FEATURES.map((feature) => {
            const Icon = feature.icon;

            return (
              <Link
                key={feature.href}
                href={feature.href}
                className="group flex flex-col rounded-panel border border-line bg-surface p-5 transition-colors duration-150 hover:border-line-strong hover:bg-surface-2"
              >
                <span className="flex size-9 items-center justify-center rounded-lg border border-lavender-linethin bg-lavender-soft">
                  <Icon className="size-[18px] text-lavender" aria-hidden="true" />
                </span>
                <h3 className="mt-3 text-sm font-semibold text-ink">{feature.title}</h3>
                <p className="mt-1.5 flex-1 text-sm leading-relaxed text-muted">
                  {feature.body}
                </p>
                <span className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-lavender">
                  {feature.cta}
                  <ArrowRight
                    className="size-3.5 transition-transform duration-150 group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Guardrails ------------------------------------------------------- */}
      <section
        aria-labelledby="guardrails-heading"
        className="rounded-panel border border-line bg-surface p-6 sm:p-8"
      >
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-lavender">
          Guardrails
        </p>
        <h2
          id="guardrails-heading"
          className="mt-1 text-lg font-semibold tracking-[-0.01em] text-ink"
        >
          The model writes, code decides
        </h2>
        <ul className="mt-5 grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {GUARDS.map((guard) => (
            <li key={guard} className="flex gap-2.5">
              <span
                className="mt-[7px] size-1.5 shrink-0 rounded-full bg-lavender"
                aria-hidden="true"
              />
              <span className="text-sm leading-relaxed text-muted">{guard}</span>
            </li>
          ))}
        </ul>

        <p className="mt-5 flex gap-2.5 border-t border-line pt-4 text-sm leading-relaxed text-muted">
          <ShieldCheck
            className="mt-0.5 size-4 shrink-0 text-success"
            aria-hidden="true"
          />
          The winning deal is stored server-side, so PayPal receives the agreed
          price.
        </p>
      </section>

      {/* Where things stand ----------------------------------------------- */}
      <section
        aria-labelledby="status-heading"
        className="rounded-panel border border-dashed border-line px-5 py-4"
      >
        <h2
          id="status-heading"
          className="text-[11px] font-medium uppercase tracking-[0.08em] text-lavender"
        >
          Where things stand
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Negotiations run live from backend events, with a recorded replay
          fallback. Benchmark results are recorded, and deals and compiled policies
          live in server memory — a restart clears them.
        </p>
      </section>
    </div>
  );
}

function MandateRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line/60 py-2.5 first:pt-0 last:border-0 last:pb-0">
      <dt className="shrink-0 text-xs text-muted">{label}</dt>
      <dd
        className={cn(
          "min-w-0 break-words text-right text-sm font-medium text-ink",
          mono && "font-mono",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
