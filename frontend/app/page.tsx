import type { Metadata } from "next";
import {
  ArrowRight,
  BadgeCheck,
  Bot,
  CircleDollarSign,
  Gavel,
  Play,
  ShieldCheck,
  Sparkles,
  Timer,
  WalletCards,
} from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { SectionHeader } from "@/components/ui/SectionHeader";

export const metadata: Metadata = {
  title: "Overview",
  description:
    "One buyer agent negotiates with every seller at once, then settles the best deal through PayPal.",
};

const STEPS = [
  {
    icon: Gavel,
    title: "Set your mandate",
    body: "Name the item, your budget and the price you want. The agent never negotiates past those limits.",
  },
  {
    icon: Bot,
    title: "Agents haggle in parallel",
    body: "Every seller is approached at once. Your agent uses real competing offers as leverage, round after round.",
  },
  {
    icon: BadgeCheck,
    title: "The best offer wins",
    body: "Offers are ranked on price, deposit and delivery. The deal that costs you least overall takes the win.",
  },
  {
    icon: WalletCards,
    title: "Pay the deposit, settle on delivery",
    body: "Approve once in PayPal. The deposit is captured up front and the balance only after you confirm delivery.",
  },
];

export default function OverviewPage() {
  return (
    <div className="space-y-10">
      {/* Hero ---------------------------------------------------------- */}
      <section className="relative overflow-hidden rounded-card border border-line bg-surface shadow-card">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-grid opacity-60 [mask-image:radial-gradient(90%_80%_at_50%_0%,black,transparent)]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-24 -top-40 size-[520px] rounded-full bg-accent/15 blur-[110px]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 bottom-0 size-[420px] rounded-full bg-success/10 blur-[120px]"
        />

        <div className="relative grid items-center gap-10 p-6 sm:p-9 lg:grid-cols-[1.03fr_0.97fr] lg:p-12 xl:gap-14">
          <div className="max-w-xl">
            <Badge tone="accent" className="mb-5 border-accent-line bg-accent-soft">
              <Sparkles className="size-3" aria-hidden="true" />
              AI negotiation, settled with PayPal
            </Badge>
            <h1 className="text-[40px] font-semibold leading-[1.02] tracking-[-0.04em] text-ink sm:text-[54px]">
              Let your agent
              <span className="block bg-gradient-to-r from-accent-hover via-accent to-info bg-clip-text text-transparent">
                do the haggling.
              </span>
            </h1>
            <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-muted sm:text-base">
              One buyer agent. Every seller at once. Watch prices come down in real time,
              then settle the winning deal without leaving the page.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <ButtonLink href="/trading-floor" size="lg" className="group">
                <Play className="size-4 fill-current" aria-hidden="true" />
                Watch a negotiation
                <ArrowRight
                  className="size-4 transition-transform duration-150 group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </ButtonLink>
              <span className="inline-flex items-center gap-2 text-small text-faint">
                <Timer className="size-3.5" aria-hidden="true" />
                About 30 seconds
              </span>
            </div>

            <p className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-micro text-faint">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="size-3.5 text-success" aria-hidden="true" />
                PayPal sandbox
              </span>
              <span aria-hidden="true">·</span>
              <span>No sign-up</span>
              <span aria-hidden="true">·</span>
              <span>No real money moves</span>
            </p>
          </div>

          <HeroPreview />
        </div>
      </section>

      {/* How it works -------------------------------------------------- */}
      <section aria-labelledby="how-heading">
        <SectionHeader
          eyebrow="How it works"
          title="From mandate to delivery in four steps"
          description="A complete purchase, negotiated and settled in one sitting."
        />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {STEPS.map((step, index) => {
            const Icon = step.icon;
            return (
              <div key={step.title} className="card group p-5 transition-colors hover:border-line-strong">
                <div className="flex items-center justify-between">
                  <span className="grid size-10 place-items-center rounded-panel border border-line bg-surface-2 text-accent transition-colors group-hover:border-accent-line group-hover:bg-accent-soft">
                    <Icon className="size-[18px]" aria-hidden="true" />
                  </span>
                  <span className="num text-micro text-faint">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </div>
                <h3 className="mt-4 text-h3 font-semibold text-ink">{step.title}</h3>
                <p className="mt-1.5 text-small leading-relaxed text-muted">{step.body}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* About --------------------------------------------------------- */}
      <section aria-labelledby="about-heading" className="card p-6 sm:p-8">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="label mb-2 text-accent">About this demo</p>
            <h2 id="about-heading" className="text-h2 font-semibold text-ink">
              Honest by design
            </h2>
          </div>
          <p className="max-w-md text-small leading-relaxed text-faint">
            Built for the PayPal AI Hackathon. Everything below is here so the demo never
            overpromises.
          </p>
        </div>

        <div className="mt-6 grid gap-x-8 gap-y-5 border-t border-line pt-6 sm:grid-cols-2">
          {[
            {
              icon: ShieldCheck,
              title: "Sandbox payments",
              body: "PayPal runs in sandbox mode end to end. No real money moves, and no live account is charged.",
            },
            {
              icon: Bot,
              title: "Simulated sellers",
              body: "The default seller agents use sample catalogs. The Seller Policy console shows how a real merchant would join.",
            },
            {
              icon: CircleDollarSign,
              title: "Recorded benchmark",
              body: "Benchmark figures come from a fixed set of recorded negotiations, not a live market sample.",
            },
            {
              icon: Timer,
              title: "Session memory",
              body: "Deals and compiled policies stay available for this demo session. They are not a permanent record.",
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.title} className="flex gap-3">
                <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-control border border-line bg-surface-2 text-faint">
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

        <p className="mt-6 border-t border-line pt-5 text-micro leading-relaxed text-faint">
          Payments run in the PayPal sandbox. No real money moves.
        </p>
      </section>
    </div>
  );
}

/** A static, clearly-labelled example of the live negotiation screen. */
function HeroPreview() {
  const sellers = [
    { name: "Firm Co", from: "$105.00", to: "$95.00", color: "var(--color-seller-1)" },
    { name: "Flex Ltd", from: "$98.00", to: "$88.00", color: "var(--color-seller-2)" },
    { name: "Premium Hub", from: "$118.00", to: "$102.00", color: "var(--color-seller-3)" },
  ];

  return (
    <div className="relative mx-auto w-full max-w-[470px]">
      <div
        aria-hidden="true"
        className="absolute -inset-4 rounded-[26px] bg-accent/10 blur-2xl"
      />
      <div className="card-glass relative overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-success" />
            </span>
            <span className="text-micro font-semibold uppercase tracking-[0.12em] text-faint">
              Example negotiation
            </span>
          </div>
          <span className="num rounded-pill border border-line bg-surface-2 px-2 py-0.5 text-[10px] text-muted">
            Round 3 / 5
          </span>
        </div>

        <div className="space-y-2 p-4">
          {sellers.map((seller, index) => {
            const winner = index === 1;
            return (
              <div
                key={seller.name}
                className={
                  winner
                    ? "flex items-center gap-3 rounded-panel border border-success-line bg-success-soft px-3 py-2.5"
                    : "flex items-center gap-3 rounded-panel border border-line bg-surface-2/60 px-3 py-2.5"
                }
              >
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: seller.color }}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
                  {seller.name}
                </span>
                <span className="num text-[11px] text-faint line-through">{seller.from}</span>
                <span
                  className={
                    winner
                      ? "num text-[15px] font-semibold text-success"
                      : "num text-[15px] font-semibold text-ink"
                  }
                >
                  {seller.to}
                </span>
              </div>
            );
          })}
        </div>

        <div className="mx-4 rounded-panel border border-line bg-surface px-3 pb-2 pt-3">
          <div className="flex items-center justify-between">
            <span className="text-micro text-faint">Prices coming down</span>
            <span className="inline-flex items-center gap-1 text-micro font-medium text-success">
              <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
              One deal reached
            </span>
          </div>
          <svg viewBox="0 0 400 96" className="mt-1 h-24 w-full" role="img" aria-label="Example price chart: three seller prices falling across three rounds">
            <defs>
              <linearGradient id="hero-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-success)" stopOpacity="0.28" />
                <stop offset="100%" stopColor="var(--color-success)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <line x1="10" x2="390" y1="66" y2="66" stroke="var(--color-accent)" strokeDasharray="5 5" strokeOpacity="0.55" />
            <path d="M10 18 L138 38 L266 56 L390 56 L390 96 L10 96 Z" fill="url(#hero-area)" />
            <path d="M10 18 L138 38 L266 56 L390 56" fill="none" stroke="var(--color-success)" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M10 34 L138 50 L266 66 L390 76" fill="none" stroke="var(--color-seller-1)" strokeWidth="1.8" strokeOpacity="0.75" strokeLinecap="round" />
            <path d="M10 10 L138 30 L266 52 L390 70" fill="none" stroke="var(--color-seller-3)" strokeWidth="1.8" strokeOpacity="0.6" strokeLinecap="round" />
            <circle cx="390" cy="56" r="3.5" fill="var(--color-success)" />
          </svg>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3">
          <div>
            <p className="text-micro text-faint">Winner</p>
            <p className="text-[13px] font-medium text-ink">
              Flex Ltd · <span className="num text-success">$88.00</span>
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-control bg-success px-3 py-1.5 text-[12px] font-semibold text-[#04150d] shadow-[0_8px_20px_-10px_var(--color-success)]">
            Deal reached
            <BadgeCheck className="size-3.5" aria-hidden="true" />
          </span>
        </div>
      </div>
    </div>
  );
}
