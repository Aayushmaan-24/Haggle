import { cn } from "@/lib/cn";

export type ErrorAction = "dismiss" | "retry";

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
        "flex flex-col items-center justify-center gap-3 rounded-panel border border-danger-soft bg-danger-soft/40 px-6 py-10 text-center",
        className,
      )}
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-danger-soft">
        <svg
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-5 text-danger"
          aria-hidden="true"
        >
          <circle cx="10" cy="10" r="7.5" />
          <path d="M10 6.5v7M6.5 10h7" />
          <path d="m6.5 10 2.5 2.5L13.5 7.5" />
        </svg>
      </span>
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      <p className="max-w-sm text-sm leading-relaxed text-muted">{description}</p>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}
