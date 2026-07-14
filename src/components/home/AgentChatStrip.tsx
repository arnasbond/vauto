"use client";

import { useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { AgentChatBubble, AgentQuickReplyChips } from "@/components/home/AgentChatBubble";
import { AgentTypingIndicator } from "@/components/home/AgentTypingIndicator";
import { PrePublishListingCard } from "@/components/home/PrePublishListingCard";
import { PrePublishRequirementsWidget } from "@/components/home/PrePublishRequirementsWidget";
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
import {
  buildPrePublishRequirementsPayload,
  mergeRequirementsWithReadiness,
  PRE_PUBLISH_BLOCK_INTRO,
} from "@/lib/pre-publish-requirements";
import {
  isDirectAgentActionChip,
  pickListingPhotoDirect,
} from "@/lib/direct-agent-actions";
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
  const { messages, busy, streamThinkingLabel, sendAgentMessage, handleDirectAgentChip } =
    useVautoAgent();
  const {
    aiDraft,
    sellerPreviewImage,
    publishListing,
    isPublishingListing,
    finishPublishedFlow,
    updateAiDraft,
    updateSellerMedia,
  } = useSellerFlow();
  const { playPublishCelebration } = usePublishCelebration();
  const { isAuthenticated, authHydrated, user, updateUser } = useAuth();
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

  const liveRequirements = useMemo(() => {
    if (!prePublishReadiness || prePublishReadiness.ok) return null;
    return buildPrePublishRequirementsPayload(prePublishReadiness);
  }, [prePublishReadiness]);

  const quickReplies =
    busy || !lastAssistantMessage || showPrePublishCard || liveRequirements
      ? []
      : (lastAssistantMessage.quickReplies?.filter(Boolean).length ?? 0) >= 2
        ? lastAssistantMessage.quickReplies!.slice(0, 4)
        : extractAgentQuickReplies(lastAssistant);

  const handleCardPublish = async (sourceRect: DOMRect) => {
    if (!prePublishReadiness?.ok) {
      showToast(PRE_PUBLISH_BLOCK_INTRO, "info");
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
    } else if (!result.prePublishBlocked) {
      showToast(result.error ?? "Nepavyko publikuoti.", "error");
    }
  };

  const handleDirectChip = async (option: string) => {
    if (isDirectAgentActionChip(option)) {
      const handled = await handleDirectAgentChip(option);
      if (handled) return;
    }
    if (/^įkelti nuotrauk/i.test(option.trim())) {
      const dataUrl = await pickListingPhotoDirect("gallery");
      if (dataUrl) {
        updateSellerMedia({ imageDataUrl: dataUrl });
        if (aiDraft) {
          updateAiDraft({
            orderedImageUrls: [dataUrl, ...(aiDraft.orderedImageUrls ?? [])].slice(0, 6),
          });
        }
        showToast("Nuotrauka pridėta.", "success");
      }
      return;
    }
    void sendAgentMessage(option);
  };

  useEffect(() => {
    const el = messagesScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [renderMessages.length, busy, lastAssistant, showPrePublishCard, liveRequirements]);

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

          const requirementsPayload = isLastAssistant
            ? mergeRequirementsWithReadiness(
                m.prePublishRequirements ?? liveRequirements,
                prePublishReadiness
              )
            : null;

          const showRequirementsWidget = Boolean(isLastAssistant && requirementsPayload);

          const displayText =
            m.role === "assistant" && showRequirementsWidget
              ? PRE_PUBLISH_BLOCK_INTRO
              : display;

          const messageChips =
            isLastAssistant && !showPrePublishCard && !showRequirementsWidget
              ? (m.quickReplies?.length ?? 0) >= 2
                ? m.quickReplies!
                : quickReplies
              : [];

          const cardPayload =
            isLastAssistant && showPrePublishCard && livePrePublishCard
              ? livePrePublishCard
              : isLastAssistant && !showRequirementsWidget
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
                    {displayText}
                    {messageChips.length > 0 && (
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
              {m.role === "assistant" && showRequirementsWidget && requirementsPayload ? (
                <div className="mt-2.5 flex w-full justify-start pl-0.5">
                  <PrePublishRequirementsWidget
                    requirements={requirementsPayload}
                    aiDraft={aiDraft}
                    updateAiDraft={updateAiDraft}
                    updateSellerMedia={updateSellerMedia}
                    updateUser={updateUser}
                  />
                </div>
              ) : null}
              {m.role === "assistant" && cardPayload ? (
                <div className="mt-2.5 flex w-full justify-start pl-0.5">
                  <PrePublishListingCard
                    card={cardPayload}
                    publishing={isPublishingListing}
                    onPublish={handleCardPublish}
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
