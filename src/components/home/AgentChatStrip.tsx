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
  isEmbeddedAgentChatVisible,
  resolveVisibleAgentBubbles,
} from "@/lib/agent-chat-layout";
import { extractAgentQuickReplies } from "@/lib/agent-reply-display";
import { safeMessageKey, safeMessageText } from "@/lib/agent-message-safe";
import { readListingEditSession } from "@/lib/listing-edit-session";
import { buildConversationalMissingPrompt } from "@/lib/listing-conversational-flow";
import {
  buildPrePublishCardPayload,
  evaluatePrePublishReadiness,
} from "@/lib/pre-publish-validation";
import { isDirectAgentActionChip } from "@/lib/direct-agent-actions";
import type { PrePublishVisibilityId } from "@/lib/listing-publish-visibility";
import { runPublishSuccessCelebration } from "@/lib/publish-success-celebration";
import type { AgentChatMessage } from "@/lib/vauto-agent-client";
import type { PrePublishCardPayload } from "@/lib/pre-publish-validation";

export interface AgentChatStripProps {
  seedQuery?: string | null;
  onSeedConsumed?: () => void;
}

function UserMessageMedia({ urls }: { urls: string[] }) {
  if (!urls.length) return null;
  return (
    <div className="mb-1.5 flex flex-wrap gap-1.5" aria-label="Prisegtos nuotraukos">
      {urls.map((url, imgIdx) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={`${url.slice(0, 48)}-${imgIdx}`}
          src={url}
          alt={`Nuotrauka ${imgIdx + 1}`}
          className="h-20 w-20 rounded-lg border border-white/25 object-cover shadow-sm sm:h-24 sm:w-24"
        />
      ))}
    </div>
  );
}

/**
 * Organiškas AI dialogas — pokalbio burbulai + galutinė skelbimo peržiūros kortelė.
 * PrePublishCard rodoma po žodinio „tinka/gerai“ patvirtinimo.
 */
export function AgentChatStrip({ seedQuery, onSeedConsumed }: AgentChatStripProps) {
  const {
    messages,
    busy,
    streamThinkingLabel,
    sendAgentMessage,
    handleDirectAgentChip,
    enterListingEditMode,
    hidePrePublishCard,
    listingPublishConfirmed,
    resetPublishSession,
  } = useVautoAgent();
  const {
    aiDraft,
    sellerPreviewImage,
    publishListing,
    isPublishingListing,
    finishPublishedFlow,
  } = useSellerFlow();
  const { playPublishCelebration } = usePublishCelebration();
  const { isAuthenticated, authHydrated, user } = useAuth();
  const { showToast, openCheckout, buyerCoords } = useVauto();
  const router = useRouter();
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const renderMessages: AgentChatMessage[] = useMemo(
    () => resolveVisibleAgentBubbles(messages),
    [messages]
  );

  const lastAssistantMessage =
    [...renderMessages].reverse().find((m) => m.role === "assistant") ?? null;
  const lastAssistant = lastAssistantMessage?.text ?? "";

  const prePublishReadiness = useMemo(() => {
    if (!authHydrated || !aiDraft || readListingEditSession()) return null;
    return evaluatePrePublishReadiness({
      isAuthenticated,
      user,
      draft: aiDraft,
      previewImage: sellerPreviewImage,
      orderedImageUrls: aiDraft.orderedImageUrls,
      geoCoords: buyerCoords,
    });
  }, [authHydrated, aiDraft, isAuthenticated, user, sellerPreviewImage, buyerCoords]);

  const livePrePublishCard: PrePublishCardPayload | null = useMemo(() => {
    if (!prePublishReadiness?.ok || !aiDraft) return null;
    if (!aiDraft.title?.trim()) return null;
    return buildPrePublishCardPayload(prePublishReadiness, sellerPreviewImage, {
      vatCode: user.vatCode,
    });
  }, [prePublishReadiness, sellerPreviewImage, aiDraft, user.vatCode]);

  const showLivePrePublishCard =
    Boolean(livePrePublishCard) &&
    (listingPublishConfirmed ||
      aiDraft?.listingFlowState === "AWAITING_CONFIRMATION") &&
    !busy &&
    !isPublishingListing &&
    !hidePrePublishCard &&
    Boolean(aiDraft);

  const quickReplies =
    busy || !lastAssistantMessage || showLivePrePublishCard
      ? []
      : (lastAssistantMessage.quickReplies?.filter(Boolean).length ?? 0) >= 2
        ? lastAssistantMessage.quickReplies!.slice(0, 4)
        : extractAgentQuickReplies(lastAssistant);

  const handleCardPublish = async (
    sourceRect: DOMRect,
    visibilityId: PrePublishVisibilityId = "standard"
  ) => {
    if (!prePublishReadiness?.ok) {
      showToast(
        prePublishReadiness
          ? buildConversationalMissingPrompt(prePublishReadiness)
          : "Papildykime skelbimą — parašykite trūkstamas detales.",
        "info"
      );
      return;
    }
    const result = await publishListing({ visibilityId });
    if (result.ok) {
      await runPublishSuccessCelebration({
        result,
        sourceRect,
        playCelebration: playPublishCelebration,
        finishPublishedFlow,
        router,
        resetPublishSession,
        openCheckout,
      });
    } else if (result.sessionExpired) {
      showToast(result.error ?? "Sesija nebegalioja.", "error");
    } else if (!result.prePublishBlocked) {
      showToast(result.error ?? "Nepavyko publikuoti.", "error");
    }
  };

  const handleCardEdit = () => {
    enterListingEditMode();
  };

  const handleDirectChip = async (option: string) => {
    if (isDirectAgentActionChip(option)) {
      const handled = await handleDirectAgentChip(option);
      if (handled) return;
    }
    void sendAgentMessage(option);
  };

  useEffect(() => {
    const el = messagesScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [renderMessages.length, busy, lastAssistant, showLivePrePublishCard]);

  if (!isEmbeddedAgentChatVisible(messages, busy)) return null;

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
          const mediaUrls = m.role === "user" ? m.imageUrls?.filter(Boolean) ?? [] : [];
          const isLastAssistant =
            m.role === "assistant" && m === lastAssistantMessage && !busy;

          const messageChips =
            isLastAssistant && !showLivePrePublishCard
              ? (m.quickReplies?.length ?? 0) >= 2
                ? m.quickReplies!
                : quickReplies
              : [];

          const cardPayload =
            isLastAssistant && showLivePrePublishCard && livePrePublishCard
              ? livePrePublishCard
              : null;

          return (
            <div
              key={safeMessageKey(m.role, i, `${display}-${mediaUrls[0] ?? ""}`)}
              className="w-full"
            >
              <AgentChatBubble role={m.role}>
                {m.role === "user" ? (
                  <>
                    <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide opacity-70">
                      Jūs
                    </span>
                    <UserMessageMedia urls={mediaUrls} />
                    {display ? (
                      <span>{display}</span>
                    ) : mediaUrls.length ? (
                      <span className="text-[12px] opacity-80">Nuotrauka įkelta</span>
                    ) : null}
                  </>
                ) : (
                  <>
                    {display}
                    {messageChips.length > 0 && !cardPayload && (
                      <AgentQuickReplyChips
                        options={messageChips}
                        disabled={busy}
                        onSelect={(opt) => void handleDirectChip(opt)}
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
