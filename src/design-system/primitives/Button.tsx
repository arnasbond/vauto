"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn, DS_CONTROL_SIZE, type DsSize } from "../utils";

export type DsButtonVariant =
  | "primary"
  | "secondary"
  | "tertiary"
  | "ghost"
  | "danger"
  | "ai";

export type DsButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: DsButtonVariant;
  size?: DsSize;
  loading?: boolean;
  iconOnly?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
};

const VARIANT: Record<DsButtonVariant, string> = {
  primary:
    "bg-[var(--ds-brand)] text-[var(--ds-brand-contrast)] hover:bg-[var(--ds-brand-hover)] shadow-[var(--ds-shadow-xs)]",
  secondary:
    "border border-[var(--ds-border-strong)] bg-[var(--ds-surface-card)] text-[var(--ds-text-primary)] hover:bg-[var(--ds-surface-muted)]",
  tertiary:
    "border border-[var(--ds-border-subtle)] bg-transparent text-[var(--ds-text-primary)] hover:bg-[var(--ds-surface-muted)]",
  ghost:
    "bg-transparent text-[var(--ds-text-secondary)] hover:bg-[var(--ds-surface-muted)] hover:text-[var(--ds-text-primary)]",
  danger:
    "bg-[var(--ds-danger)] text-[var(--ds-danger-contrast)] hover:bg-[var(--ds-danger)]/90 shadow-[var(--ds-shadow-xs)]",
  ai: "text-[var(--ds-ai-contrast)] shadow-[var(--ds-shadow-xs)] [background:var(--ds-ai-gradient)] hover:opacity-90",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  iconOnly = false,
  leftIcon,
  rightIcon,
  className,
  disabled,
  children,
  type = "button",
  ...rest
}: DsButtonProps) {
  const s = DS_CONTROL_SIZE[size];
  const isDisabled = disabled || loading;

  return (
    <button
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={cn(
        "ds-focusable ds-control-motion inline-flex items-center justify-center font-semibold",
        "rounded-[var(--ds-radius-control)]",
        s.height,
        s.text,
        s.gap,
        iconOnly ? "aspect-square px-0 w-auto min-w-[2.25rem] min-h-9" : s.paddingX,
        VARIANT[variant],
        isDisabled && "cursor-not-allowed opacity-[var(--ds-disabled-opacity)] hover:opacity-[var(--ds-disabled-opacity)]",
        !isDisabled && "active:scale-[0.99]",
        className
      )}
      {...rest}
    >
      {loading ? (
        <Loader2 className={cn(s.icon, "animate-spin")} aria-hidden />
      ) : (
        leftIcon
      )}
      {!iconOnly && <span>{children}</span>}
      {iconOnly && !loading && (children ?? leftIcon)}
      {!loading && !iconOnly && rightIcon}
    </button>
  );
}
