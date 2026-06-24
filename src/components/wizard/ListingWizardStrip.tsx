"use client";

import { Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import type { WizardQuickReply } from "@/lib/listing-wizard";
import type { WizardThreadMessage } from "@/hooks/useListingWizard";

interface ListingWizardStripProps {
  intro: string;
  questions?: string[];
  thread?: WizardThreadMessage[];
  quickReplies?: WizardQuickReply[];
  onWizardReply?: (reply: WizardQuickReply) => void;
  className?: string;
}

export function ListingWizardStrip({
  intro,
  questions = [],
  thread = [],
  quickReplies = [],
  onWizardReply,
  className,
}: ListingWizardStripProps) {
  return (
    <div
      className={cn(
        "mb-4 space-y-3 rounded-xl border border-[#c7d7fe] bg-gradient-to-br from-[#eef2ff] to-[#f0fdf4] p-4",
        className
      )}
    >
      <div className="flex items-start gap-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1a56db] text-white">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#1a56db]">
            VAUTO vedlys
          </p>
          <p className="text-sm leading-relaxed text-[#1e293b]">{intro}</p>
          {questions.map((q) => (
            <p key={q} className="text-sm leading-relaxed text-[#334155]">
              {q}
            </p>
          ))}
          {thread.map((m, i) => (
            <div
              key={`${m.role}-${i}`}
              className={cn(
                "rounded-lg px-3 py-2 text-sm",
                m.role === "user"
                  ? "ml-6 bg-white text-[#1e293b]"
                  : "bg-[#dbeafe] text-[#1e3a5f]"
              )}
            >
              {m.text}
            </div>
          ))}
        </div>
      </div>

      {quickReplies.length > 0 && onWizardReply && (
        <div className="flex flex-wrap gap-2 pl-10">
          {quickReplies.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => onWizardReply(r)}
              className="min-h-[40px] rounded-full border border-[#93c5fd] bg-white px-4 py-2 text-sm font-medium text-[#1d4ed8] transition hover:bg-[#eff6ff]"
            >
              {r.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ListingWizardStripLoading() {
  return (
    <div className="mb-4 flex items-center gap-2 rounded-xl border border-[#e5e7eb] bg-[#f9fafb] px-4 py-3 text-sm text-[#6b7280]">
      <Loader2 className="h-4 w-4 animate-spin" />
      VAUTO vedlys analizuoja skelbimą…
    </div>
  );
}
