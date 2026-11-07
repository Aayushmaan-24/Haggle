import { Inbox, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export function EmptyState({
  title,
  description,
  action,
  icon: Icon = Inbox,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-line-strong/70 bg-surface/40 px-6 py-10 text-center",
        className,
      )}
    >
      <span className="grid size-11 place-items-center rounded-full border border-line bg-surface-2">
        <Icon className="size-5 text-accent" aria-hidden="true" />
      </span>
      <h3 className="text-h3 font-semibold text-ink">{title}</h3>
      {description ? (
        <p className="max-w-sm text-small leading-relaxed text-muted">{description}</p>
      ) : null}
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}
