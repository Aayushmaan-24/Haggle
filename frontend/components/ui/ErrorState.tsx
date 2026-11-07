import { TriangleAlert } from "lucide-react";
import { cn } from "@/lib/cn";

export function ErrorState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-card border border-danger-line bg-danger-soft/50 px-6 py-9 text-center",
        className,
      )}
    >
      <span className="grid size-11 place-items-center rounded-full border border-danger-line bg-danger-soft">
        <TriangleAlert className="size-5 text-danger" aria-hidden="true" />
      </span>
      <h3 className="text-h3 font-semibold text-ink">{title}</h3>
      <p className="max-w-md text-small leading-relaxed text-muted">{description}</p>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}
