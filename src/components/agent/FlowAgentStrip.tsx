"use client";

import { Sparkles } from "lucide-react";
import { useMemo } from "react";
import { AgentChatBubble, AgentQuickReplyChips } from "@/components/home/AgentChatBubble";
import { AgentTypingIndicator } from "@/components/home/AgentTypingIndicator";
import { useVautoAgent } from "@/context/VautoAgentContext";
import {
  extractAgentQuickReplies,
  isProactiveInternalAgentText,
  sanitizeAgentReplyForDisplay,
} from "@/lib/agent-reply-display";
import { safeMessageKey, safeMessageText } from "@/lib/agent-message-safe";
import type { ListingCategory } from "@/lib/types";
import { cn } from "@/lib/cn";

export type FlowAgentStripVariant = "default" | "spinta";

interface FlowAgentStripProps {
  variant?: FlowAgentStripVariant;
  /** Optional category hint for aria-label */
  category?: ListingCategory;
  className?: string;
}

const VARIANT_STYLES: Record<
  FlowAgentStripVariant,
  { border: string; bg: string; accent: string; spinner: string }
> = {
  default: {
    border: "border-border",
    bg: "bg-card",
    accent: "text-primary",
    spinner: "text-primary",
  },
  spinta: {
    border: "border-border",
    bg: "bg-card",
    accent: "text-primary",
    spinner: "text-primary",
  },
};

/** Embedded agent dialogue during listing / flow wizards — global P7 strip. */
export function FlowAgentStrip({
  variant = "default",
  category,
  className,
}: FlowAgentStripProps) {
  const { messages, busy, streamThinkingLabel, sendAgentMessage } = useVautoAgent();
  const styles = VARIANT_STYLES[variant];

  const visibleMessages = useMemo(
    () =>
      messages
        .filter((m) => !isProactiveInternalAgentText(safeMessageText(m.text)))
        .slice(-4),
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

  const ariaContext =
    category === "clothing"
      ? "Spintos vedlio metu"
      : category === "vehicles"
        ? "Automobilio skelbimo vedlio metu"
        : "Skelbimo vedlio metu";

  return (
    <div
      className={cn(
        "flow-agent-strip relative z-20 mx-4 mb-4 mt-2 rounded-2xl border px-3.5 py-3 shadow-lg",
        styles.border,
        styles.bg,
        className
      )}
      aria-live="polite"
      aria-label={`VAUTO asistentas ${ariaContext}`}
    >
      <div
        className={cn(
          "mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide",
          styles.accent
        )}
      >
        <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />
        VAUTO asistentas
      </div>

      <div className="space-y-2.5">
        {visibleMessages.map((m, i) => {
          const rawText = safeMessageText(m.text);
          const display =
            m.role === "assistant"
              ? sanitizeAgentReplyForDisplay(rawText) || rawText
              : rawText;
          const isLastAssistant =
            m.role === "assistant" && m === lastAssistantMessage && !busy;
          const messageChips =
            isLastAssistant && (m.quickReplies?.length ?? 0) >= 2
              ? m.quickReplies!
              : isLastAssistant
                ? quickReplies
                : [];

          return (
            <AgentChatBubble key={safeMessageKey(m.role, i, m.text)} role={m.role}>
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
          <AgentTypingIndicator className="text-slate-300" label={streamThinkingLabel} />
        )}
      </div>
    </div>
  );
}
