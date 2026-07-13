"use client";

// @disk-refresh 2026-07-08T00:04 — supervisor DOM fixes



import { Sparkles } from "lucide-react";

import { AgentChatBubble, AgentQuickReplyChips } from "@/components/home/AgentChatBubble";

import { AgentTypingIndicator } from "@/components/home/AgentTypingIndicator";

import { useVautoAgent } from "@/context/VautoAgentContext";

import { useSellerFlow } from "@/context/SellerFlowContext";

import {

  isBlockedFallbackBubble,

  resolveVisibleAgentBubbles,

} from "@/lib/agent-chat-layout";

import { extractAgentQuickReplies } from "@/lib/agent-reply-display";

import { safeMessageKey, safeMessageText } from "@/lib/agent-message-safe";

import { readListingEditSession } from "@/lib/listing-edit-session";

import type { AgentChatMessage } from "@/lib/vauto-agent-client";



/**

 * Organiškas AI dialogas namų ekrane — vienas supervisor burbulas per turną.

 */

export function AgentChatStrip() {

  const { messages, busy, streamThinkingLabel, sendAgentMessage } = useVautoAgent();

  const { aiDraft, publishListing, isPublishingListing } = useSellerFlow();



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

      : (lastAssistantMessage.quickReplies?.filter(Boolean).length ?? 0) >= 2

        ? lastAssistantMessage.quickReplies!.slice(0, 4)

        : extractAgentQuickReplies(lastAssistant);



  const publishReady = (() => {

    if (busy || isPublishingListing || readListingEditSession()) return false;

    const draftReady =

      Boolean(aiDraft?.title?.trim()) &&

      Boolean(aiDraft?.description?.trim()) &&

      (aiDraft?.price ?? 0) > 0;

    const assistantReady =

      /\b(publikuoti|paruošiau skelbim|skelbimo pavadinimas|galite publikuoti|pasiruošęs skelbimas)\b/i.test(

        lastAssistant

      ) &&

      (draftReady || /\b(pavadinimas|aprašymas|kaina)\b/i.test(lastAssistant));

    return draftReady && assistantReady;

  })();



  const handlePublish = () => {

    publishListing();

  };



  const handleQuickReply = (option: string) => {

    void sendAgentMessage(option);

  };



  if (!renderMessages.length && !busy) return null;



  return (

    <div

      className="agent-chat-strip relative z-20 mt-3 mb-[max(0.5rem,env(safe-area-inset-bottom,0px))] w-full min-w-0 rounded-2xl border border-[var(--vauto-primary)]/15 bg-[var(--vauto-card-bg)] px-3.5 py-3 shadow-sm md:mt-4 md:px-5 md:py-4"

      aria-live="polite"

      aria-label="VAUTO asistento atsakymas"

    >

      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--vauto-primary)]">

        <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />

        VAUTO asistentas

      </div>



      <div className="agent-chat-strip-messages max-h-[min(52vh,28rem)] space-y-2.5 overflow-y-auto overscroll-contain pr-0.5 md:max-h-[min(60vh,32rem)]">

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



      {publishReady && (

        <button

          type="button"

          onClick={handlePublish}

          disabled={isPublishingListing}

          className="relative z-30 mt-3 flex w-full min-h-[44px] touch-manipulation items-center justify-center gap-2 rounded-xl bg-[var(--vauto-primary)] px-4 py-3 text-sm font-semibold text-[var(--vauto-primary-contrast)] shadow-sm transition hover:opacity-95 active:scale-[0.99] disabled:opacity-60"

        >

          <Sparkles className="h-4 w-4 shrink-0" aria-hidden />

          {isPublishingListing ? "Publikuojama…" : "Publikuoti skelbimą"}

        </button>

      )}

    </div>

  );

}

