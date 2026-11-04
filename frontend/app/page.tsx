import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/PageHeader";
import { ButtonLink } from "@/components/ui/Button";
import { Placeholder } from "@/components/ui/Placeholder";

export const metadata: Metadata = {
  title: "Overview",
  description: "Your mandate, your agent and the deals it closes.",
};

export default function OverviewPage() {
  return (
    <>
      <PageHeader
        eyebrow="Sandbox workspace"
        title="Overview"
        description="One buyer agent, several seller agents, and a price that both sides agreed to. Every negotiation runs inside a mandate your agent cannot exceed."
        actions={<ButtonLink href="/trading-floor">Open Trading Floor</ButtonLink>}
      />

      <Placeholder
        title="This screen is still being assembled"
        body="The foundation is in place: theme, shell, routing and the typed backend client. The overview will read from the live mandate and from deals recorded in this browser."
        points={[
          "Mandate summary: item, budget, target price and the fixed 7-day delivery limit",
          "Session activity for this browser only, never implied platform-wide history",
          "Benchmark highlights and a shortcut into the negotiation table",
        ]}
      />
    </>
  );
}
