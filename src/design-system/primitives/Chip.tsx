"use client";

import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import { cn } from "../utils";

export type ChipTone = "neutral" | "primary" | "success" | "warning" | "danger" | "ai";

export type ChipProps = {
  tone?: ChipTone;
  /** Pill (full radius) vs rounded-square chip. */
  variant?: "pill" | "chip";
  active?: boolean;
  className?: string;
  children: ReactNode;
  style?: CSSProperties;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  ["aria-label"]?: string;
  role?: string;
  ["aria-pressed"]?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>;

const TONE: Record<ChipTone, string> = {
  neutral:
    "border-[var(--ds-border-subtle)] bg-[var(--ds-surface-card)] text-[var(--ds-text-secondary)] hover:bg-[var(--ds-surface-muted)]",
  primary:
    "border-[var(--ds-brand)]/30 bg-[var(--ds-brand-soft)] text-[var(--ds-brand)] hover:bg-[color-mix(in_srgb,var(--ds-brand)_16%,var(--ds-surface-card))]",
  success:
    "border-[color-mix(in_srgb,var(--ds-success)_35%,var(--ds-border-subtle))] bg-[var(--ds-success-soft)] text-[var(--ds-success)]",
  warning:
    "border-[color-mix(in_srgb,var(--ds-warning)_35%,var(--ds-border-subtle))] bg-[var(--ds-warning-soft)] text-[var(--ds-warning)]",
  danger:
    "border-[color-mix(in_srgb,var(--ds-danger)_35%,var(--ds-border-subtle))] bg-[var(--ds-danger-soft)] text-[var(--ds-danger)]",
  ai: "border-[color-mix(in_srgb,var(--ds-ai)_25%,var(--ds-border-subtle))] bg-[var(--ds-ai-soft)] text-[var(--ds-ai-strong)]",
};

/**
 * VAUTO Chip / Pill (Stage 17D). Pill = full radius (filters, tags);
 * chip = rounded-square (category/facet). Consistent active/hover/focus
 * states plus reduced-motion handling inherited from `ds-control-motion`.
 */
export function Chip({
  tone = "neutral",
  variant = "pill",
  active = false,
  className,
  children,
  type = "button",
  ...rest
}: ChipProps) {
  const activeCls = active
    ? "border-[var(--ds-brand)] bg-[color-mix(in_srgb,var(--ds-brand)_12%,var(--ds-surface-card))] !text-[var(--ds-brand)]"
    : "";
  return (
    <button
      type={type}
      aria-pressed={rest["aria-pressed"] ?? active}
      className={cn(
        "ds-focusable ds-control-motion inline-flex items-center gap-1 font-semibold",
        "rounded-[var(--ds-radius-full)] border px-3 py-1.5 text-[length:var(--ds-text-caption-size)] leading-snug",
        variant === "chip" && "rounded-[var(--ds-radius-control)]",
        TONE[tone],
        active ? activeCls : undefined,
        rest.disabled && "cursor-not-allowed opacity-50",
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
