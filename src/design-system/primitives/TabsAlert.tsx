"use client";

import type { ReactNode } from "react";
import { cn } from "../utils";

export type TabItem = { id: string; label: string; disabled?: boolean };

export type TabsProps = {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
};

export function Tabs({ items, value, onChange, className }: TabsProps) {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex gap-1 rounded-[var(--ds-radius-control)] bg-[var(--ds-surface-muted)] p-1",
        className
      )}
    >
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={item.disabled}
            onClick={() => onChange(item.id)}
            className={cn(
              "ds-focusable rounded-[calc(var(--ds-radius-control)-2px)] px-3 py-1.5 text-[length:var(--ds-text-body-sm-size)] font-semibold transition-colors duration-[var(--ds-duration-fast)] disabled:opacity-50",
              active
                ? "bg-[var(--ds-surface-card)] text-[var(--ds-text-primary)] shadow-[var(--ds-shadow-xs)]"
                : "text-[var(--ds-text-muted)] hover:text-[var(--ds-text-primary)]"
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export type AlertTone = "info" | "success" | "warning" | "danger" | "ai";

export type AlertProps = {
  tone?: AlertTone;
  title: string;
  children?: ReactNode;
  className?: string;
};

const ALERT: Record<AlertTone, string> = {
  info: "border-[var(--ds-info)]/30 bg-[var(--ds-info-soft)] text-[var(--ds-info)]",
  success:
    "border-[var(--ds-success)]/30 bg-[var(--ds-success-soft)] text-[var(--ds-success)]",
  warning:
    "border-[var(--ds-warning)]/30 bg-[var(--ds-warning-soft)] text-[var(--ds-warning)]",
  danger:
    "border-[var(--ds-danger)]/30 bg-[var(--ds-danger-soft)] text-[var(--ds-danger)]",
  ai: "border-[var(--ds-ai)]/30 bg-[var(--ds-ai-soft)] text-[var(--ds-ai-strong)]",
};

export function Alert({
  tone = "info",
  title,
  children,
  className,
}: AlertProps) {
  return (
    <div
      role="status"
      className={cn(
        "rounded-[var(--ds-radius-card)] border px-4 py-3",
        ALERT[tone],
        className
      )}
    >
      <p className="text-[length:var(--ds-text-body-sm-size)] font-semibold">
        {title}
      </p>
      {children ? (
        <div className="mt-1 text-[length:var(--ds-text-body-sm-size)] opacity-90">
          {children}
        </div>
      ) : null}
    </div>
  );
}
