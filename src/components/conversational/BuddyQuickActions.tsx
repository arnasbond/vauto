"use client";

import type { BuddyQuickAction, BuddyActionId } from "@/lib/buddy-messages";
import type { ChameleonThemeId } from "@/lib/chameleon-themes";
import { cn } from "@/lib/cn";

interface BuddyQuickActionsProps {
  actions: BuddyQuickAction[];
  onAction: (id: BuddyActionId) => void;
  classic?: boolean;
  themeId?: ChameleonThemeId;
}

const variantClass = (
  variant: BuddyQuickAction["variant"],
  classic: boolean,
  themeId: ChameleonThemeId
): string => {
  if (classic && themeId === "aruodas") {
    if (variant === "primary") return "bg-[#c62828] text-white border border-[#b71c1c]";
    if (variant === "danger") return "bg-white text-[#c62828] border border-[#ef9a9a]";
    return "bg-white text-[#424242] border border-[#e0e0e0]";
  }
  if (classic && themeId === "autoplius") {
    if (variant === "primary") return "bg-[#ea580c] text-white border border-[#c2410c]";
    if (variant === "danger") return "bg-white text-[#b91c1c] border-2 border-[#fca5a5]";
    return "bg-white text-[#1f2937] border border-[#d0d7de]";
  }
  if (classic && themeId === "skelbiu") {
    if (variant === "primary") return "bg-[#1565c0] text-white border-2 border-[#0d47a1] text-xl";
    if (variant === "danger") return "bg-white text-[#c62828] border-2 border-[#ef9a9a]";
    return "bg-[#eceff1] text-[#37474f] border-2 border-[#b0bec5]";
  }
  if (variant === "primary")
    return "bg-[var(--vauto-orange)] text-white shadow-lg shadow-[var(--vauto-orange)]/25 hover:brightness-110";
  if (variant === "danger")
    return "bg-red-50 text-red-700 ring-1 ring-red-200 hover:bg-red-100";
  return "bg-white text-slate-800 ring-1 ring-slate-200 shadow-sm hover:bg-slate-50";
};

export function BuddyQuickActions({
  actions,
  onAction,
  classic = false,
  themeId = "flux",
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
            classic ? "min-h-[52px] rounded-lg text-base" : "min-h-[52px] text-base",
            variantClass(action.variant, classic, themeId)
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
