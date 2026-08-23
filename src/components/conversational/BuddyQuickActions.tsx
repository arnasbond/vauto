"use client";

import type { BuddyQuickAction, BuddyActionId } from "@/lib/buddy-messages";
import { cn } from "@/lib/cn";

interface BuddyQuickActionsProps {
  actions: BuddyQuickAction[];
  onAction: (id: BuddyActionId) => void;
}

const variantClass = (variant: BuddyQuickAction["variant"]): string => {
  if (variant === "primary")
    return "bg-[var(--ds-brand)] text-[var(--ds-brand-contrast)] shadow-sm hover:bg-[var(--ds-brand-hover)]";
  if (variant === "danger")
    return "bg-[var(--ds-danger-soft)] text-[var(--ds-danger)] ring-1 ring-[var(--ds-danger)]/25 hover:brightness-95";
  return "bg-[var(--ds-surface-card)] text-[var(--ds-text-primary)] ring-1 ring-[var(--ds-border-subtle)] shadow-sm hover:bg-[var(--ds-surface-muted)]";
};

export function BuddyQuickActions({
  actions,
  onAction,
}: BuddyQuickActionsProps) {
  if (!actions.length) return null;

  return (
    <div className="mt-4 flex flex-col gap-3">
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          onClick={() => onAction(action.id)}
          className={cn(
            "flex w-full items-center justify-center gap-2.5 rounded-2xl px-5 py-3.5 font-bold transition active:scale-[0.98] duration-300",
            "min-h-[52px] text-base",
            variantClass(action.variant)
          )}
        >
          {action.emoji ? (
            <span className="text-xl" aria-hidden>
              {action.emoji}
            </span>
          ) : null}
          {action.label}
        </button>
      ))}
    </div>
  );
}
