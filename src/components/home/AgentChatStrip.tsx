"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { AgentChatBubble, AgentQuickReplyChips } from "@/components/home/AgentChatBubble";
import { useVautoAgent } from "@/context/VautoAgentContext";
import { useVauto } from "@/context/VautoContext";
import {
  extractAgentQuickReplies,
  isProactiveInternalAgentText,
  sanitizeAgentReplyForDisplay,
} from "@/lib/agent-reply-display";
import { looksLikeClothingListing } from "@/lib/clothing-catalog";
import { pushAddListing } from "@/lib/listing-navigation";
import { detectSellerListingIntent } from "@/lib/scoring";

/**
 * Organiškas AI dialogas namų ekrane — burbulai, greiti atsakymai, veikiantys CTA.
 */
export function AgentChatStrip() {
  const router = useRouter();
  const { messages, busy, sendAgentMessage } = useVautoAgent();
  const { startListingFromQuery } = useVauto();

  const visibleMessages = useMemo(
    () => messages.filter((m) => !isProactiveInternalAgentText(m.text)).slice(-3),
    [messages]
  );

  const lastUser = useMemo(
    () =>
      [...messages]
        .reverse()
        .find((m) => m.role === "user" && !isProactiveInternalAgentText(m.text))?.text ?? "",
    [messages]
  );

  const lastAssistant = useMemo(() => {
    const raw = [...messages]
      .reverse()
      .find((m) => m.role === "assistant")?.text;
    return raw ? sanitizeAgentReplyForDisplay(raw) || raw : "";
  }, [messages]);

  const quickReplies = useMemo(
    () => (busy ? [] : extractAgentQuickReplies(lastAssistant)),
    [busy, lastAssistant]
  );

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
    pushAddListing(router, sellCta?.fashion);
    if (lastUser.trim()) startListingFromQuery(lastUser);
  };

  const handleQuickReply = (option: string) => {
    void sendAgentMessage(option);
  };

  if (!visibleMessages.length && !busy) return null;

  return (
    <div
      className="agent-chat-strip relative z-20 mt-3 rounded-2xl border border-[var(--vauto-primary)]/15 bg-[var(--vauto-card-bg)] px-3.5 py-3 shadow-sm"
      aria-live="polite"
      aria-label="VAUTO asistento atsakymas"
    >
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--vauto-primary)]">
        <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />
        VAUTO asistentas
      </div>

      <div className="space-y-2.5">
        {visibleMessages.map((m, i) => {
          const display =
            m.role === "assistant"
              ? sanitizeAgentReplyForDisplay(m.text) || m.text
              : m.text;
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
                display
              )}
            </AgentChatBubble>
          );
        })}

        {busy && (
          <p className="flex items-center gap-2 px-1 text-[12px] text-[var(--vauto-text-muted)]">
            <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
            Galvoju…
          </p>
        )}
      </div>

      {quickReplies.length > 0 && (
        <AgentQuickReplyChips
          options={quickReplies}
          disabled={busy}
          onSelect={handleQuickReply}
        />
      )}

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
