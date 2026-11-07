import { Badge, type BadgeTone } from "./Badge";

/** Deals with the four status values the backend actually returns. */
export type DealStatus = "negotiated" | "awaiting_approval" | "deposit_paid" | "complete";

export type StatusVariant =
  | "negotiating"
  | "deal"
  | "out"
  | "pending"
  | "complete"
  | DealStatus;

const variantMap: Record<
  StatusVariant,
  { label: string; tone: BadgeTone; pulse?: boolean }
> = {
  negotiating: { label: "Negotiating", tone: "accent", pulse: true },
  deal: { label: "Deal reached", tone: "success" },
  out: { label: "Out", tone: "danger" },
  pending: { label: "Pending", tone: "warning" },
  complete: { label: "Paid in full", tone: "success" },
  negotiated: { label: "Ready to pay", tone: "accent" },
  awaiting_approval: { label: "Awaiting approval", tone: "warning" },
  deposit_paid: { label: "Deposit paid", tone: "info" },
};

/**
 * Cross-renders a status: pass either a `deal.status` value directly, or one of the
 * semantic variants (`negotiating` / `deal` / `out` / `pending` / `complete`) used
 * elsewhere in the interface.
 */
export function StatusBadge({
  variant,
  className,
}: {
  variant: StatusVariant;
  className?: string;
}) {
  const styles = variantMap[variant];

  return (
    <Badge tone={styles.tone} pulse={styles.pulse} className={className}>
      {styles.label}
    </Badge>
  );
}
