"use client";

import { Check, Search, Tag } from "lucide-react";
import { cn } from "@/lib/cn";

export type ZeroUiIntentKind = "search" | "listing" | "clarify";

interface ZeroUiIntentAckProps {
  summary: string;
  intent: ZeroUiIntentKind;
  className?: string;
}

const INTENT_META: Record<
  ZeroUiIntentKind,
  { label: string; icon: typeof Search; tone: string }
> = {
  search: { label: "Paieška", icon: Search, tone: "bg-[#eef6ff] text-[#1167b1] border-[#bfdbfe]" },
  listing: { label: "Naujas skelbimas", icon: Tag, tone: "bg-[#ecfdf5] text-[#047857] border-[#a7f3d0]" },
  clarify: { label: "Patikslinimas", icon: Search, tone: "bg-[#fff7ed] text-[#c2410c] border-[#fed7aa]" },
};

export function ZeroUiIntentAck({ summary, intent, className }: ZeroUiIntentAckProps) {
  const meta = INTENT_META[intent];
  const Icon = meta.icon;

  return (
    <div
      className={cn(
        "zero-ui-intent-ack flex items-start gap-3 rounded-2xl border px-4 py-3 shadow-sm",
        meta.tone,
        className
      )}
      role="status"
      aria-live="polite"
    >
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/80 shadow-sm">
        <Check className="h-4 w-4" strokeWidth={2.5} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5 opacity-80" />
          <span className="text-[11px] font-bold uppercase tracking-wide opacity-90">
            {meta.label} atpažinta
          </span>
        </div>
        <p className="text-sm font-medium leading-snug text-[#111827]">{summary}</p>
      </div>
    </div>
  );
}
