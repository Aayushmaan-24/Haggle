import { cn } from "@/lib/cn";

/** Two opposing arrows: a buyer and a seller meeting in the middle. */
export function Logo({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid shrink-0 place-items-center rounded-[10px] bg-gradient-to-br from-accent-hover via-accent to-accent-pressed text-white",
        "shadow-[inset_0_1px_0_rgb(255_255_255/0.25),0_6px_18px_-8px_rgb(124_92_255/0.9)]",
        className ?? "size-8",
      )}
    >
      <svg viewBox="0 0 20 20" fill="none" className="size-[18px]">
        <path
          d="M3 7h10.5m0 0L10.5 4m3 3-3 3"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M17 13H6.5m0 0 3-3m-3 3 3 3"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
