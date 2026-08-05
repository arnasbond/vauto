import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../utils";

export type DsCardVariant =
  | "default"
  | "interactive"
  | "elevated"
  | "muted"
  | "ai"
  | "danger"
  | "warning";

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  variant?: DsCardVariant;
  children: ReactNode;
};

const VARIANT: Record<DsCardVariant, string> = {
  default:
    "border border-[var(--ds-border-subtle)] bg-[var(--ds-surface-card)] shadow-[var(--ds-shadow-xs)] transition-[box-shadow,border-color] duration-[var(--ds-duration-hover,160ms)] ease-[var(--ds-ease)]",
  interactive:
    "ds-card-lift border border-[var(--ds-border-subtle)] bg-[var(--ds-surface-card)] shadow-[var(--ds-shadow-xs)] hover:border-[var(--ds-border-strong)] cursor-pointer",
  elevated:
    "ds-card-lift border border-transparent bg-[var(--ds-surface-elevated)] shadow-[var(--ds-shadow-md)]",
  muted:
    "border border-transparent bg-[var(--ds-surface-muted)]",
  ai: "ds-ai-glow ds-ai-pulse border border-[var(--ds-ai)]/25 bg-[var(--ds-ai-soft)] shadow-[var(--ds-shadow-xs)]",
  danger:
    "border border-[var(--ds-danger)]/30 bg-[var(--ds-danger-soft)]",
  warning:
    "border border-[var(--ds-warning)]/30 bg-[var(--ds-warning-soft)]",
};

export function Card({
  variant = "default",
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <div
      className={cn(
        "rounded-[var(--ds-radius-card)] p-[var(--ds-space-5)] text-[var(--ds-text-primary)]",
        VARIANT[variant],
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
