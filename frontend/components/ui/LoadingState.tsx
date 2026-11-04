import { cn } from "@/lib/cn";

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
        <span className="size-5 animate-pulse rounded-full bg-surface-2" aria-hidden="true" />
        {description ? <p className="text-sm">{description}</p> : null}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "space-y-3 rounded-panel border border-line bg-surface p-5",
        className,
      )}
    >
      {description ? (
        <p className="text-sm text-muted">{description}</p>
      ) : null}
      {Array.from({ length: lines }).map((_, index) => (
        <div
          key={index}
          className="h-3 animate-pulse rounded-full bg-surface-2"
          style={{ width: `${80 + ((index + 1) * 7) % 60}%` }}
        />
      ))}
    </div>
  );
}
