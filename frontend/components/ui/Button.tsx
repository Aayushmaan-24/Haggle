import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "success"
  | "paypal";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  "inline-flex select-none items-center justify-center gap-2 rounded-control font-medium transition-all duration-150 active:translate-y-px active:scale-[0.995] disabled:pointer-events-none disabled:opacity-45";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.18),0_10px_28px_-16px_var(--color-accent)] hover:bg-accent-hover hover:shadow-accent",
  secondary:
    "border border-line-strong bg-surface-2/70 text-ink hover:border-line-strong hover:bg-surface-3",
  ghost: "text-muted hover:bg-surface-2 hover:text-ink",
  danger: "border border-danger-line bg-danger-soft text-danger hover:bg-danger/20",
  success:
    "bg-success text-[#04150d] shadow-[inset_0_1px_0_rgb(255_255_255/0.28),0_12px_32px_-16px_var(--color-success)] hover:brightness-110",
  paypal: "bg-paypal text-paypal-ink shadow-inset hover:brightness-105",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-[15px]",
};

export function buttonClasses(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  className?: string,
): string {
  return cn(base, variants[variant], sizes[size], className);
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return <button type={type} className={buttonClasses(variant, size, className)} {...props} />;
}

type ButtonLinkProps = {
  href: string;
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
};

/** Same visual contract as `Button`, rendered as a Next.js link. */
export function ButtonLink({
  href,
  children,
  variant = "primary",
  size = "md",
  className,
}: ButtonLinkProps) {
  return (
    <Link href={href} className={buttonClasses(variant, size, className)}>
      {children}
    </Link>
  );
}
