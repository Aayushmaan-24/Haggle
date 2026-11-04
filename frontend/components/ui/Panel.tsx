import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Panel({
  children,
  className,
  action,
}: {
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-panel border border-line bg-surface overflow-hidden",
        className,
      )}
    >
      {action ? (
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <div className="text-sm font-medium text-ink">{action}</div>
        </div>
      ) : null}
      <div className="p-5">{children}</div>
    </div>
  );
}

/**
 * Heading-only panel variant for putting a title, description and actions on a
 * clean surface before a content block.
 */
export function PanelHeader({
  eyebrow,
  title,
  description,
  action,
  className,
}: {
  eyebrow?: string;
  title?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 border-b border-line px-5 py-4 last:border-0",
        className,
      )}
    >
      {eyebrow ? (
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-lavender">
          {eyebrow}
        </p>
      ) : null}
      {title ? <h3 className="text-lg font-semibold tracking-[-0.01em] text-ink">{title}</h3> : null}
      {description ? (
        <p className="text-sm leading-relaxed text-muted">{description}</p>
      ) : null}
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}
