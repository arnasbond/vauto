"use client";

import { Sparkles } from "lucide-react";
import { useVautoAgent } from "@/context/VautoAgentContext";
import { AI_FIRST_SEARCH_EXAMPLES } from "@/lib/ai-first-search-vision";

/**
 * P7c-full — replaces deep category menu tree with AI-first browse hints.
 * User reaches any vertical via free-text in FlowAgentComposer / SearchBar.
 */
export function AiFirstBrowsePrompt() {
  const { sendAgentMessage, busy } = useVautoAgent();

  return (
    <section
      className="vauto-dashboard-card mb-6 rounded-2xl border border-[var(--vauto-border)] p-4"
      aria-label="AI paieškos pavyzdžiai"
    >
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-[var(--vauto-primary)]" aria-hidden />
        <h2 className="text-sm font-bold text-[var(--vauto-text-main)]">
          AI paieška — rašykite laisvai
        </h2>
      </div>
      <p className="mb-3 text-xs leading-relaxed text-[var(--vauto-text-muted)]">
        Kategorijų meniu nebereikia. Tiesiog aprašykite, ko ieškote — agentas pats
        pritaikys filtrus ir patikslins, jei rezultatų per daug ar per mažai.
      </p>
      <div className="flex flex-col gap-2">
        {AI_FIRST_SEARCH_EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            disabled={busy}
            onClick={() => void sendAgentMessage(example)}
            className="rounded-xl border border-[var(--vauto-border)] bg-[color-mix(in_srgb,var(--vauto-primary)_6%,transparent)] px-3 py-2.5 text-left text-sm font-medium text-[var(--vauto-text-main)] transition hover:border-[var(--vauto-primary)] hover:bg-[color-mix(in_srgb,var(--vauto-primary)_12%,transparent)] disabled:opacity-50"
          >
            {example}
          </button>
        ))}
      </div>
    </section>
  );
}
