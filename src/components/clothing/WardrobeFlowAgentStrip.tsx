"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useMemo } from "react";
import { AgentChatBubble, AgentQuickReplyChips } from "@/components/home/AgentChatBubble";
import { useVautoAgent } from "@/context/VautoAgentContext";
import {
  extractAgentQuickReplies,
  isProactiveInternalAgentText,
  sanitizeAgentReplyForDisplay,
} from "@/lib/agent-reply-display";

/** Agento dialogas Spintos vedlio viduje — nepertraukiamas srautas iki publikavimo. */
export function WardrobeFlowAgentStrip() {
  const { messages, busy, sendAgentMessage } = useVautoAgent();

  const visibleMessages = useMemo(
    () => messages.filter((m) => !isProactiveInternalAgentText(m.text)).slice(-4),
    [messages]
  );

  const lastAssistantMessage = useMemo(
    () => [...messages].reverse().find((m) => m.role === "assistant"),
    [messages]
  );

  const lastAssistant = useMemo(() => {
    const raw = lastAssistantMessage?.text;
    return raw ? sanitizeAgentReplyForDisplay(raw) || raw : "";
  }, [lastAssistantMessage]);

  const quickReplies = useMemo(() => {
    if (busy) return [];
    const structured = lastAssistantMessage?.quickReplies?.filter(Boolean) ?? [];
    if (structured.length >= 2) return structured.slice(0, 4);
    return extractAgentQuickReplies(lastAssistant);
  }, [busy, lastAssistant, lastAssistantMessage?.quickReplies]);

  const handleQuickReply = (option: string) => {
    void sendAgentMessage(option);
  };

  if (!visibleMessages.length && !busy) return null;

  return (
    <div
      className="wardrobe-flow-agent-strip relative z-20 mx-4 mb-4 mt-2 rounded-2xl border border-fuchsia-500/35 bg-[#131c38] px-3.5 py-3 shadow-lg"
      aria-live="polite"
      aria-label="VAUTO asistentas vedlio metu"
    >
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-fuchsia-300">
        <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />
        VAUTO asistentas
      </div>

      <div className="space-y-2.5">
        {visibleMessages.map((m, i) => {
          const display =
            m.role === "assistant"
              ? sanitizeAgentReplyForDisplay(m.text) || m.text
              : m.text;
          const isLastAssistant =
            m.role === "assistant" && m === lastAssistantMessage && !busy;
          const messageChips =
            isLastAssistant && (m.quickReplies?.length ?? 0) >= 2
              ? m.quickReplies!
              : isLastAssistant
                ? quickReplies
                : [];

          return (
            <AgentChatBubble key={`${m.role}-${i}-${m.text.slice(0, 24)}`} role={m.role}>
              {m.role === "user" ? (
                <>
                  <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide opacity-70">
                    Jūs
                  </span>
                  {display}
                </>
              ) : (
                <>
                  {display}
                  {messageChips.length > 0 && (
                    <AgentQuickReplyChips
                      options={messageChips}
                      disabled={busy}
                      onSelect={handleQuickReply}
                      embedded
                    />
                  )}
                </>
              )}
            </AgentChatBubble>
          );
        })}

        {busy && (
          <p className="flex items-center gap-2 px-1 text-[12px] text-slate-300">
            <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0 text-fuchsia-400" />
            Galvoju…
          </p>
        )}
      </div>
    </div>
  );
}
