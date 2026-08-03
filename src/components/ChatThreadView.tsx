"use client";

import { ArrowLeft, Send } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { MessageStatusTicks } from "@/components/chat/MessageStatusTicks";
import { ChatTranslateButton } from "@/components/chat/ChatTranslateButton";
import { ShippingLabelChatCard } from "@/components/chat/ShippingLabelChatCard";
import { EscrowActionBlock } from "@/components/EscrowActionBlock";
import { AiTrustScoreBanner } from "@/components/trust/AiTrustScoreBanner";
import { ReportButton } from "@/components/support/ReportButton";
import { MagicMirrorChatBanner } from "@/components/chat/MagicMirrorChatBanner";
import { NegotiationTwinPanel } from "@/components/chat/NegotiationTwinPanel";
import { useVauto } from "@/context/VautoContext";
import { apiFetchPublicUser } from "@/lib/api/client";
import { logAnalytics } from "@/lib/analytics";
import type { TwinTemplateId } from "@/lib/twin-templates";
import {
  analyzeMagicMirrorFit,
  buyerMeasurementsFromProfile,
  garmentMeasurementsFromDraft,
  type MagicMirrorFit,
} from "@/lib/magic-mirror";
import { getQuickQuestions } from "@/lib/chat-helpers";
import { formatChatPrice, buildListingBoundChatId } from "@/lib/chat-thread-id";
import { canReviewListing } from "@/lib/reviews";
import {
  buildUserTrustScore,
  resolveSellerDisplayName,
} from "@/lib/user-trust-score";
import { displayPublicNickname } from "@/lib/profile-display";
import { sellerAvatarUrl, sellerDisplayName } from "@/lib/seller-display";
import { listingPath } from "@/lib/seo";
import type { Listing } from "@/lib/types";

interface ChatPeerCard {
  id: string;
  nickname: string | null;
  name: string | null;
  avatar: string | null;
  companyName: string | null;
}
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
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [peer, setPeer] = useState<ChatPeerCard | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chat =
    chats.find((c) => c.id === chatId) ??
    chats.find(
      (c) =>
        Boolean(c.listingId) &&
        buildListingBoundChatId(c.buyerId, c.sellerId, c.listingId) === chatId
    );
  const resolvedChatId = chat?.id ?? chatId;
  const listing = listings.find((l) => l.id === chat?.listingId);
  const quickQuestions = getQuickQuestions(listing);
  const chatPreview = chat?.messages[chat.messages.length - 1]?.text;
  const isBuyer = chat?.buyerId === user.id;
  const isSeller = chat?.sellerId === user.id;
  const peerId = isBuyer ? chat?.sellerId : chat?.buyerId;
  const reportedUserId = peerId;
  const showReviewPrompt =
    isBuyer &&
    chat &&
    listing &&
    chat.messages.length >= 3 &&
    canReviewListing(reviews, chat.listingId, user.id);

  const listingPriceLabel = listing
    ? formatChatPrice(listing.price)
    : "";

  const peerName = useMemo(() => {
    if (!chat || !peerId) return isBuyer ? "Pardavėjas" : "Pirkėjas";
    if (peer && peer.id === peerId) {
      return displayPublicNickname({
        nickname: peer.nickname ?? undefined,
        name: peer.companyName || peer.name || "Vartotojas",
      });
    }
    if (isBuyer) {
      return (
        sellerDisplayName(peerId, { listing }) ||
        resolveSellerDisplayName(peerId, listings)
      );
    }
    return "Pirkėjas";
  }, [chat, peerId, peer, isBuyer, listing, listings]);

  const peerAvatar = useMemo(() => {
    if (peer?.avatar?.trim()) return peer.avatar.trim();
    if (peerId) return sellerAvatarUrl(peerId);
    return "";
  }, [peer, peerId]);

  const listingThumb = listing?.images?.[0]?.trim() || "";

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
    if (!resolvedChatId) return;
    setActiveChatId(resolvedChatId);
    const t = window.setTimeout(() => inputRef.current?.focus(), 80);
    return () => {
      window.clearTimeout(t);
      setActiveChatId(null);
    };
  }, [resolvedChatId, setActiveChatId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat?.messages.length]);

  useEffect(() => {
    if (!peerId) {
      setPeer(null);
      return;
    }
    let cancelled = false;
    void apiFetchPublicUser(peerId).then((res) => {
      if (cancelled) return;
      if (res.ok && res.data) setPeer(res.data);
      else setPeer(null);
    });
    return () => {
      cancelled = true;
    };
  }, [peerId]);
  useEffect(() => {
    if (!isBuyer || !listing || listing.category !== "clothing") {
      setMagicMirror(null);
      return;
    }
    const buyerMeasurements = buyerMeasurementsFromProfile(user);
    const garmentMeasurements = garmentMeasurementsFromDraft(listing);
    if (!buyerMeasurements) {
      setMagicMirror(null);
      return;
    }
    let cancelled = false;
    void analyzeMagicMirrorFit({
      buyerName: user.name,
      listingTitle: listing.title,
      buyerMeasurements,
      garmentMeasurements,
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
    sendMessage(resolvedChatId, draft.trim());
    setDraft("");
  };

  const roleLabel = isBuyer ? "Pardavėjas" : isSeller ? "Pirkėjas" : "Pokalbis";
  const listingTitle = listing?.title || chat.listingTitle;

  return (
    <div
      className={
        embedded
          ? "mx-auto flex h-full min-h-[28rem] max-h-[calc(100dvh-14rem)] w-full min-w-0 flex-col overflow-hidden rounded-2xl bg-[var(--vauto-surface)] px-4 py-3 text-[var(--vauto-text)] md:px-6"
          : "mx-auto flex h-[calc(100dvh-2rem)] w-full max-w-lg flex-col px-4 md:max-w-7xl md:px-6"
      }
    >
      <div className="mb-3 flex shrink-0 items-start gap-2 border-b border-slate-200/80 pb-3">
        {!embedded && (
          <Link
            href="/chats/"
            className="mt-1 rounded-full p-2 text-[var(--vauto-text-muted)] hover:bg-[var(--vauto-border)]/40"
            aria-label="Atgal į pokalbius"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
        )}
        {listing ? (
          <Link
            href={listingPath(listing as Listing)}
            className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-[var(--vauto-border)] bg-[var(--vauto-border)]"
            aria-label="Atidaryti skelbimą"
          >
            {listingThumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={listingThumb}
                alt=""
                className="h-full w-full object-cover"
                width={48}
                height={48}
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-[10px] text-[var(--vauto-text-muted)]">
                —
              </span>
            )}
          </Link>
        ) : listingThumb ? (
          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-[var(--vauto-border)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={listingThumb}
              alt=""
              className="h-full w-full object-cover"
              width={48}
              height={48}
            />
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold text-[var(--vauto-text)]">
            {listingTitle}
          </h1>
          <p className="truncate text-[11px] font-medium text-[var(--vauto-text)]">
            {listingPriceLabel || "Kaina nenurodyta"}
          </p>
          <div className="mt-1 flex min-w-0 items-center gap-1.5">
            <div className="relative h-5 w-5 shrink-0 overflow-hidden rounded-full bg-[var(--vauto-border)]">
              {peerAvatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={peerAvatar}
                  alt=""
                  className="h-full w-full object-cover"
                  width={20}
                  height={20}
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-[9px] font-semibold text-[var(--vauto-text-muted)]">
                  {peerName.slice(0, 1).toUpperCase()}
                </span>
              )}
            </div>
            <p className="truncate text-[11px] text-[var(--vauto-text-muted)]">
              {peerName}
              <span className="text-[var(--vauto-text-muted)]/80"> · {roleLabel}</span>
            </p>
          </div>
        </div>
        <ReportButton
          variant="icon"
          listingId={chat.listingId}
          listingTitle={chat.listingTitle}
          chatId={resolvedChatId}
          reportedUserId={reportedUserId}
          chatPreview={chatPreview}
        />
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto pb-4">
        {chat.messages.map((msg) => {
          const isSystem = msg.senderId === "vauto-system";
          const isMe = !isSystem && msg.senderId === user.id;
          const translated = translations[msg.id];
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
                      : "rounded-bl-md border border-[var(--vauto-border)] bg-[var(--vauto-surface)] text-[var(--vauto-text)]"
                }`}
              >
                <span className="whitespace-pre-wrap">{msg.text}</span>
                {msg.kind === "shipping_label" && msg.shippingLabel ? (
                  <ShippingLabelChatCard message={msg} />
                ) : null}
                {translated && translated !== msg.text ? (
                  <p
                    className={`mt-2 border-t pt-2 text-xs leading-relaxed ${
                      isMe
                        ? "border-white/25 text-white/90"
                        : "border-[var(--vauto-border)] text-[var(--vauto-text-muted)]"
                    }`}
                  >
                    <span className="font-semibold">LT: </span>
                    {translated}
                  </p>
                ) : null}
                {!isSystem ? (
                  <ChatTranslateButton
                    text={msg.text}
                    isOwn={isMe}
                    onTranslated={(t) =>
                      setTranslations((prev) => ({ ...prev, [msg.id]: t }))
                    }
                  />
                ) : null}
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

        {isBuyer && sellerTrust ? (
          <AiTrustScoreBanner profile={sellerTrust} />
        ) : null}

        {isBuyer &&
        magicMirror &&
        magicMirror.verdict !== "unknown" &&
        listing?.category === "clothing" ? (
          <MagicMirrorChatBanner fit={magicMirror} />
        ) : null}

        {chat.escrowOffered ||
        Boolean(listing?.allowPastomatas) ||
        Boolean(
          (chat as { escrow?: unknown }).escrow
        ) ? (
          <EscrowActionBlock chat={chat} amount={listing?.price ?? 150} />
        ) : null}
        <div ref={messagesEndRef} />
      </div>

      {isBuyer && chat.messages.length <= 2 && (
        <div className="mb-2 flex shrink-0 flex-wrap gap-2">
          {quickQuestions.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => sendMessage(resolvedChatId, q)}
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
          onUpdate={(config) => updateNegotiationTwin(resolvedChatId, config)}
          onSendTemplate={(templateId: TwinTemplateId, text: string) => {
            sendMessage(resolvedChatId, text);
            if (templateId === "escalate_human") {
              logAnalytics("twin_escalate", {
                chatId: resolvedChatId,
                listingId: listing.id,
                reason: "manual_chip",
              });
              const prev = chat.negotiationTwin;
              updateNegotiationTwin(resolvedChatId, {
                enabled: false,
                minPrice:
                  prev?.minPrice ?? listing.minNegotiationPrice ?? listing.price,
                sellerApproved: false,
                sellerConsentAt: prev?.sellerConsentAt,
                maxDiscountPercent: prev?.maxDiscountPercent,
              });
            }
          }}
        />
      )}

      {showReviewPrompt && (
        <div className="mb-2 shrink-0 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/40">
          <p className="text-xs text-amber-900 dark:text-amber-100">
            Ar pavyko susitarti dėl {chat.listingTitle}? Palikite atsiliepimą ir
            gaukite 1 nemokamą TOP iškėlimą.
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
            Įvertinti patirtį
          </button>
        </div>
      )}

      <div className="flex shrink-0 gap-2 border-t border-[var(--vauto-border)] pt-3">
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
          className="flex-1 rounded-xl border border-[var(--vauto-border)] bg-[var(--vauto-bg)] px-4 py-3 text-sm text-[var(--vauto-text)] outline-none placeholder:text-[var(--vauto-text-muted)] focus:ring-2 focus:ring-[var(--vauto-teal)]/30"
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
  const chatId = searchParams.get("id") ?? searchParams.get("thread") ?? "";
  return <ChatThreadContent chatId={chatId} />;
}
