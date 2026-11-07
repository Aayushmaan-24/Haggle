import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
  dense = false,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
  dense?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between",
        dense ? "mb-4" : "mb-6",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow ? <p className="label mb-2 text-accent">{eyebrow}</p> : null}
        <h1 className="text-h1 font-semibold text-ink">{title}</h1>
        {description ? (
          <p className="mt-1.5 max-w-2xl text-body text-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
