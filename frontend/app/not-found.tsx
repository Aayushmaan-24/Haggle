import { ButtonLink } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center py-16 text-center">
      <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-faint">404</p>
      <h1 className="mt-3 text-2xl font-semibold tracking-[-0.01em] text-ink">Page not found</h1>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">
        This page does not exist.
      </p>
      <ButtonLink href="/" className="mt-6">
        Back to Overview
      </ButtonLink>
    </div>
  );
}
