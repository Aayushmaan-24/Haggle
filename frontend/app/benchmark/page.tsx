import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/PageHeader";
import { Placeholder } from "@/components/ui/Placeholder";

export const metadata: Metadata = {
  title: "Benchmark",
  description: "Recorded performance across reproducible negotiation scenarios.",
};

export default function BenchmarkPage() {
  return (
    <>
      <PageHeader
        eyebrow="Performance"
        title="Benchmark"
        description="Randomized purchases with a fixed seed, each checked against the buyer's budget, the winner's price floor and the delivery deadline."
      />

      <Placeholder
        title="Benchmark view pending"
        body="The backend exposes no benchmark endpoint, so this screen will read a clearly dated snapshot of data/benchmark.json rather than presenting the numbers as live."
        points={[
          "Deal rate, average saving against list price and guard violations",
          "Per-scenario table: budget, target, winning seller, price and saving",
          "A visible snapshot notice so the figures are never mistaken for real-time results",
        ]}
      />
    </>
  );
}
