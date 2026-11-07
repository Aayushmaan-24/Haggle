import { cn } from "@/lib/cn";

/** Deals with the four status values the backend actually returns. */
export type DealStatus = "negotiated" | "awaiting_approval" | "deposit_paid" | "complete";

export type StatusVariant = "negotiating" | "deal" | "out" | "pending" | "complete" | DealStatus;

const variantMap: Record<
  StatusVariant,
  { label: string; dot: string; bg: string; text: string }
> = {
  negotiating: {
    label: "Negotiating",
    dot: "bg-accent",
    bg: "bg-accent-soft",
    text: "text-accent",
  },
  deal: {
    label: "Deal",
    dot: "bg-success",
    bg: "bg-success-soft",
    text: "text-success",
  },
  out: {
    label: "Out",
    dot: "bg-danger",
    bg: "bg-danger-soft",
    text: "text-danger",
  },
  pending: {
    label: "Pending",
    dot: "bg-warning",
    bg: "bg-warning-soft",
    text: "text-warning",
  },
  complete: {
    label: "Complete",
    dot: "bg-info",
    bg: "bg-info-soft",
    text: "text-info",
  },
  negotiated: {
    label: "Ready",
    dot: "bg-accent",
    bg: "bg-accent-soft",
    text: "text-accent",
  },
  awaiting_approval: {
    label: "Waiting on approval",
    dot: "bg-warning",
    bg: "bg-warning-soft",
    text: "text-warning",
  },
  deposit_paid: {
    label: "Deposit paid",
    dot: "bg-info",
    bg: "bg-info-soft",
    text: "text-info",
  },
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
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium",
        styles.bg,
        styles.text,
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", styles.dot)} aria-hidden="true" />
      {styles.label}
    </span>
  );
}
