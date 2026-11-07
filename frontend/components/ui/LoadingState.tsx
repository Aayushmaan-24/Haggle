import { cn } from "@/lib/cn";

export function Skeleton({
  className,
  rounded = "rounded-sm",
}: {
  className?: string;
  rounded?: string;
}) {
  return <span className={cn("skeleton block", rounded, className)} aria-hidden="true" />;
}

export function LoadingState({
  variant = "skeleton",
  lines = 3,
  className,
  description,
}: {
  variant?: "skeleton" | "pulse";
  lines?: number;
  className?: string;
  description?: string;
}) {
  if (variant === "pulse") {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-3 py-16 text-muted",
          className,
        )}
      >
        <span className="relative flex size-3">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-50" />
          <span className="relative inline-flex size-3 rounded-full bg-accent" />
        </span>
        {description ? <p className="text-small">{description}</p> : null}
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)} role="status" aria-busy="true">
      {description ? <p className="sr-only">{description}</p> : null}
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          className={cn("h-3", index === 0 ? "w-2/5" : index === lines - 1 ? "w-3/5" : "w-full")}
        />
      ))}
    </div>
  );
}

/** Card-shaped placeholder used while a panel's real content loads. */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn("card p-card", className)} aria-hidden="true">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-4 h-7 w-2/5" />
      <div className="mt-5 grid gap-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-11/12" />
        <Skeleton className="h-3 w-3/4" />
      </div>
    </div>
  );
}
