"use client";

import { ArrowLeft, Send } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useEffect } from "react";
import { EscrowActionBlock } from "@/components/EscrowActionBlock";
import { ReportButton } from "@/components/support/ReportButton";
import { useVauto } from "@/context/VautoContext";
import { getQuickQuestions } from "@/lib/chat-helpers";
import { canReviewListing } from "@/lib/reviews";

function ChatThreadContent({ chatId }: { chatId: string }) {
  const { chats, sendMessage, user, listings, setActiveChatId, reviews, queueReviewPrompt } = useVauto();
  const [draft, setDraft] = useState("");
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

  useEffect(() => {
    setActiveChatId(chatId);
    return () => setActiveChatId(null);
  }, [chatId, setActiveChatId]);

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
    <div className="flex h-[calc(100dvh-2rem)] flex-col px-4">
      <div className="mb-4 flex items-center gap-3 border-b border-white/10 pb-3">
        <Link
          href="/chats"
          className="rounded-full p-2 text-[var(--vauto-text-muted)] hover:bg-white/5"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="font-semibold text-white">{chat.listingTitle}</h1>
          <p className="text-xs text-[var(--vauto-text-muted)]">
            {isBuyer ? "Pardavėjas" : isSeller ? "Pirkėjas" : "Pokalbis"}
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
          const isMe = msg.senderId === user.id;
          return (
            <div
              key={msg.id}
              className={`flex ${isMe ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                  isMe
                    ? "rounded-br-md bg-[var(--flux-teal)] text-[var(--flux-bg)]"
                    : "rounded-bl-md bg-white/10 text-white"
                }`}
              >
                {msg.text}
              </div>
            </div>
          );
        })}

        {chat.escrowOffered && (
          <EscrowActionBlock chat={chat} amount={listing?.price ?? 150} />
        )}
      </div>

      {isBuyer && chat.messages.length <= 2 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {quickQuestions.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => sendMessage(chatId, q)}
              className="rounded-full border border-[var(--flux-teal)]/30 bg-[var(--flux-teal)]/10 px-3 py-1.5 text-xs font-medium text-[var(--flux-teal)]"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {showReviewPrompt && (
        <div className="mb-2 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3">
          <p className="text-xs text-amber-200">
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
            className="mt-2 text-xs font-semibold text-amber-300 underline"
          >
            Palikti atsiliepimą
          </button>
        </div>
      )}

      <div className="flex gap-2 border-t border-white/10 pt-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder='Parašykite... (bandykite "perku" arba "tinka")'
          className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30 focus:ring-2 focus:ring-[var(--flux-teal)]/30"
        />
        <button
          type="button"
          onClick={handleSend}
          className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--flux-coral)] text-white transition hover:opacity-90"
          aria-label="Siųsti"
        >
          <Send className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

export function ChatThreadView({ chatId }: { chatId: string }) {
  return <ChatThreadContent chatId={chatId} />;
}

export function ChatThreadFromQuery() {
  const searchParams = useSearchParams();
  const chatId = searchParams.get("id") ?? "";
  return <ChatThreadContent chatId={chatId} />;
}
