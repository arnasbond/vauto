"use client";

import { Sparkles } from "lucide-react";

const ACCENT = "#d946ef";

export function ClothingWizardInlineGuide({ message }: { message: string | null }) {
  if (!message) return null;

  return (
    <div
      className="mb-4 flex gap-3 rounded-2xl border border-fuchsia-500/30 bg-[#131c38] px-3 py-3"
      role="status"
      aria-live="polite"
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white"
        style={{ backgroundColor: ACCENT }}
        aria-hidden
      >
        <Sparkles className="h-4 w-4" />
      </span>
      <p className="text-sm font-light leading-relaxed text-slate-200">{message}</p>
    </div>
  );
}
