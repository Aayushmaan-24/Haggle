import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/PageHeader";
import { Placeholder } from "@/components/ui/Placeholder";

export const metadata: Metadata = {
  title: "Seller Policy",
  description: "Turn plain-English selling rules into a live seller agent.",
};

export default function PolicyPage() {
  return (
    <>
      <PageHeader
        eyebrow="Seller Console"
        title="Seller Policy"
        description="Write your pricing rules the way you would explain them to a colleague. They compile into a structured policy and become a seller agent that competes in the market."
      />

      <Placeholder
        title="The rules editor arrives after the Trading Floor"
        body="Compiled policies are held in server memory, so this screen will treat an expired policy id as a normal state and ask you to recompile rather than failing silently."
        points={[
          "Plain-English editor with the backend's 2,000-character limit enforced before submit",
          "Compiled result shown as list price, floor, deposit, delivery days and negotiating style",
          "One action to run a negotiation with your shop added as a fourth seller",
        ]}
      />
    </>
  );
}
