"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useVautoAgent } from "@/context/VautoAgentContext";
import { sanitizeAgentReplyForDisplay } from "@/lib/agent-reply-display";

/**
 * Organiškas AI dialogas namų ekrane — 2 paskutinės eilutės, be pilno ekrano lango.
 */
export function AgentChatStrip() {
  const { messages, busy } = useVautoAgent();
  const recent = messages.slice(-2);

  if (!recent.length && !busy) return null;

  return (
    <div
      className="mt-3 rounded-2xl border border-[var(--vauto-primary)]/15 bg-[var(--vauto-card-bg)] px-3.5 py-3 shadow-sm"
      aria-live="polite"
      aria-label="VAUTO asistento atsakymas"
    >
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--vauto-primary)]">
        <Sparkles className="h-3.5 w-3.5" aria-hidden />
        VAUTO asistentas
      </div>
      <div className="space-y-2">
        {recent.map((m, i) => (
          <p
            key={`${m.role}-${i}-${m.text.slice(0, 24)}`}
            className={
              m.role === "user"
                ? "text-right text-[13px] leading-snug text-[var(--vauto-text-muted)]"
                : "text-[13px] leading-relaxed text-[var(--vauto-text-main)]"
            }
          >
            {m.role === "user" ? (
              <>
                <span className="text-[10px] font-medium text-[var(--vauto-text-muted)]">
                  Jūs:{" "}
                </span>
                {m.text}
              </>
            ) : (
              sanitizeAgentReplyForDisplay(m.text) || m.text
            )}
          </p>
        ))}
        {busy && (
          <p className="flex items-center gap-2 text-[12px] text-[var(--vauto-text-muted)]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Galvoju…
          </p>
        )}
      </div>
    </div>
  );
}
