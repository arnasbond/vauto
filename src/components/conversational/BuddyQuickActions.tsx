"use client";

import type { BuddyQuickAction } from "@/lib/buddy-messages";

interface BuddyQuickActionsProps {
  actions: BuddyQuickAction[];
  onAction: (id: BuddyQuickAction["id"]) => void;
}

const variantClass: Record<BuddyQuickAction["variant"], string> = {
  primary:
    "bg-[var(--vauto-orange)] text-white shadow-lg shadow-[var(--vauto-orange)]/25 hover:brightness-110",
  secondary:
    "bg-white/10 text-white ring-1 ring-white/15 hover:bg-white/15",
  danger:
    "bg-red-500/20 text-red-200 ring-1 ring-red-500/30 hover:bg-red-500/30",
};

export function BuddyQuickActions({ actions, onAction }: BuddyQuickActionsProps) {
  if (!actions.length) return null;

  return (
    <div className="mt-4 flex flex-col gap-3">
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          onClick={() => onAction(action.id)}
          className={`flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-2xl px-5 py-3.5 text-base font-bold transition active:scale-[0.98] ${variantClass[action.variant]}`}
        >
          <span className="text-xl" aria-hidden>
            {action.emoji}
          </span>
          {action.label}
        </button>
      ))}
    </div>
  );
}
