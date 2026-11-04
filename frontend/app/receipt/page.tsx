import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/PageHeader";
import { Placeholder } from "@/components/ui/Placeholder";

export const metadata: Metadata = {
  title: "Deal",
  description: "Negotiated terms, payment status and delivery confirmation.",
};

export default function ReceiptPage() {
  return (
    <>
      <PageHeader
        eyebrow="Settlement"
        title="Deal"
        description="The negotiated terms, the PayPal payment split into deposit and balance, and the delivery confirmation that releases the remainder."
      />

      <Placeholder
        title="Deal details and payment come after the Trading Floor"
        body="The backend redirects here from PayPal as /receipt?deal=<id>, so this single route carries both the deal summary and the payment flow. Deals live in server memory only, which means a missing deal is explained rather than reported as an unknown error."
        points={[
          "Terms agreed by the agents, with the server's authoritative total, deposit and balance",
          "PayPal approval, then deposit capture, then the balance released on delivery",
          "Every deal status rendered with its own state: negotiated, awaiting approval, deposit paid, complete",
        ]}
      />
    </>
  );
}
