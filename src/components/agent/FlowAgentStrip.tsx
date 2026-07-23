"use client";

import { Sparkles } from "lucide-react";
import { AgentChatBubble, AgentQuickReplyChips } from "@/components/home/AgentChatBubble";
import { AgentChatMarkdown } from "@/components/home/AgentChatMarkdown";
import { AgentTypingIndicator } from "@/components/home/AgentTypingIndicator";
import { useVautoAgent } from "@/context/VautoAgentContext";
import { isVisionObjectSellChip } from "@/lib/vision-choice-chips";
import {
  isBlockedFallbackBubble,
  resolveVisibleAgentBubbles,
} from "@/lib/agent-chat-layout";
import { extractAgentQuickReplies } from "@/lib/agent-reply-display";
import { safeMessageKey, safeMessageText } from "@/lib/agent-message-safe";
import type { ListingCategory } from "@/lib/types";
import type { AgentChatMessage } from "@/lib/vauto-agent-client";
import { cn } from "@/lib/cn";

export type FlowAgentStripVariant = "default" | "spinta";

interface FlowAgentStripProps {
  variant?: FlowAgentStripVariant;
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

/** Embedded agent dialogue — single supervisor bubble per turn. */
export function FlowAgentStrip({
  variant = "default",
  category,
  className,
}: FlowAgentStripProps) {
  const { messages, busy, streamThinkingLabel, sendAgentMessage, handleDirectAgentChip } =
    useVautoAgent();
  const styles = VARIANT_STYLES[variant];

  const assistantCount = messages.filter((m) => m.role === "assistant").length;
  const domMessages: AgentChatMessage[] = resolveVisibleAgentBubbles(messages);
  const supervisorBroker = domMessages.find((m) => m.role === "assistant") ?? null;
  const renderMessages: AgentChatMessage[] =
    supervisorBroker && assistantCount > 1
      ? domMessages.filter(
          (m) => m.role === "user" || m === supervisorBroker
        )
      : domMessages;

  const lastAssistantMessage = renderMessages.find((m) => m.role === "assistant");
  const lastAssistant = lastAssistantMessage?.text ?? "";

  const quickReplies =
    busy || !lastAssistantMessage
      ? []
      : (lastAssistantMessage.quickReplies?.filter(Boolean).length ?? 0) >= 1
        ? lastAssistantMessage.quickReplies!.slice(0, 4)
        : extractAgentQuickReplies(lastAssistant);

  const handleQuickReply = (option: string) => {
    if (isVisionObjectSellChip(option)) {
      void handleDirectAgentChip(option);
      return;
    }
    void sendAgentMessage(option);
  };

  if (!renderMessages.length && !busy) return null;

  const ariaContext =
    category === "clothing"
      ? "Spintos vedlio metu"
      : category === "vehicles"
        ? "Automobilio skelbimo vedlio metu"
        : "Skelbimo vedlio metu";

  return (
    <div
      className={cn(
        "flow-agent-strip relative z-20 mx-4 mb-4 mt-2 min-w-0 rounded-2xl border px-3.5 py-3 shadow-lg md:mx-0 md:px-4 md:py-4",
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

      <div className="agent-chat-strip-messages max-h-[min(48vh,24rem)] space-y-2.5 overflow-y-auto overscroll-contain md:max-h-[min(70vh,36rem)]">
        {renderMessages.map((m, i) => {
          const display = safeMessageText(m.text);
          if (m.role === "assistant" && isBlockedFallbackBubble(display)) {
            return null;
          }
          const isLastAssistant =
            m.role === "assistant" && m === lastAssistantMessage && !busy;
          const messageChips =
            isLastAssistant && (m.quickReplies?.length ?? 0) >= 1
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
                  <AgentChatMarkdown text={display} />
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
