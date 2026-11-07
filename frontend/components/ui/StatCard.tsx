import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: LucideIcon;
  tone?: "default" | "positive" | "warning" | "negative";
  className?: string;
}) {
  const valueTone =
    tone === "positive"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : tone === "negative"
          ? "text-danger"
          : "text-ink";

  return (
    <div className={cn("card p-4", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="label">{label}</p>
        {Icon ? (
          <span className="grid size-7 place-items-center rounded-control border border-line bg-surface-2 text-faint">
            <Icon className="size-3.5" aria-hidden="true" />
          </span>
        ) : null}
      </div>
      <p className={cn("num mt-2 text-[26px] font-semibold leading-none", valueTone)}>
        {value}
      </p>
      {hint ? <p className="mt-2 text-[11px] leading-relaxed text-muted">{hint}</p> : null}
    </div>
  );
}
