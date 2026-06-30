"use client";

import { ArrowUp, Loader2, Sparkles } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useVautoAgent } from "@/context/VautoAgentContext";
import { sanitizeAgentReplyForDisplay } from "@/lib/agent-reply-display";
import type { AgentFlowPhase } from "@/lib/agent-flow-phase";
import { cn } from "@/lib/cn";

interface FlowAgentComposerProps {
  phase: AgentFlowPhase;
  className?: string;
}

/**
 * P7b — always-on chat input dock during listing wizards.
 * Sits above BottomNav so users can keep correcting attributes via dialogue.
 */
export function FlowAgentComposer({ phase, className }: FlowAgentComposerProps) {
  const { messages, busy, sendAgentMessage } = useVautoAgent();
  const [text, setText] = useState("");

  const lastAssistant = useMemo(() => {
    const m = [...messages].reverse().find((x) => x.role === "assistant");
    if (!m?.text) return "";
    return sanitizeAgentReplyForDisplay(m.text) || m.text;
  }, [messages]);

  const placeholder =
    phase === "listing_processing"
      ? "Agentas apdoroja — galite rašyti patikslinimus…"
      : "Rašykite — pvz. „pakeisk kainą“ arba „pridėk defektus“";

  const submit = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      const trimmed = text.trim();
      if (!trimmed || busy) return;
      setText("");
      await sendAgentMessage(trimmed);
    },
    [text, busy, sendAgentMessage]
  );

  return (
    <div
      className={cn(
        "flow-agent-composer pointer-events-none fixed inset-x-0 bottom-0 z-[260]",
        className
      )}
      aria-label="VAUTO asistento įvestis"
    >
      <div className="pointer-events-auto mx-auto max-w-lg px-3 pb-[calc(5.25rem+env(safe-area-inset-bottom))]">
        {lastAssistant && phase === "listing_wizard" && (
          <p className="mb-1.5 line-clamp-2 rounded-xl border border-white/10 bg-[#131c38]/95 px-3 py-2 text-[11px] leading-snug text-slate-200 shadow-md backdrop-blur-md">
            <Sparkles className="mr-1 inline h-3 w-3 text-sky-400" aria-hidden />
            {lastAssistant.slice(0, 180)}
            {lastAssistant.length > 180 ? "…" : ""}
          </p>
        )}
        <form
          onSubmit={(e) => void submit(e)}
          className="flex items-center gap-2 rounded-2xl border border-sky-500/35 bg-[#0f172a]/95 p-1.5 pl-3.5 shadow-lg backdrop-blur-xl"
        >
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={placeholder}
            disabled={phase === "listing_processing" && busy}
            className="min-w-0 flex-1 border-none bg-transparent text-sm text-white outline-none placeholder:text-slate-400"
            enterKeyHint="send"
            aria-label="Žinutė VAUTO asistentui"
          />
          <button
            type="submit"
            disabled={!text.trim() || busy}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-600 text-white transition hover:bg-sky-500 disabled:opacity-40"
            aria-label="Siųsti žinutę"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowUp className="h-4 w-4" />
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
