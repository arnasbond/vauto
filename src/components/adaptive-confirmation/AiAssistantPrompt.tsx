"use client";

import { Sparkles } from "lucide-react";

interface AiAssistantPromptProps {
  message: string;
}

/** Friendly Vauto AI chat-bubble when category-specific fields are missing */
export function AiAssistantPrompt({ message }: AiAssistantPromptProps) {
  return (
    <div className="mb-4 flex gap-2.5 transition-opacity duration-300">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--vauto-teal)]/20">
        <Sparkles className="h-4 w-4 text-[var(--vauto-teal)]" />
      </div>
      <div className="relative max-w-[90%] rounded-2xl rounded-tl-md bg-[var(--vauto-teal)]/15 px-4 py-3 text-sm leading-relaxed text-teal-100">
        <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--vauto-teal)]">
          Vauto AI
        </p>
        {message}
        <span className="mt-2 block text-xs text-slate-400">
          Galite įvesti ar patikslinti informaciją žemiau.
        </span>
      </div>
    </div>
  );
}
