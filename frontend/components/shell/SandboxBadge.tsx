import { cn } from "@/lib/cn";

/** Reality check that belongs on every screen: this build never moves real money. */
export function SandboxBadge({
  className,
  variant = "chip",
}: {
  className?: string;
  /** `plain` drops the chip chrome for tight containers such as the sidebar footer. */
  variant?: "chip" | "plain";
}) {
  return (
    <span
      title="Payments run against the PayPal sandbox. No real money moves."
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-warning",
        variant === "chip" &&
          "h-7 rounded-pill border border-warning-line bg-warning-soft px-2.5",
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-warning" aria-hidden="true" />
      Sandbox
    </span>
  );
}
