import { LayoutDashboard, SearchX } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center py-10">
      <section className="card relative w-full max-w-lg overflow-hidden p-8 text-center">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-16 -top-20 size-48 rounded-full bg-accent/10 blur-3xl"
        />
        <div className="relative">
          <span className="mx-auto grid size-14 place-items-center rounded-panel border border-accent-line bg-accent-soft text-accent">
            <SearchX className="size-6" aria-hidden="true" />
          </span>
          <p className="label mt-5 text-accent">404</p>
          <h1 className="mt-2 text-h2 font-semibold text-ink">
            This page is not on the floor
          </h1>
          <p className="mx-auto mt-2 max-w-sm text-body leading-relaxed text-muted">
            The link may be old, or the page may have moved. Everything you need is one
            step away.
          </p>
          <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
            <ButtonLink href="/">
              <LayoutDashboard className="size-4" aria-hidden="true" />
              Back to Overview
            </ButtonLink>
            <ButtonLink href="/trading-floor" variant="secondary">
              Watch a negotiation
            </ButtonLink>
          </div>
        </div>
      </section>
    </div>
  );
}
