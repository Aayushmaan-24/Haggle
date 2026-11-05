import { readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  CircleSlash,
  Handshake,
  LayoutDashboard,
  ScrollText,
  ShieldCheck,
} from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/cn";

export const metadata: Metadata = {
  title: "Benchmark",
  description:
    "Fixed-seed negotiation runs checked against the buyer's budget, the winning seller's price floor and the delivery deadline.",
};

type BenchmarkRun = {
  budget: number;
  target: number;
  deal: boolean;
  seller?: string;
  price?: number;
  list_price?: number;
  saving_vs_list?: number;
  saving_vs_cheapest?: number;
  guard_ok?: boolean;
};

type BenchmarkSnapshot = {
  summary: {
    runs: number;
    deal_rate_pct: number;
    avg_saving_vs_list_pct: number;
    avg_saving_vs_cheapest_list_pct: number;
    guard_violations: number;
  };
  runs: BenchmarkRun[];
};

/**
 * The benchmark is a script, not an API: it writes `data/benchmark.json` at the
 * repository root. Read that file during the build and inline the result, so the
 * static export ships a real snapshot instead of a placeholder or invented numbers.
 * A missing or unreadable file is a normal state and falls back to the empty state.
 */
function loadSnapshot(): BenchmarkSnapshot | null {
  try {
    const file = path.join(process.cwd(), "..", "data", "benchmark.json");
    return JSON.parse(readFileSync(file, "utf8")) as BenchmarkSnapshot;
  } catch {
    return null;
  }
}

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const pct = (value: number) => `${value.toFixed(1)}%`;

const CHECKS = [
  {
    title: "Within budget",
    body: "The winning price must not exceed the buyer's budget. An acceptance above it is blocked in code before the deal is recorded.",
  },
  {
    title: "At or above the seller's floor",
    body: "No seller is pushed below its own price floor. Any offer that tries is rejected and corrected.",
  },
  {
    title: "Inside the delivery cap",
    body: "The promised delivery days must not exceed the mandate's maximum, so a seller cannot claim a time it cannot meet.",
  },
];

const METHOD = [
  "Seller catalogs are rescaled by 0.5×, 1×, 2×, 5× or 10×, with each list price and floor jittered slightly around the original.",
  "Budgets are set at 85%, 90% or 95% of the average seller list price; the target price is 94% of the budget.",
  "A fixed random seed (42) makes the scenario sequence reproducible from run to run.",
  "Runs are spaced five seconds apart to stay under free-tier model rate limits.",
];

const READING = [
  "Saving averages are computed over closed deals only — a run that ends without a deal counts toward the deal rate, not the savings.",
  "\"Versus list\" compares the winning price with that seller's own list price; \"versus cheapest\" compares it with the lowest list price on the floor.",
  "Model output varies between live runs, so these figures describe this agent on these simulated scenarios, not a market-wide claim.",
  "The snapshot is baked in at build time. Regenerate data/benchmark.json and rebuild the frontend to update this page.",
];

const NEXT_LINKS = [
  {
    href: "/trading-floor",
    label: "Trading Floor",
    body: "Watch a negotiation stream live.",
    icon: Handshake,
  },
  {
    href: "/policy",
    label: "Seller Policy",
    body: "Compile plain-English selling rules.",
    icon: ScrollText,
  },
  {
    href: "/",
    label: "Overview",
    body: "How the whole flow fits together.",
    icon: LayoutDashboard,
  },
];

export default function BenchmarkPage() {
  const data = loadSnapshot();
  const runs = data?.runs ?? [];
  const summary = data?.summary;
  const hasData = Boolean(summary && summary.runs > 0 && runs.length > 0);

  const closedDeals = runs.filter((run) => run.deal);
  const failedGuards = closedDeals.filter((run) => run.guard_ok === false);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Performance"
        title="Benchmark"
        description="Randomized purchases with a fixed seed, each checked against the buyer's budget, the winning seller's price floor and the delivery deadline."
        actions={<ButtonLink href="/trading-floor">Open Trading Floor</ButtonLink>}
      />

      <section
        aria-labelledby="snapshot-heading"
        className="rounded-panel border border-line bg-surface px-5 py-4"
      >
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-3">
          <span className="inline-flex w-fit shrink-0 items-center gap-1.5 rounded-md border border-lavender-linethin bg-lavender-soft px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-lavender">
            Committed snapshot
          </span>
          <p className="text-sm leading-relaxed text-muted">
            <span id="snapshot-heading" className="font-medium text-ink">
              These are recorded results, not live ones.
            </span>{" "}
            The backend exposes no benchmark endpoint, so this page reads{" "}
            <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[12px] text-lavender">
              data/benchmark.json
            </code>{" "}
            when the site is built. The data is produced by{" "}
            <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[12px] text-lavender">
              backend/benchmark.py
            </code>
            .
          </p>
        </div>
      </section>

      {hasData && summary ? (
        <>
          <section aria-labelledby="summary-heading" className="space-y-3">
            <SectionHeading
              id="summary-heading"
              title="Summary"
              description={`Across ${summary.runs} recorded ${summary.runs === 1 ? "run" : "runs"}.`}
            />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              <Stat
                label="Completed runs"
                value={String(summary.runs)}
                hint="Scenarios recorded in the snapshot."
              />
              <Stat
                label="Deal rate"
                value={pct(summary.deal_rate_pct)}
                hint="Runs that closed a deal inside the mandate."
              />
              <Stat
                label="Avg. saving vs list"
                value={pct(summary.avg_saving_vs_list_pct)}
                hint="Winning price against the winner's own list price."
              />
              <Stat
                label="Avg. saving vs cheapest"
                value={pct(summary.avg_saving_vs_cheapest_list_pct)}
                hint="Winning price against the lowest list price on the floor."
              />
              <Stat
                label="Guard violations"
                value={String(summary.guard_violations)}
                hint="Winning deals that broke budget, floor or delivery."
                tone={summary.guard_violations === 0 ? "positive" : "negative"}
              />
            </div>
          </section>

          <section aria-labelledby="checks-heading" className="space-y-3">
            <SectionHeading
              id="checks-heading"
              title="What every winning deal is checked against"
              description="Three hard constraints are enforced in code, not by the model."
            />
            <div className="grid gap-3 sm:grid-cols-3">
              {CHECKS.map((check) => (
                <div
                  key={check.title}
                  className="rounded-panel border border-line bg-surface p-5"
                >
                  <span className="flex size-8 items-center justify-center rounded-lg border border-lavender-linethin bg-lavender-soft">
                    <ShieldCheck
                      className="size-4 text-lavender"
                      aria-hidden="true"
                    />
                  </span>
                  <h3 className="mt-3 text-sm font-semibold text-ink">
                    {check.title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">
                    {check.body}
                  </p>
                </div>
              ))}
            </div>
            <p className="text-[13px] leading-relaxed text-muted">
              {failedGuards.length === 0 ? (
                <span className="inline-flex items-center gap-1.5 text-success">
                  <Check className="size-3.5" aria-hidden="true" />
                  All {closedDeals.length} closed{" "}
                  {closedDeals.length === 1 ? "deal" : "deals"} passed every
                  check in this snapshot.
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-warning">
                  <CircleSlash className="size-3.5" aria-hidden="true" />
                  {failedGuards.length} of {closedDeals.length} closed{" "}
                  {closedDeals.length === 1 ? "deal" : "deals"} failed a check in
                  this snapshot.
                </span>
              )}
            </p>
          </section>

          <section aria-labelledby="scenarios-heading" className="space-y-3">
            <SectionHeading
              id="scenarios-heading"
              title="Recorded scenarios"
              description="Listed in the order they were run. Prices are in US dollars."
            />

            <div className="overflow-hidden rounded-panel border border-line bg-surface">
              {/* Table for wide viewports ---------------------------------- */}
              <div className="hidden lg:block">
                <table className="w-full border-collapse text-sm">
                  <caption className="sr-only">
                    Benchmark runs with the buyer budget, target price, winning
                    seller, agreed price, list price, saving against list price
                    and guard result.
                  </caption>
                  <thead>
                    <tr className="border-b border-line text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
                      <th scope="col" className="px-5 py-3 text-left font-medium">
                        Run
                      </th>
                      <th scope="col" className="px-3 py-3 text-right font-medium">
                        Budget
                      </th>
                      <th scope="col" className="px-3 py-3 text-right font-medium">
                        Target
                      </th>
                      <th scope="col" className="px-3 py-3 text-left font-medium">
                        Winner
                      </th>
                      <th scope="col" className="px-3 py-3 text-right font-medium">
                        Agreed
                      </th>
                      <th scope="col" className="px-3 py-3 text-right font-medium">
                        List
                      </th>
                      <th scope="col" className="px-3 py-3 text-right font-medium">
                        Saving
                      </th>
                      <th scope="col" className="px-5 py-3 text-right font-medium">
                        Guard
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/70">
                    {runs.map((run, index) => (
                      <tr key={index} className="align-middle">
                        <th
                          scope="row"
                          className="px-5 py-3 text-left font-mono text-[12px] font-normal text-muted"
                        >
                          {String(index + 1).padStart(2, "0")}
                        </th>
                        <Cell>{usd.format(run.budget)}</Cell>
                        <Cell>{usd.format(run.target)}</Cell>
                        <td className="px-3 py-3 text-ink">
                          {run.deal && run.seller ? run.seller : <span className="text-muted">—</span>}
                        </td>
                        <Cell>
                          {run.deal && run.price !== undefined
                            ? usd.format(run.price)
                            : "—"}
                        </Cell>
                        <Cell muted>
                          {run.deal && run.list_price !== undefined
                            ? usd.format(run.list_price)
                            : "—"}
                        </Cell>
                        <Cell>
                          {run.deal && run.saving_vs_list !== undefined ? (
                            <span className="text-success">
                              {pct(run.saving_vs_list)}
                            </span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </Cell>
                        <td className="px-5 py-3 text-right">
                          <GuardMark run={run} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Stacked list for narrow viewports -------------------------- */}
              <ul className="divide-y divide-line/70 lg:hidden">
                {runs.map((run, index) => (
                  <li key={index} className="px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 text-sm font-medium text-ink">
                        <span className="font-mono text-[12px] font-normal text-muted">
                          Run {String(index + 1).padStart(2, "0")}
                        </span>
                        {run.deal && run.seller ? (
                          <span className="text-muted"> · {run.seller}</span>
                        ) : null}
                      </p>
                      <GuardMark run={run} />
                    </div>
                    <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px]">
                      <Pair label="Budget" value={usd.format(run.budget)} />
                      <Pair label="Target" value={usd.format(run.target)} />
                      {run.deal && run.price !== undefined ? (
                        <>
                          <Pair label="Agreed" value={usd.format(run.price)} />
                          <Pair
                            label="List"
                            value={
                              run.list_price !== undefined
                                ? usd.format(run.list_price)
                                : "—"
                            }
                            muted
                          />
                          <Pair
                            label="Saving vs list"
                            value={
                              run.saving_vs_list !== undefined
                                ? pct(run.saving_vs_list)
                                : "—"
                            }
                            tone="positive"
                          />
                        </>
                      ) : (
                        <Pair label="Outcome" value="No deal" muted />
                      )}
                    </dl>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section aria-labelledby="method-heading" className="space-y-3">
            <SectionHeading
              id="method-heading"
              title="Method and caveats"
              description="What the script does, and what these numbers can and cannot tell you."
            />
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="rounded-panel border border-line bg-surface p-5">
                <h3 className="text-sm font-semibold text-ink">
                  How each scenario is built
                </h3>
                <BulletList items={METHOD} />
              </div>
              <div className="rounded-panel border border-line bg-surface p-5">
                <h3 className="text-sm font-semibold text-ink">
                  How to read the results
                </h3>
                <BulletList items={READING} />
              </div>
            </div>
          </section>
        </>
      ) : (
        <EmptyState
          title="No benchmark runs recorded"
          description="The benchmark snapshot does not contain a completed run yet. Generate one locally, then rebuild the frontend to publish the figures here."
          action={
            <code className="rounded-md border border-line bg-surface-2 px-3 py-1.5 font-mono text-[12px] text-lavender">
              python benchmark.py 10
            </code>
          }
        />
      )}

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

function SectionHeading({
  id,
  title,
  description,
}: {
  id: string;
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-1">
      <h2
        id={id}
        className="text-lg font-semibold tracking-[-0.01em] text-ink"
      >
        {title}
      </h2>
      <p className="max-w-2xl text-sm leading-relaxed text-muted">
        {description}
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "positive" | "negative";
}) {
  return (
    <div className="rounded-panel border border-line bg-surface p-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
        {label}
      </p>
      <p
        className={cn(
          "mt-2 font-mono text-2xl font-semibold tabular-nums tracking-[-0.01em]",
          tone === "positive" && "text-success",
          tone === "negative" && "text-danger",
          !tone && "text-ink",
        )}
      >
        {value}
      </p>
      <p className="mt-1.5 text-[12px] leading-relaxed text-muted">{hint}</p>
    </div>
  );
}

function Cell({
  children,
  muted = false,
}: {
  children: ReactNode;
  muted?: boolean;
}) {
  return (
    <td
      className={cn(
        "px-3 py-3 text-right font-mono text-[13px] tabular-nums",
        muted ? "text-muted" : "text-ink",
      )}
    >
      {children}
    </td>
  );
}

function GuardMark({ run }: { run: BenchmarkRun }) {
  if (!run.deal) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted">
        No deal
      </span>
    );
  }

  const passed = run.guard_ok !== false;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium",
        passed ? "bg-success-soft text-success" : "bg-danger-soft text-danger",
      )}
    >
      <span
        className={cn("size-1.5 rounded-full", passed ? "bg-success" : "bg-danger")}
        aria-hidden="true"
      />
      {passed ? "Passed" : "Failed"}
    </span>
  );
}

function Pair({
  label,
  value,
  muted = false,
  tone,
}: {
  label: string;
  value: string;
  muted?: boolean;
  tone?: "positive";
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-line/40 pb-1 last:border-0">
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd
        className={cn(
          "whitespace-nowrap text-right font-mono text-[12px] tabular-nums",
          muted ? "text-muted" : "text-ink",
          tone === "positive" && "text-success",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="mt-3 space-y-2">
      {items.map((item) => (
        <li key={item} className="flex gap-2.5">
          <span
            className="mt-[7px] size-1.5 shrink-0 rounded-full bg-lavender"
            aria-hidden="true"
          />
          <span className="text-[13px] leading-relaxed text-muted">{item}</span>
        </li>
      ))}
    </ul>
  );
}
