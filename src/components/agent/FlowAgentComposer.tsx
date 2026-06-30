"use client";

import { ArrowUp, Loader2, Sparkles } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useVautoAgent } from "@/context/VautoAgentContext";
import { useFlowUiSkin } from "@/hooks/useFlowUiSkin";
import { sanitizeAgentReplyForDisplay } from "@/lib/agent-reply-display";
import type { AgentFlowPhase } from "@/lib/agent-flow-phase";
import { AI_FIRST_SEARCH_PLACEHOLDER } from "@/lib/ai-first-search-vision";
import { cn } from "@/lib/cn";

interface FlowAgentComposerProps {
  phase: AgentFlowPhase;
  className?: string;
  /** Browse dock — sits above BottomNav (z-40), not over it. */
  dockMode?: boolean;
}

/**
 * P7b/P7c — chat input dock during listing wizards + AI-first browse refinement.
 */
export function FlowAgentComposer({ phase, className, dockMode = false }: FlowAgentComposerProps) {
  const skin = useFlowUiSkin();
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
      : phase === "listing_wizard"
        ? skin.variant === "spinta"
          ? "Rašykite Spintos sekretorei — pvz. „pakeisk dydį į M“"
          : "Rašykite — pvz. „pakeisk kainą“ arba „pridėk defektus“"
        : AI_FIRST_SEARCH_PLACEHOLDER;

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

  const bottomOffset = dockMode
    ? "pb-[calc(4.75rem+env(safe-area-inset-bottom))]"
    : "pb-[calc(5.25rem+env(safe-area-inset-bottom))]";

  return (
    <div
      className={cn(
        "flow-agent-composer pointer-events-none fixed inset-x-0 bottom-0",
        dockMode ? "z-40" : "z-[260]",
        bottomOffset,
        className
      )}
      aria-label="VAUTO asistento įvestis"
    >
      <div className="mx-auto max-w-lg px-3">
        {lastAssistant &&
          (phase === "listing_wizard" || phase === "idle" || phase === "agent_chat") && (
            <p
              className={cn(
                "pointer-events-auto mb-1.5 line-clamp-2 rounded-xl border px-3 py-2 text-[11px] leading-snug text-slate-200 shadow-md backdrop-blur-md",
                skin.composerBorder,
                skin.composerBg
              )}
            >
              <Sparkles className={cn("mr-1 inline h-3 w-3", skin.composerAccentIcon)} aria-hidden />
              {lastAssistant.slice(0, 180)}
              {lastAssistant.length > 180 ? "…" : ""}
            </p>
          )}
        <form
          onSubmit={(e) => void submit(e)}
          className={cn(
            "pointer-events-auto flex items-center gap-2 rounded-2xl border p-1.5 pl-3.5 shadow-lg backdrop-blur-xl",
            skin.composerBorder,
            skin.composerBg
          )}
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
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white transition disabled:opacity-40",
              skin.composerButton
            )}
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
