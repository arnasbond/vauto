"use client";

import { useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { AgentChatBubble, AgentQuickReplyChips } from "@/components/home/AgentChatBubble";
import { AgentTypingIndicator } from "@/components/home/AgentTypingIndicator";
import { PrePublishListingCard } from "@/components/home/PrePublishListingCard";
import { AiCommandBar } from "@/components/search/AiCommandBar";
import { useVautoAgent } from "@/context/VautoAgentContext";
import { useAuth } from "@/context/AuthContext";
import { useVauto } from "@/context/VautoContext";
import { useSellerFlow } from "@/context/SellerFlowContext";
import { usePublishCelebration } from "@/context/PublishCelebrationContext";
import {
  isBlockedFallbackBubble,
  resolveVisibleAgentBubbles,
} from "@/lib/agent-chat-layout";
import { extractAgentQuickReplies } from "@/lib/agent-reply-display";
import { safeMessageKey, safeMessageText } from "@/lib/agent-message-safe";
import { readListingEditSession } from "@/lib/listing-edit-session";
import {
  buildPrePublishCardPayload,
  evaluatePrePublishReadiness,
} from "@/lib/pre-publish-validation";
import { runPublishSuccessCelebration } from "@/lib/publish-success-celebration";
import type { AgentChatMessage } from "@/lib/vauto-agent-client";
import type { PrePublishCardPayload } from "@/lib/pre-publish-validation";

export interface AgentChatStripProps {
  seedQuery?: string | null;
  onSeedConsumed?: () => void;
}

/**
 * Organiškas AI dialogas namų ekrane — vienas supervisor burbulas per turną.
 * Įvesties laukas fiksuotas pokalbio apačioje (ne viršuje).
 */
export function AgentChatStrip({ seedQuery, onSeedConsumed }: AgentChatStripProps) {
  const { messages, busy, streamThinkingLabel, sendAgentMessage } = useVautoAgent();
  const {
    aiDraft,
    sellerPreviewImage,
    publishListing,
    isPublishingListing,
    finishPublishedFlow,
  } = useSellerFlow();
  const { playPublishCelebration } = usePublishCelebration();
  const { isAuthenticated, authHydrated, user } = useAuth();
  const { showToast } = useVauto();
  const router = useRouter();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);

  const assistantCount = messages.filter((m) => m.role === "assistant").length;
  const domMessages: AgentChatMessage[] = resolveVisibleAgentBubbles(messages);
  const supervisorBroker = domMessages.find((m) => m.role === "assistant") ?? null;
  const renderMessages: AgentChatMessage[] =
    supervisorBroker && assistantCount > 1
      ? domMessages.filter((m) => m.role === "user" || m === supervisorBroker)
      : domMessages;

  const lastAssistantMessage = renderMessages.find((m) => m.role === "assistant");
  const lastAssistant = lastAssistantMessage?.text ?? "";

  const quickReplies =
    busy || !lastAssistantMessage
      ? []
      : (lastAssistantMessage.quickReplies?.filter(Boolean).length ?? 0) >= 2
        ? lastAssistantMessage.quickReplies!.slice(0, 4)
        : extractAgentQuickReplies(lastAssistant);

  const prePublishReadiness = useMemo(() => {
    if (!authHydrated || !aiDraft || readListingEditSession()) return null;
    return evaluatePrePublishReadiness({
      isAuthenticated,
      user,
      draft: aiDraft,
      previewImage: sellerPreviewImage,
      orderedImageUrls: aiDraft.orderedImageUrls,
    });
  }, [authHydrated, aiDraft, isAuthenticated, user, sellerPreviewImage]);

  const livePrePublishCard: PrePublishCardPayload | null = useMemo(() => {
    if (!prePublishReadiness?.ok || !aiDraft) return null;
    if ((aiDraft.price ?? 0) <= 0 || !aiDraft.title?.trim()) return null;
    return buildPrePublishCardPayload(prePublishReadiness, sellerPreviewImage);
  }, [prePublishReadiness, sellerPreviewImage, aiDraft]);

  const showPrePublishCard =
    Boolean(livePrePublishCard) &&
    !busy &&
    !isPublishingListing &&
    Boolean(aiDraft);

  const handleCardPublish = async (sourceRect: DOMRect) => {
    if (!prePublishReadiness?.ok) {
      showToast(prePublishReadiness?.blockMessage ?? "Trūksta duomenų.", "error");
      return;
    }
    const result = await publishListing();
    if (result.ok) {
      await runPublishSuccessCelebration({
        result,
        sourceRect,
        playCelebration: playPublishCelebration,
        finishPublishedFlow,
        router,
      });
    } else if (result.sessionExpired) {
      showToast(result.error ?? "Sesija nebegalioja.", "error");
    } else {
      showToast(result.error ?? "Nepavyko publikuoti.", "error");
    }
  };

  const handleCardEdit = () => {
    void sendAgentMessage("Reikia pataisyti");
  };

  const handleQuickReply = (option: string) => {
    void sendAgentMessage(option);
  };

  useEffect(() => {
    const el = messagesScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [renderMessages.length, busy, lastAssistant, showPrePublishCard]);

  const hasUserTurn = messages.some((m) => m.role === "user");
  if (!hasUserTurn && !busy) return null;

  return (
    <div
      className="agent-chat-strip relative z-20 mt-3 mb-[max(0.5rem,env(safe-area-inset-bottom,0px))] flex w-full min-w-0 flex-col rounded-2xl border border-[var(--vauto-primary)]/15 bg-[var(--vauto-card-bg)] px-3.5 py-3 shadow-sm md:mt-4 md:px-5 md:py-4"
      aria-live="polite"
      aria-label="VAUTO asistento pokalbis"
    >
      <div className="mb-2 flex shrink-0 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--vauto-primary)]">
        <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />
        VAUTO asistentas
      </div>

      <div
        ref={messagesScrollRef}
        className="agent-chat-strip-messages min-h-0 max-h-[min(52vh,28rem)] flex-1 space-y-2.5 overflow-y-auto overscroll-contain pr-0.5 md:max-h-[min(60vh,32rem)]"
      >
        {renderMessages.map((m, i) => {
          const display = safeMessageText(m.text);
          if (m.role === "assistant" && isBlockedFallbackBubble(display)) {
            return null;
          }
          const isLastAssistant =
            m.role === "assistant" && m === lastAssistantMessage && !busy;
          const messageChips =
            isLastAssistant && (m.quickReplies?.length ?? 0) >= 2
              ? m.quickReplies!
              : isLastAssistant && !showPrePublishCard
                ? quickReplies
                : [];
          const cardPayload =
            isLastAssistant && showPrePublishCard && livePrePublishCard
              ? livePrePublishCard
              : isLastAssistant
                ? m.prePublishCard ?? null
                : null;

          return (
            <div key={safeMessageKey(m.role, i, m.text)} className="w-full">
              <AgentChatBubble role={m.role}>
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
              {m.role === "assistant" && cardPayload ? (
                <div className="mt-2.5 flex w-full justify-start pl-0.5">
                  <PrePublishListingCard
                    card={cardPayload}
                    publishing={isPublishingListing}
                    onPublish={handleCardPublish}
                    onEdit={handleCardEdit}
                  />
                </div>
              ) : null}
            </div>
          );
        })}

        {busy && <AgentTypingIndicator label={streamThinkingLabel} />}
        <div ref={messagesEndRef} className="h-px shrink-0" aria-hidden />
      </div>

      <div className="agent-chat-strip-composer sticky bottom-0 z-30 mt-3 shrink-0 border-t border-[var(--vauto-primary)]/10 bg-[var(--vauto-card-bg)] pt-3 pb-[max(0.25rem,env(safe-area-inset-bottom,0px))]">
        <AiCommandBar
          placement="chat"
          seedQuery={seedQuery}
          onSeedConsumed={onSeedConsumed}
        />
      </div>
    </div>
  );
}
