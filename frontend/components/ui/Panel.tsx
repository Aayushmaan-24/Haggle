import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Panel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("card", className)}>{children}</div>;
}

/**
 * Heading block for a panel. `bodyClassName` lets a panel pass padding through
 * to the content below the header.
 */
export function PanelHeader({
  eyebrow,
  title,
  description,
  action,
  className,
  bodyClassName,
}: {
  eyebrow?: string;
  title?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 border-b border-line px-5 py-4",
        bodyClassName,
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          {eyebrow ? <p className="label mb-1 text-accent">{eyebrow}</p> : null}
          {title ? (
            <h3 className="text-h3 font-semibold text-ink">{title}</h3>
          ) : null}
        </div>
        {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
      </div>
      {description ? <p className="text-small text-muted">{description}</p> : null}
    </div>
  );
}
