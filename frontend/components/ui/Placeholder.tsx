import { cn } from "@/lib/cn";

/**
 * Temporary scaffold for screens whose real interface lands in a later phase.
 * Keep it lean and consistent with the rest of the interface; delete it as each
 * page is built.
 */
export function Placeholder({
  title,
  body,
  points,
  className,
}: {
  title: string;
  body: string;
  points?: string[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-panel border border-dashed border-lavender-linethin bg-surface/55 px-6 py-7 sm:px-8 sm:py-8",
        className,
      )}
    >
      <span className="inline-flex items-center gap-1.5 rounded-md border border-lavender-linethin bg-lavender-soft px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.08em] text-lavender">
        Scaffold
      </span>
      <h2 className="mt-4 text-base font-semibold text-ink">{title}</h2>
      <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted">{body}</p>
      {points?.length ? (
        <ul className="mt-5 grid gap-2.5 sm:grid-cols-2">
          {points.map((point) => (
            <li key={point} className="flex gap-2.5">
              <span
                className="mt-[7px] size-1.5 shrink-0 rounded-full bg-accent"
                aria-hidden="true"
              />
              <span className="text-sm leading-relaxed text-muted">{point}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
