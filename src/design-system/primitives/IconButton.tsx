"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn, DS_CONTROL_SIZE, type DsSize } from "../utils";

export type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  size?: DsSize;
  tone?: "default" | "brand" | "ai" | "danger" | "muted";
  children: ReactNode;
};

const TONE: Record<NonNullable<IconButtonProps["tone"]>, string> = {
  default:
    "border border-[var(--ds-border-subtle)] bg-[var(--ds-surface-card)] text-[var(--ds-text-primary)] hover:bg-[var(--ds-surface-muted)]",
  brand:
    "bg-[var(--ds-brand-soft)] text-[var(--ds-brand)] hover:bg-[var(--ds-brand)] hover:text-[var(--ds-brand-contrast)]",
  ai: "bg-[var(--ds-ai-soft)] text-[var(--ds-ai)] hover:opacity-90",
  danger:
    "bg-[var(--ds-danger-soft)] text-[var(--ds-danger)] hover:bg-[var(--ds-danger)] hover:text-[var(--ds-danger-contrast)]",
  muted:
    "bg-transparent text-[var(--ds-text-muted)] hover:bg-[var(--ds-surface-muted)] hover:text-[var(--ds-text-primary)]",
};

export function IconButton({
  label,
  size = "md",
  tone = "default",
  className,
  children,
  type = "button",
  ...rest
}: IconButtonProps) {
  const s = DS_CONTROL_SIZE[size];
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        "ds-focusable inline-flex items-center justify-center rounded-[var(--ds-radius-control)] transition-[background-color,color,box-shadow] duration-[var(--ds-duration-fast)] ease-[var(--ds-ease)] disabled:cursor-not-allowed disabled:opacity-50",
        s.height,
        "aspect-square",
        TONE[tone],
        className
      )}
      {...rest}
    >
      <span className={cn("inline-flex items-center justify-center", s.icon)}>
        {children}
      </span>
    </button>
  );
}
