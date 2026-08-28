import type { ButtonHTMLAttributes, ReactNode } from "react";

type BrandButtonVariant = "primary" | "secondary" | "ghost";

type BrandButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: BrandButtonVariant;
  children: ReactNode;
};

const VARIANT_CLASS: Record<BrandButtonVariant, string> = {
  primary:
    "bg-[var(--vauto-primary)] text-[var(--vauto-primary-contrast)] hover:opacity-90",
  secondary:
    "border border-[var(--vauto-border-input)] bg-[var(--vauto-card-bg)] text-[var(--vauto-ink)] hover:bg-[var(--vauto-surface-page)]",
  ghost:
    "border border-[var(--vauto-border-input)] bg-transparent text-[var(--vauto-ink)] hover:bg-[var(--vauto-surface-page)]",
};

/** Shared primary/secondary CTA for redesign surfaces. */
export function BrandButton({
  variant = "primary",
  className = "",
  type = "button",
  children,
  ...rest
}: BrandButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50 ${VARIANT_CLASS[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
