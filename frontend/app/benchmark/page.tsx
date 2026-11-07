import { readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import {
  Activity,
  BadgeCheck,
  BarChart3,
  Check,
  CircleDollarSign,
  FlaskConical,
  Handshake,
  Info,
  Play,
  ShieldCheck,
  TrendingDown,
} from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { ButtonLink } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { StatCard } from "@/components/ui/StatCard";
import { cn } from "@/lib/cn";
import { BenchmarkGrid, type BenchmarkRow } from "@/components/benchmark/BenchmarkGrid";

export const metadata: Metadata = {
  title: "Benchmark",
  description:
    "A recorded set of negotiations, checked against the buyer's budget, each seller's price floor and the delivery deadline.",
};

type BenchmarkRun = Omit<BenchmarkRow, "run">;

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

type SnapshotLoad =
  | { status: "ok"; data: BenchmarkSnapshot }
  | { status: "empty" }
  | { status: "error" };

/**
 * The benchmark is a script, not a live endpoint: it writes `data/benchmark.json`
 * at the repository root. Read that file during the build and inline it, so the
 * static export ships real recorded figures instead of invented ones.
 */
function loadSnapshot(): SnapshotLoad {
  let raw: string;
  try {
    raw = readFileSync(path.join(process.cwd(), "..", "data", "benchmark.json"), "utf8");
  } catch {
    return { status: "empty" };
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isSnapshot(parsed)) return { status: "error" };
    if (parsed.summary.runs === 0 || parsed.runs.length === 0) return { status: "empty" };
    return { status: "ok", data: parsed };
  } catch {
    return { status: "error" };
  }
}

function isSnapshot(value: unknown): value is BenchmarkSnapshot {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.summary === "object" &&
    record.summary !== null &&
    Array.isArray(record.runs)
  );
}

const pct = (value: number) => `${value.toFixed(1)}%`;

const CHECKS = [
  {
    title: "Within budget",
    body: "The agreed price never exceeds the buyer's budget.",
  },
  {
    title: "Above the seller's floor",
    body: "No seller is pushed below the minimum it set for itself.",
  },
  {
    title: "Inside the delivery limit",
    body: "Promised delivery stays within the buyer's seven-day limit.",
  },
];

const METHOD = [
  "Seven purchases across a spread of catalog sizes, budgets and delivery promises.",
  "Every run starts from the same buyer mandate, so the results are directly comparable.",
  "List prices and seller floors vary within each scenario's price range.",
  "Runs are spaced out so live agents stay within their usage limits.",
];

const READING = [
  "Savings averages cover closed deals only.",
  "“Versus list” compares with the winning seller's own list price. “Versus cheapest” compares with the lowest list price on the floor.",
  "Negotiations vary, so treat these as a representative sample, not a guarantee.",
  "The list below shows every recorded run, in the order it happened.",
];

export default function BenchmarkPage() {
  const load = loadSnapshot();
  const data = load.status === "ok" ? load.data : null;
  const summary = data?.summary;
  const runs = data?.runs ?? [];
  const closedDeals = runs.filter((run) => run.deal);
  const failedGuards = closedDeals.filter((run) => run.guard_ok === false);
  const rows: BenchmarkRow[] = runs.map((run, index) => ({ ...run, run: index + 1 }));

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Recorded results"
        title="Benchmark"
        description="A fixed set of negotiations, replayed to show how the buyer agent performs against budgets, seller floors and delivery limits."
        actions={
          <ButtonLink href="/trading-floor" variant="secondary">
            <Play className="size-3.5 fill-current" aria-hidden="true" />
            Watch a negotiation
          </ButtonLink>
        }
      />

      {load.status === "error" ? (
        <ErrorState
          title="Recorded results are unavailable"
          description="We could not load the benchmark results for this page. Refresh, and they should appear."
        />
      ) : load.status === "empty" ? (
        <EmptyState
          icon={BarChart3}
          title="No recorded results yet"
          description="The benchmark has not been recorded for this build. Results will appear here once they are available."
          action={<ButtonLink href="/trading-floor">Watch a negotiation</ButtonLink>}
        />
      ) : summary ? (
        <>
          {/* Honesty strip -------------------------------------------- */}
          <section
            aria-labelledby="recorded-heading"
            className="flex flex-col gap-2.5 rounded-card border border-line bg-surface px-4 py-3.5 sm:flex-row sm:items-center sm:gap-3"
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-control border border-accent-line bg-accent-soft text-accent">
              <Info className="size-4" aria-hidden="true" />
            </span>
            <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-muted">
              <span id="recorded-heading" className="font-medium text-ink">
                Recorded results.
              </span>{" "}
              These negotiations were run as one set and are shown exactly as recorded,
              not sampled live.
            </p>
            <Badge tone="neutral" dot={false}>
              <FlaskConical className="size-3" aria-hidden="true" />
              Representative sample
            </Badge>
          </section>

          {/* Summary -------------------------------------------------- */}
          <section aria-labelledby="summary-heading" className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 id="summary-heading" className="text-h2 font-semibold text-ink">
                  Summary
                </h2>
                <p className="mt-0.5 text-small text-muted">
                  The headline numbers from this recorded set.
                </p>
              </div>
              <span className="num rounded-pill border border-line bg-surface-2 px-2.5 py-1 text-[10px] text-faint">
                Runs {String(summary.runs).padStart(2, "0")}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
              <StatCard
                label="Completed runs"
                value={String(summary.runs)}
                hint="Negotiations in this set."
                icon={Activity}
              />
              <StatCard
                label="Deal rate"
                value={pct(summary.deal_rate_pct)}
                hint="Closed with a winning seller."
                icon={Handshake}
                tone="positive"
              />
              <StatCard
                label="Avg. saving vs list"
                value={pct(summary.avg_saving_vs_list_pct)}
                hint="Against the winner's own list price."
                icon={TrendingDown}
                tone="positive"
              />
              <StatCard
                label="Avg. saving vs cheapest"
                value={pct(summary.avg_saving_vs_cheapest_list_pct)}
                hint="Against the lowest list price on the floor."
                icon={CircleDollarSign}
              />
              <StatCard
                label="Check violations"
                value={String(summary.guard_violations)}
                hint="Deals that broke a budget, floor or delivery rule."
                icon={ShieldCheck}
                tone={summary.guard_violations === 0 ? "positive" : "negative"}
                className="col-span-2 sm:col-span-1"
              />
            </div>
          </section>

          {/* Checks --------------------------------------------------- */}
          <section aria-labelledby="checks-heading" className="card p-5 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="label mb-1.5 text-accent">The safety net</p>
                <h2 id="checks-heading" className="text-h2 font-semibold text-ink">
                  Three checks after every deal
                </h2>
              </div>
              {failedGuards.length === 0 ? (
                <Badge tone="success">
                  <BadgeCheck className="size-3" aria-hidden="true" />
                  All {closedDeals.length} deals passed
                </Badge>
              ) : (
                <Badge tone="danger">
                  {failedGuards.length} of {closedDeals.length} deals failed
                </Badge>
              )}
            </div>

            <div className="mt-5 grid gap-x-8 gap-y-5 border-t border-line pt-5 sm:grid-cols-3">
              {CHECKS.map((check) => (
                <div key={check.title} className="flex gap-3">
                  <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-control border border-success-line/60 bg-success-soft text-success">
                    <Check className="size-4" aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="text-[13px] font-semibold text-ink">{check.title}</h3>
                    <p className="mt-0.5 text-small leading-relaxed text-muted">{check.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Scenarios ------------------------------------------------- */}
          <section aria-labelledby="scenarios-heading" className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 id="scenarios-heading" className="text-h2 font-semibold text-ink">
                  Recorded scenarios
                </h2>
                <p className="mt-0.5 text-small text-muted">
                  Every run in order. Sort any column to compare.
                </p>
              </div>
              <span className="num rounded-pill border border-line bg-surface-2 px-2.5 py-1 text-[10px] text-faint">
                USD
              </span>
            </div>

            {/* AG Grid Community, wide screens only */}
            <div className="card hidden overflow-hidden xl:block">
              <BenchmarkGrid rows={rows} />
            </div>

            {/* Compact list for tablets and phones */}
            <ul className="grid gap-3 xl:hidden">
              {rows.map((run) => (
                <li key={run.run} className="card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-ink">
                        <span className="num mr-1.5 text-[11px] text-faint">
                          Run {String(run.run).padStart(2, "0")}
                        </span>
                        {run.deal && run.seller ? run.seller : "No deal"}
                      </p>
                      <p className="mt-0.5 text-[11px] text-faint">
                        {run.deal ? "Closed with a winning seller" : "No seller met the mandate"}
                      </p>
                    </div>
                    <GuardMark run={run} />
                  </div>

                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-line/70 pt-3">
                    <Pair label="Budget" value={usd.format(run.budget)} />
                    <Pair label="Target" value={usd.format(run.target)} />
                    {run.deal && run.price !== undefined ? (
                      <>
                        <Pair label="Agreed" value={usd.format(run.price)} />
                        <Pair
                          label="List"
                          value={
                            run.list_price !== undefined ? usd.format(run.list_price) : "—"
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
                          className="col-span-2"
                        />
                      </>
                    ) : (
                      <Pair label="Outcome" value="No deal" muted className="col-span-2" />
                    )}
                  </dl>
                </li>
              ))}
            </ul>
          </section>

          {/* Method --------------------------------------------------- */}
          <section aria-labelledby="method-heading" className="space-y-3">
            <div>
              <h2 id="method-heading" className="text-h2 font-semibold text-ink">
                How to read these results
              </h2>
              <p className="mt-0.5 text-small text-muted">
                Context for the numbers above, kept short.
              </p>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="card p-5">
                <div className="flex items-center gap-2">
                  <FlaskConical className="size-4 text-accent" aria-hidden="true" />
                  <h3 className="text-[13px] font-semibold text-ink">
                    How the scenarios were built
                  </h3>
                </div>
                <BulletList items={METHOD} />
              </div>
              <div className="card p-5">
                <div className="flex items-center gap-2">
                  <BarChart3 className="size-4 text-accent" aria-hidden="true" />
                  <h3 className="text-[13px] font-semibold text-ink">
                    How to read the results
                  </h3>
                </div>
                <BulletList items={READING} />
              </div>
            </div>
          </section>

          {/* CTA ------------------------------------------------------ */}
          <section className="card relative overflow-hidden p-6 sm:p-8">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full bg-accent/10 blur-3xl"
            />
            <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="label mb-1.5 text-accent">See it live</p>
                <h2 className="text-h2 font-semibold text-ink">
                  The numbers are recorded. The floor is not.
                </h2>
                <p className="mt-1 max-w-xl text-body text-muted">
                  Start a negotiation and watch every seller respond in real time.
                </p>
              </div>
              <ButtonLink href="/trading-floor" size="lg" className="shrink-0">
                <Play className="size-4 fill-current" aria-hidden="true" />
                Watch a negotiation
              </ButtonLink>
            </div>
            <p className="relative mt-5 border-t border-line pt-4 text-micro text-faint">
              Payments run in the PayPal sandbox. No real money moves.
            </p>
          </section>
        </>
      ) : null}
    </div>
  );
}

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function GuardMark({ run }: { run: BenchmarkRow }) {
  if (!run.deal) {
    return (
      <Badge tone="neutral" dot={false}>
        No deal
      </Badge>
    );
  }

  const passed = run.guard_ok !== false;
  return <Badge tone={passed ? "success" : "danger"}>{passed ? "Passed" : "Failed"}</Badge>;
}

function Pair({
  label,
  value,
  muted = false,
  tone,
  className,
}: {
  label: string;
  value: string;
  muted?: boolean;
  tone?: "positive";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-2 border-b border-line/40 pb-1",
        className,
      )}
    >
      <dt className="text-[11px] text-faint">{label}</dt>
      <dd
        className={cn(
          "num whitespace-nowrap text-right text-[12px]",
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
            className="mt-[7px] size-1.5 shrink-0 rounded-full bg-accent/70"
            aria-hidden="true"
          />
          <span className="text-[12px] leading-relaxed text-muted">{item}</span>
        </li>
      ))}
    </ul>
  );
}
