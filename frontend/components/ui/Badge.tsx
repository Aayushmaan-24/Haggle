import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type BadgeTone = "accent" | "success" | "warning" | "danger" | "info" | "neutral";

const tones: Record<BadgeTone, { chip: string; dot: string }> = {
  accent: { chip: "border-accent-line bg-accent-soft text-accent", dot: "bg-accent" },
  success: {
    chip: "border-success-line bg-success-soft text-success",
    dot: "bg-success",
  },
  warning: {
    chip: "border-warning-line bg-warning-soft text-warning",
    dot: "bg-warning",
  },
  danger: { chip: "border-danger-line bg-danger-soft text-danger", dot: "bg-danger" },
  info: { chip: "border-info-line bg-info-soft text-info", dot: "bg-info" },
  neutral: { chip: "border-line bg-surface-2 text-muted", dot: "bg-faint" },
};

export function Badge({
  children,
  tone = "neutral",
  dot = true,
  pulse = false,
  className,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  dot?: boolean;
  pulse?: boolean;
  className?: string;
}) {
  const style = tones[tone];

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-pill border px-2.5 py-1 text-[11px] font-medium leading-none",
        style.chip,
        className,
      )}
    >
      {dot ? (
        <span
          className={cn("size-1.5 rounded-full", style.dot, pulse && "animate-pulse")}
          aria-hidden="true"
        />
      ) : null}
      {children}
    </span>
  );
}
