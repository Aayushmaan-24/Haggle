import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/PageHeader";
import { Placeholder } from "@/components/ui/Placeholder";

export const metadata: Metadata = {
  title: "Trading Floor",
  description: "Live agent-to-agent negotiation across every seller.",
};

export default function TradingFloorPage() {
  return (
    <>
      <PageHeader
        eyebrow="Negotiation"
        title="Trading Floor"
        description="The buyer agent negotiates price, deposit and delivery with every seller in parallel, using real competing offers as leverage."
      />

      <Placeholder
        title="The negotiation table lands next"
        body="This route owns the live stream: a mandate bar, one lane per seller, a round timeline and the final ranking. Nothing on this screen will be simulated — it renders the backend's events as they arrive."
        points={[
          "Seller lanes with opening asks, buyer counters and seller counters, visibly distinct",
          "Accepted deals and walk-aways marked per seller, with the winner decided only by the result event",
          "Recorded replay on by default, clearly labelled, so demos never wait on model quota",
        ]}
      />
    </>
  );
}
