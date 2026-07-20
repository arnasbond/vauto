"use client";

import { ArrowLeft, Send } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { MessageStatusTicks } from "@/components/chat/MessageStatusTicks";
import { EscrowActionBlock } from "@/components/EscrowActionBlock";
import { AiTrustScoreBanner } from "@/components/trust/AiTrustScoreBanner";
import { ReportButton } from "@/components/support/ReportButton";
import { MagicMirrorChatBanner } from "@/components/chat/MagicMirrorChatBanner";
import { NegotiationTwinPanel } from "@/components/chat/NegotiationTwinPanel";
import { useVauto } from "@/context/VautoContext";
import { logAnalytics } from "@/lib/analytics";
import type { TwinTemplateId } from "@/lib/twin-templates";
import {
  analyzeMagicMirrorFit,
  buyerMeasurementsFromProfile,
  garmentMeasurementsFromDraft,
  type MagicMirrorFit,
} from "@/lib/magic-mirror";
import { getQuickQuestions } from "@/lib/chat-helpers";
import { canReviewListing } from "@/lib/reviews";
import {
  buildUserTrustScore,
  resolveSellerDisplayName,
} from "@/lib/user-trust-score";

function ChatThreadContent({
  chatId,
  embedded = false,
}: {
  chatId: string;
  embedded?: boolean;
}) {
  const {
    chats,
    sendMessage,
    user,
    listings,
    setActiveChatId,
    reviews,
    queueReviewPrompt,
    updateNegotiationTwin,
  } = useVauto();
  const [draft, setDraft] = useState("");
  const [magicMirror, setMagicMirror] = useState<MagicMirrorFit | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chat = chats.find((c) => c.id === chatId);
  const listing = listings.find((l) => l.id === chat?.listingId);
  const quickQuestions = getQuickQuestions(listing);
  const chatPreview = chat?.messages[chat.messages.length - 1]?.text;
  const isBuyer = chat?.buyerId === user.id;
  const isSeller = chat?.sellerId === user.id;
  const reportedUserId = isBuyer ? chat?.sellerId : chat?.buyerId;
  const showReviewPrompt =
    isBuyer &&
    chat &&
    listing &&
    chat.messages.length >= 3 &&
    canReviewListing(reviews, chat.listingId, user.id);

  const sellerTrust = useMemo(() => {
    if (!isBuyer || !chat) return null;
    const sellerName = resolveSellerDisplayName(chat.sellerId, listings);
    return buildUserTrustScore({
      sellerId: chat.sellerId,
      sellerName,
      reviews,
      chats,
      listings,
    });
  }, [isBuyer, chat, reviews, chats, listings]);

  useEffect(() => {
    if (!chatId) return;
    setActiveChatId(chatId);
    const t = window.setTimeout(() => inputRef.current?.focus(), 80);
    return () => {
      window.clearTimeout(t);
      setActiveChatId(null);
    };
  }, [chatId, setActiveChatId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat?.messages.length]);

  useEffect(() => {
    if (!isBuyer || !listing || listing.category !== "clothing") {
      setMagicMirror(null);
      return;
    }
    let cancelled = false;
    void analyzeMagicMirrorFit({
      buyerName: user.name,
      listingTitle: listing.title,
      buyerMeasurements: buyerMeasurementsFromProfile(user),
      garmentMeasurements: garmentMeasurementsFromDraft(listing),
      listingDescription: listing.description,
    }).then((fit) => {
      if (!cancelled) setMagicMirror(fit);
    });
    return () => {
      cancelled = true;
    };
  }, [isBuyer, listing, user]);

  if (!chatId || !chat) {
    return (
      <p className="py-12 text-center text-[var(--vauto-text-muted)]">
        Pokalbis nerastas.
      </p>
    );
  }

  const handleSend = () => {
    if (!draft.trim()) return;
    sendMessage(chatId, draft.trim());
    setDraft("");
  };

  return (
    <div
      className={
        embedded
          ? "mx-auto flex h-full min-h-[28rem] max-h-[calc(100dvh-14rem)] w-full min-w-0 flex-col overflow-hidden rounded-2xl bg-white px-4 py-3 md:px-6"
          : "mx-auto flex h-[calc(100dvh-2rem)] w-full max-w-lg flex-col px-4 md:max-w-7xl md:px-6"
      }
    >
      <div className="mb-4 flex items-center gap-3 border-b border-slate-200/80 pb-3">
        {!embedded && (
        <Link
          href="/chats/"
          className="rounded-full p-2 text-[var(--vauto-text-muted)] hover:bg-[var(--vauto-border)]/40"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="truncate font-semibold text-[var(--vauto-text)]">
            {chat.listingTitle}
          </h1>
          <p className="text-xs text-[var(--vauto-text-muted)]">
            {isBuyer ? "Pardavėjas" : isSeller ? "Pirkėjas" : "Pokalbis"} · realiu laiku
          </p>
        </div>
        <ReportButton
          variant="icon"
          listingId={chat.listingId}
          listingTitle={chat.listingTitle}
          chatId={chat.id}
          reportedUserId={reportedUserId}
          chatPreview={chatPreview}
        />
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto pb-4">
        {chat.messages.map((msg) => {
          const isSystem = msg.senderId === "vauto-system";
          const isMe = !isSystem && msg.senderId === user.id;
          return (
            <div
              key={msg.id}
              className={`flex ${isMe ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                  isSystem
                    ? "rounded-md border border-[var(--vauto-border)] bg-[var(--vauto-bg)]/60 text-xs italic text-[var(--vauto-text-muted)]"
                    : isMe
                      ? "rounded-br-md bg-[var(--vauto-teal)] text-white"
                      : "rounded-bl-md bg-[var(--vauto-surface)] text-[var(--vauto-text)] border border-[var(--vauto-border)]"
                }`}
              >
                <span>{msg.text}</span>
                <span className="mt-1 flex items-center justify-end gap-0.5 text-[10px] opacity-80">
                  {new Date(msg.timestamp).toLocaleTimeString("lt-LT", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  <MessageStatusTicks message={msg} isOwn={isMe} />
                </span>
              </div>
            </div>
          );
        })}

        {isBuyer && sellerTrust && <AiTrustScoreBanner profile={sellerTrust} />}

        {isBuyer && magicMirror && listing?.category === "clothing" && (
          <MagicMirrorChatBanner fit={magicMirror} />
        )}

        {chat.escrowOffered && (
          <EscrowActionBlock chat={chat} amount={listing?.price ?? 150} />
        )}
        <div ref={messagesEndRef} />
      </div>

      {isBuyer && chat.messages.length <= 2 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {quickQuestions.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => sendMessage(chatId, q)}
              className="rounded-full border border-[var(--vauto-teal)]/30 bg-[var(--vauto-teal)]/10 px-3 py-1.5 text-xs font-medium text-[var(--vauto-teal)]"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {isSeller && listing && chat && (
        <NegotiationTwinPanel
          chat={chat}
          listingPrice={listing.price}
          listingMinNegotiationPrice={listing.minNegotiationPrice}
          onUpdate={(config) => updateNegotiationTwin(chatId, config)}
          onSendTemplate={(templateId: TwinTemplateId, text: string) => {
            sendMessage(chatId, text);
            if (templateId === "escalate_human") {
              logAnalytics("twin_escalate", {
                chatId,
                listingId: listing.id,
                reason: "manual_chip",
              });
              const prev = chat.negotiationTwin;
              updateNegotiationTwin(chatId, {
                enabled: false,
                minPrice: prev?.minPrice ?? listing.minNegotiationPrice ?? listing.price,
                sellerApproved: false,
                sellerConsentAt: prev?.sellerConsentAt,
                maxDiscountPercent: prev?.maxDiscountPercent,
              });
            }
          }}
        />
      )}

      {showReviewPrompt && (
        <div className="mb-2 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/40">
          <p className="text-xs text-amber-900 dark:text-amber-100">
            Ar pavyko susitarti dėl {chat.listingTitle}?
          </p>
          <button
            type="button"
            onClick={() =>
              queueReviewPrompt({
                listingId: chat.listingId,
                listingTitle: chat.listingTitle,
                sellerId: chat.sellerId,
              })
            }
            className="mt-2 text-xs font-semibold text-amber-800 underline dark:text-amber-200"
          >
            Palikti atsiliepimą
          </button>
        </div>
      )}

      <div className="flex gap-2 border-t border-[var(--vauto-border)] pt-3">
        <label htmlFor="chat-message-input" className="sr-only">
          Žinutė
        </label>
        <input
          ref={inputRef}
          id="chat-message-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder='Parašykite... (bandykite "perku" arba "tinka")'
          autoComplete="off"
          className="flex-1 rounded-xl border border-[var(--vauto-border)] bg-[var(--vauto-surface)] px-4 py-3 text-sm text-gray-900 outline-none placeholder:text-[#4b5563] focus:ring-2 focus:ring-[var(--vauto-teal)]/30"
        />
        <button
          type="button"
          onClick={handleSend}
          className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--vauto-orange)] text-white transition hover:opacity-90"
          aria-label="Siųsti"
        >
          <Send className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

export function ChatThreadView({
  chatId,
  embedded = false,
}: {
  chatId: string;
  embedded?: boolean;
}) {
  return <ChatThreadContent chatId={chatId} embedded={embedded} />;
}

export function ChatThreadFromQuery() {
  const searchParams = useSearchParams();
  const chatId = searchParams.get("id") ?? "";
  return <ChatThreadContent chatId={chatId} />;
}
