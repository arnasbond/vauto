import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../utils";

export type BadgeTone =
  | "neutral"
  | "brand"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "ai"
  | "premium"
  | "category"
  | "risk-low"
  | "risk-medium"
  | "risk-high";

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
  children: ReactNode;
};

const TONE: Record<BadgeTone, string> = {
  neutral:
    "bg-[var(--ds-surface-muted)] text-[var(--ds-text-secondary)]",
  brand: "bg-[var(--ds-brand-soft)] text-[var(--ds-brand)]",
  success: "bg-[var(--ds-success-soft)] text-[var(--ds-success)]",
  warning: "bg-[var(--ds-warning-soft)] text-[var(--ds-warning)]",
  danger: "bg-[var(--ds-danger-soft)] text-[var(--ds-danger)]",
  info: "bg-[var(--ds-info-soft)] text-[var(--ds-info)]",
  ai: "bg-[var(--ds-ai-soft)] text-[var(--ds-ai-strong)]",
  premium:
    "bg-[var(--ds-premium)] text-[var(--ds-premium-contrast)]",
  category:
    "border border-[var(--ds-border-subtle)] bg-[var(--ds-surface-card)] text-[var(--ds-text-secondary)]",
  "risk-low": "bg-[var(--ds-success-soft)] text-[var(--ds-success)]",
  "risk-medium": "bg-[var(--ds-warning-soft)] text-[var(--ds-warning)]",
  "risk-high": "bg-[var(--ds-danger-soft)] text-[var(--ds-danger)]",
};

export function Badge({
  tone = "neutral",
  className,
  children,
  ...rest
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[var(--ds-radius-full)] px-2.5 py-0.5 text-[length:var(--ds-text-caption-size)] font-semibold tracking-wide",
        TONE[tone],
        className
      )}
      {...rest}
    >
      {children}
    </span>
  );
}
