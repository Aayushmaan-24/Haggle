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
        "inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-lavender",
        variant === "chip" &&
          "h-6 rounded-md border border-lavender-linethin bg-lavender-soft px-2",
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-lavender" aria-hidden="true" />
      Sandbox
    </span>
  );
}
