"use client";

import { Sparkles } from "lucide-react";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { AgentChatBubble, AgentQuickReplyChips } from "@/components/home/AgentChatBubble";
import { AgentTypingIndicator } from "@/components/home/AgentTypingIndicator";
import { useVautoAgent } from "@/context/VautoAgentContext";
import { extractAgentQuickReplies } from "@/lib/agent-reply-display";
import { resolveVisibleAgentBubbles } from "@/lib/agent-chat-layout";
import { safeMessageKey, safeMessageText } from "@/lib/agent-message-safe";
import { looksLikeClothingListing } from "@/lib/clothing-catalog";
import { pushAddListing } from "@/lib/listing-navigation";
import { detectSellerListingIntent } from "@/lib/scoring";
import { notifyAgentFlow } from "@/lib/vauto-agent-client";

/**
 * Organiškas AI dialogas namų ekrane — vienas supervisor burbulas per turną.
 */
export function AgentChatStrip() {
  const router = useRouter();
  const { messages, busy, streamThinkingLabel, sendAgentMessage } = useVautoAgent();

  const visibleMessages = useMemo(
    () => resolveVisibleAgentBubbles(messages),
    [messages]
  );

  const lastUser = useMemo(
    () => visibleMessages.find((m) => m.role === "user")?.text ?? "",
    [visibleMessages]
  );

  const lastAssistantMessage = useMemo(
    () => [...visibleMessages].reverse().find((m) => m.role === "assistant"),
    [visibleMessages]
  );

  const lastAssistant = lastAssistantMessage?.text ?? "";

  const quickReplies = useMemo(() => {
    if (busy) return [];
    const structured = lastAssistantMessage?.quickReplies?.filter(Boolean) ?? [];
    if (structured.length >= 2) return structured.slice(0, 4);
    return extractAgentQuickReplies(lastAssistant);
  }, [busy, lastAssistant, lastAssistantMessage?.quickReplies]);

  const sellCta = useMemo(() => {
    if (busy) return null;
    const userWantsSell = detectSellerListingIntent(lastUser);
    const assistantSuggestsSell =
      /\b(parduot|skelb|įkelt|ikelt|spint|pradėkime|pradekime|kelkime|formą|forma|nufotografuok|paruošiu skelbim)\w*/i.test(
        lastAssistant
      );
    const assistantSuggestsClarify =
      /\b(ar norite|ar parduodate|pasirinkite|patikslinkite|ką norite)\b/i.test(
        lastAssistant
      );
    if (assistantSuggestsClarify && quickReplies.length >= 2) return null;
    if (!userWantsSell && !assistantSuggestsSell) return null;
    const fashion = looksLikeClothingListing(`${lastUser} ${lastAssistant}`);
    return {
      fashion,
      label: fashion ? "Atidaryti Spintos įkėlimą" : "Atidaryti skelbimo formą",
    };
  }, [busy, lastUser, lastAssistant, quickReplies.length]);

  const handleSellCta = () => {
    const query = lastUser.trim();
    if (!query) return;
    const fashion = Boolean(sellCta?.fashion);
    if (fashion) {
      notifyAgentFlow({ kind: "listing_wizard_opened", category: "clothing" });
    }
    pushAddListing(router, fashion);
    void sendAgentMessage(query, { fromSearchBar: false });
  };

  const handleQuickReply = (option: string) => {
    void sendAgentMessage(option);
  };

  if (!visibleMessages.length && !busy) return null;

  return (
    <div
      className="agent-chat-strip relative z-20 mt-3 mb-[max(0.5rem,env(safe-area-inset-bottom,0px))] rounded-2xl border border-[var(--vauto-primary)]/15 bg-[var(--vauto-card-bg)] px-3.5 py-3 shadow-sm"
      aria-live="polite"
      aria-label="VAUTO asistento atsakymas"
    >
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--vauto-primary)]">
        <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />
        VAUTO asistentas
      </div>

      <div className="space-y-2.5">
        {visibleMessages.map((m, i) => {
          const display = safeMessageText(m.text);
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

        {busy && <AgentTypingIndicator label={streamThinkingLabel} />}
      </div>

      {sellCta && (
        <button
          type="button"
          onClick={handleSellCta}
          className="relative z-30 mt-3 flex w-full min-h-[44px] touch-manipulation items-center justify-center gap-2 rounded-xl bg-[var(--vauto-primary)] px-4 py-3 text-sm font-semibold text-[var(--vauto-primary-contrast)] shadow-sm transition hover:opacity-95 active:scale-[0.99]"
        >
          <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
          {sellCta.label}
        </button>
      )}
    </div>
  );
}
